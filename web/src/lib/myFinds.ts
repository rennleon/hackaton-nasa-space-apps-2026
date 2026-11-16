// "My detective notebook": the real changes a user found, kept in this browser only (localStorage). No server.
// Every storage access is wrapped, so the app still works when storage is blocked (the list then lives in memory).
import { useSyncExternalStore } from 'react'
import type { AnalysisResult } from '../types/contract'
import type { Route } from './route'
import { powerParamOf, sourceInfo, splitGiovanniId } from './sourceLabels'

export const FINDS_KEY = 'td.myFinds.v1'
export const MAX_FINDS = 200

/** The route params that open the result again. */
export type FindRoute = Pick<Route, 'region' | 'place' | 'theme' | 'variable' | 'season' | 'start' | 'end'>

export interface FindTest {
  name: string
  p: number
  decisive: boolean
}

export interface Find {
  /** place + variable + window + season */
  id: string
  saved_at: string
  place_label: string
  route: FindRoute
  variable_id: string
  /** Simple-view name, English */
  variable_name: string
  window_start: string
  window_end: string
  season: string | null
  /** change per 10 years, in the display units of `units` */
  slope_per_10y: number
  units: string
  ci_low: number
  ci_high: number
  decimals: number
  verdict: 'sure'
  tests: FindTest[]
  /** mission or model name, for example "AIRS (Aqua satellite)" */
  source: string
  /** dataset as the app shows it, for example "AIRS3STM v7.0 · RelHumSurf_A" */
  dataset: string
}

export function findId(r: Pick<Find, 'route' | 'window_start' | 'window_end' | 'season'>): string {
  const where = r.route.place ?? r.route.region ?? ''
  return [where, r.route.variable ?? '', `${r.window_start}..${r.window_end}`, r.season ?? 'all'].join('|')
}

function datasetOf(v: AnalysisResult['variable']): string {
  const g = v.giovanni_id ? splitGiovanniId(v.giovanni_id) : null
  if (g) return `${g.product} v${g.version} · ${g.param}`
  const power = powerParamOf(v.id)
  if (power) return `NASA POWER · ${power}`
  return v.giovanni_id ?? v.id
}

function sourceOf(v: AnalysisResult['variable']): string {
  const info = sourceInfo(v)
  const base = info.kind === 'model' ? `${info.name} (computer model)` : info.platform ? `${info.name} (${info.platform} satellite)` : info.name
  const via = (v.delivered_by ?? '').trim()
  return via && !base.includes(via) ? `${base}, via ${via}` : base
}

/** Build the record for a result that shows a real change. Returns null when there is no trend or window. */
export function findFromResult(result: AnalysisResult, route: Route, placeLabel: string, now: Date = new Date()): Find | null {
  const { trend, window: w, variable: v } = result
  if (!trend || !w || !route.variable) return null
  const found: FindRoute = { region: route.region, place: route.place, theme: route.theme, variable: route.variable, season: route.season, start: route.start, end: route.end }
  const clean = Object.fromEntries(Object.entries(found).filter(([, x]) => x)) as FindRoute
  const season = result.season?.name.simple ?? null
  return {
    id: findId({ route: clean, window_start: w.start, window_end: w.end, season }),
    saved_at: now.toISOString(),
    place_label: placeLabel,
    route: clean,
    variable_id: v.id,
    variable_name: v.name.simple,
    window_start: w.start,
    window_end: w.end,
    season,
    slope_per_10y: trend.slope_per_decade,
    units: v.units.display,
    ci_low: trend.ci_low,
    ci_high: trend.ci_high,
    decimals: v.units.decimals + 1,
    verdict: 'sure',
    tests: (result.tests ?? []).map((t) => ({ name: t.name, p: t.p, decisive: t.decisive })),
    source: sourceOf(v),
    dataset: datasetOf(v),
  }
}

// ---- storage ----

let mem: Find[] = []
let cache: { raw: string | null; list: Find[] } = { raw: null, list: [] }
const subs = new Set<() => void>()

const isFind = (x: unknown): x is Find => {
  const f = x as Find | null
  if (!f || typeof f !== 'object') return false
  const str = (v: unknown) => typeof v === 'string'
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  // every field the notebook and the report read, so an old or hand-edited entry is skipped, not a crash
  return (
    str(f.id) && str(f.saved_at) && !!f.route && typeof f.route === 'object' && str(f.variable_id) &&
    str(f.variable_name) && str(f.place_label) && str(f.window_start) && str(f.window_end) &&
    str(f.units) && str(f.source) && str(f.dataset) && Array.isArray(f.tests) &&
    num(f.slope_per_10y) && num(f.ci_low) && num(f.ci_high) && num(f.decimals)
  )
}

/** All saved finds, newest first. Never throws. The same array is returned until something changes. */
export function loadFinds(): Find[] {
  let raw: string | null
  try {
    raw = localStorage.getItem(FINDS_KEY)
  } catch {
    return mem // storage blocked: keep working in memory
  }
  if (raw === cache.raw) return (mem = cache.list)
  let list: Find[] = []
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : []
    list = Array.isArray(parsed) ? parsed.filter(isFind) : []
  } catch {
    list = []
  }
  cache = { raw, list }
  mem = list // mirror, so a later storage failure keeps the list
  return list
}

function store(list: Find[]): void {
  mem = list
  try {
    localStorage.setItem(FINDS_KEY, JSON.stringify(list))
  } catch {
    /* blocked or full: the in-memory copy still serves this visit */
  }
  subs.forEach((f) => f())
}

/** Add a find. The same id twice keeps the first one (the list never doubles up). Returns the list. */
export function saveFind(find: Find): Find[] {
  const list = loadFinds()
  if (list.some((f) => f.id === find.id)) return list
  const next = [find, ...list].slice(0, MAX_FINDS)
  store(next)
  return next
}

export function removeFind(id: string): Find[] {
  const next = loadFinds().filter((f) => f.id !== id)
  store(next)
  return next
}

export const isSaved = (id: string): boolean => loadFinds().some((f) => f.id === id)

/** Re-renders when the list changes (also from another tab). */
export function useFinds(): Find[] {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      const on = (e: StorageEvent) => {
        if (e.key === FINDS_KEY || e.key === null) f()
      }
      window.addEventListener('storage', on)
      return () => {
        subs.delete(f)
        window.removeEventListener('storage', on)
      }
    },
    loadFinds,
    loadFinds,
  )
}
