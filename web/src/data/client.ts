import type { AnalysisResult, ScanResult } from '../types/contract'
import type { GlossaryTerm, RegionCard, ThemeCard, VariableCard } from '../types/catalog'

export interface AnalyzeOptions {
  start?: string // YYYY-MM
  end?: string // YYYY-MM
  seasonId?: string
}

/** An AnalysisResult, optionally flagged when the requested custom period could not be served. */
export type AnalysisOutcome = AnalysisResult & { customPeriodUnavailable?: boolean }

export interface DataClient {
  regions(): Promise<RegionCard[]>
  themes(): Promise<ThemeCard[]>
  variables(): Promise<VariableCard[]>
  glossary(): Promise<GlossaryTerm[]>
  scan(regionId: string, themeId: string): Promise<ScanResult>
  result(regionId: string, variableId: string, seasonId?: string): Promise<AnalysisResult>
  analyze(regionId: string, variableId: string, opts: AnalyzeOptions): Promise<AnalysisOutcome>
}

export class HttpError extends Error {
  constructor(
    public status: number,
    url: string,
  ) {
    super(`HTTP ${status} for ${url}`)
  }
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new HttpError(res.status, url)
  return (await res.json()) as T
}
