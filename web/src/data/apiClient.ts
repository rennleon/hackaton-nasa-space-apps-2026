import type { AnalysisResult, ScanResult } from '../types/contract'
import type { GlossaryTerm, RegionCard, ThemeCard, VariableCard } from '../types/catalog'
import { getJson, type AnalysisOutcome, type AnalyzeOptions, type DataClient } from './client'

function qs(params: Record<string, string | undefined>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** Talks to the Python API (see README for endpoints). */
export class ApiClient implements DataClient {
  private base: string
  constructor(baseUrl: string) {
    this.base = baseUrl.replace(/\/+$/, '')
  }
  regions() {
    return getJson<RegionCard[]>(`${this.base}/regions`)
  }
  themes() {
    return getJson<ThemeCard[]>(`${this.base}/themes`)
  }
  variables() {
    return getJson<VariableCard[]>(`${this.base}/variables`)
  }
  glossary() {
    return getJson<GlossaryTerm[]>(`${this.base}/glossary`)
  }
  scan(regionId: string, themeId: string) {
    return getJson<ScanResult>(`${this.base}/regions/${regionId}/scan${qs({ theme: themeId })}`)
  }
  result(regionId: string, variableId: string, seasonId?: string) {
    return getJson<AnalysisResult>(`${this.base}/regions/${regionId}/variables/${variableId}${qs({ season: seasonId })}`)
  }
  async analyze(regionId: string, variableId: string, opts: AnalyzeOptions): Promise<AnalysisOutcome> {
    return getJson<AnalysisResult>(
      `${this.base}/regions/${regionId}/variables/${variableId}/analyze${qs({ start: opts.start, end: opts.end, season: opts.seasonId })}`,
    )
  }
}
