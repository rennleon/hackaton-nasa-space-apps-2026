// Place search by name, using the Open-Meteo Geocoding API (user-approved, no key). Only the typed text is sent.
import { useEffect, useState } from 'react'
import { getLang } from '../i18n'
import { validatePlace } from './place'

export const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'
export const MIN_CHARS = 3
export const DEBOUNCE_MS = 400

export interface GeoResult {
  id: string
  /** short name, e.g. "Cajamarca" */
  name: string
  /** the name we keep for the place, e.g. "Cajamarca, Peru" */
  label: string
  /** region and country, to tell places with the same name apart */
  detail: string
  lat: number
  lon: number
  population?: number
}

interface RawResult {
  id?: number
  name?: string
  latitude?: number
  longitude?: number
  country?: string
  country_code?: string
  admin1?: string
  population?: number
}

export function geocodeUrl(text: string): string {
  const q = new URLSearchParams({ name: text, count: '8', language: getLang() === 'es' ? 'es' : 'en', format: 'json' })
  return `${GEOCODE_URL}?${q.toString()}`
}

export async function searchPlaces(text: string, signal?: AbortSignal): Promise<GeoResult[]> {
  const res = await fetch(geocodeUrl(text), { signal })
  if (!res.ok) throw new Error(`Place search failed (${res.status})`)
  const body = (await res.json()) as { results?: RawResult[] }
  const out: GeoResult[] = []
  for (const r of body.results ?? []) {
    if (!r.name || typeof r.latitude !== 'number' || typeof r.longitude !== 'number') continue
    if (validatePlace({ kind: 'point', lat: r.latitude, lon: r.longitude })) continue
    const country = r.country ?? r.country_code ?? ''
    const region = r.admin1 && r.admin1 !== r.name ? r.admin1 : ''
    out.push({
      id: String(r.id ?? `${r.latitude},${r.longitude}`),
      name: r.name,
      label: country ? `${r.name}, ${country}` : r.name,
      detail: [region, country].filter(Boolean).join(', '),
      lat: r.latitude,
      lon: r.longitude,
      population: r.population,
    })
  }
  return out
}

export type SearchStatus = 'idle' | 'searching' | 'done' | 'error'

interface Options {
  delay?: number
  min?: number
  /** off while a result is already chosen */
  enabled?: boolean
  search?: (text: string, signal: AbortSignal) => Promise<GeoResult[]>
}

/**
 * Debounced search as you type. Needs at least `min` characters; each new keystroke cancels the wait and aborts
 * the request in flight, so a slow old answer can never replace a newer one.
 */
export function useGeocodeSearch(query: string, { delay = DEBOUNCE_MS, min = MIN_CHARS, enabled = true, search = searchPlaces }: Options = {}) {
  const text = query.trim()
  const active = enabled && text.length >= min
  const [state, setState] = useState<{ text: string; status: 'done' | 'error'; results: GeoResult[] } | null>(null)

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      search(text, controller.signal).then(
        (results) => {
          if (!controller.signal.aborted) setState({ text, status: 'done', results })
        },
        () => {
          if (!controller.signal.aborted) setState({ text, status: 'error', results: [] })
        },
      )
    }, delay)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [active, text, delay, search])

  if (!active) return { status: 'idle' as SearchStatus, results: [] as GeoResult[], tooShort: enabled && text.length > 0 && text.length < min }
  if (!state || state.text !== text) return { status: 'searching' as SearchStatus, results: [] as GeoResult[], tooShort: false }
  return { status: state.status as SearchStatus, results: state.results, tooShort: false }
}
