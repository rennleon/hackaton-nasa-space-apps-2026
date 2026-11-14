import type { AnalysisResult, ScanResult } from '../types/contract'
import type { Place } from '../lib/place'
import type { GlossaryTerm, RegionCard, ThemeCard, VariableCard } from '../types/catalog'

export interface AnalyzeOptions {
  start?: string // YYYY-MM
  end?: string // YYYY-MM
  seasonId?: string
}

/** An AnalysisResult, optionally flagged when the requested custom period could not be served. */
export type AnalysisOutcome = AnalysisResult & { customPeriodUnavailable?: boolean }

export interface DataClient {
  /** False when no live API is configured, so custom places cannot work. Missing means true. */
  readonly customPlaces?: boolean
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

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
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
