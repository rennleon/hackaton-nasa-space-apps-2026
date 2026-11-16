import type { AnalysisResult, ScanResult } from '../types/contract'
import type { Place } from '../lib/place'
import type { Bbox, ClimateGrid, ClimateParam } from '../lib/climate'
import type { GlossaryTerm, RegionCard, ThemeCard, VariableCard } from '../types/catalog'
import type { GuideAnswer } from '../lib/guideKeywords'

export interface AnalyzeOptions {
  start?: string // YYYY-MM
  end?: string // YYYY-MM
  seasonId?: string
}

/** An AnalysisResult, optionally flagged when the requested custom period could not be served. */
export type AnalysisOutcome = AnalysisResult & { customPeriodUnavailable?: boolean }

/** Questions an AI helper suggests for a place: catalog theme ids, each with a short reason. `none` = no suggestions (no key, or no live API). */
export interface SuggestRequest {
  /** the place's display name; null for an unnamed map pin */
  place: string | null
  lat: number | null
  lon: number | null
}
export interface SuggestAnswer {
  suggestions: { theme: string; why: string | null }[]
  source: 'llm' | 'none'
}

export interface DataClient {
  /** False when no live API is configured, so custom places cannot work. Missing means true. */
  readonly customPlaces?: boolean
  /** True when the three ready-made example points are served from precomputed files, with no live API. */
  readonly staticExamples?: boolean
  regions(): Promise<RegionCard[]>
  themes(): Promise<ThemeCard[]>
  variables(): Promise<VariableCard[]>
  glossary(): Promise<GlossaryTerm[]>
  scan(regionId: string, themeId: string): Promise<ScanResult>
  result(regionId: string, variableId: string, seasonId?: string): Promise<AnalysisResult>
  analyze(regionId: string, variableId: string, opts: AnalyzeOptions): Promise<AnalysisOutcome>
  /** Live NASA POWER data for a user-chosen place. Rejects with LiveDataUnavailable when the API is not reachable. */
  customScan(place: Place, themeId: string): Promise<ScanResult>
  customResult(place: Place, variableId: string, opts: { start?: string; end?: string }): Promise<AnalysisResult>
  /** Long-term average per grid cell for a 2 to 10 degree box ("where does it happen?" map layer). Optional so a client without a map layer (a test fake) still type-checks; the map then shows no colours. */
  climatology?(param: ClimateParam, bbox: Bbox): Promise<ClimateGrid>
  /** The detective guide: typed words -> the best question and its variables. Optional so a test fake still type-checks. */
  guide?(text: string, lang: string): Promise<GuideAnswer>
  /** Up to three catalog questions that fit the kind of place. Optional so a test fake still type-checks. */
  suggest?(req: SuggestRequest, lang: string): Promise<SuggestAnswer>
}

/** The live API cannot be reached (or is not configured), so a custom place cannot be served. */
export class LiveDataUnavailable extends Error {
  constructor(message = 'Live data API unavailable') {
    super(message)
    this.name = 'LiveDataUnavailable'
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    url: string,
    public detail?: string,
  ) {
    super(`HTTP ${status} for ${url}`)
  }
}

/** FastAPI sends a string for HTTPException and a list of {loc, msg} objects for validation errors. */
export function detailText(detail: unknown): string | undefined {
  if (typeof detail === 'string') return detail
  if (!Array.isArray(detail)) return undefined
  const parts = detail.map((d) => {
    if (typeof d === 'string') return d
    if (!d || typeof d !== 'object') return ''
    const { loc, msg } = d as { loc?: unknown; msg?: unknown }
    const where = Array.isArray(loc) ? loc.filter((x) => x !== 'query' && x !== 'body').join('.') : ''
    return [where, typeof msg === 'string' ? msg : ''].filter(Boolean).join(': ')
  })
  return parts.filter(Boolean).join('; ') || undefined
}

export async function getJson<T>(url: string, init?: { method: 'POST'; body: unknown }): Promise<T> {
  const res = await fetch(
    url,
    init
      ? { method: init.method, headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) }
      : { headers: { Accept: 'application/json' } },
  )
  if (!res.ok) {
    let detail: string | undefined
    try {
      detail = detailText(((await res.json()) as { detail?: unknown }).detail)
    } catch {
      /* no JSON body */
    }
    throw new HttpError(res.status, url, detail)
  }
  return (await res.json()) as T
}
