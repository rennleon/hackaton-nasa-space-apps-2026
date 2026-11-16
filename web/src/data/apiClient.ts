import type { AnalysisResult, ScanResult } from '../types/contract'
import type { GlossaryTerm, RegionCard, ThemeCard, VariableCard } from '../types/catalog'
import type { Place } from '../lib/place'
import type { Bbox, ClimateGrid, ClimateParam } from '../lib/climate'
import { getJson, type AnalysisOutcome, type AnalyzeOptions, type DataClient } from './client'

function qs(params: Record<string, string | undefined>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** Query-string part for a place; commas stay readable (`bbox=W,S,E,N`). */
export function placeQuery(place: Place): string {
  return place.kind === 'point' ? `lat=${place.lat}&lon=${place.lon}` : `bbox=${place.w},${place.s},${place.e},${place.n}`
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
  customScan(place: Place, themeId: string) {
    return getJson<ScanResult>(`${this.base}/custom/scan?theme=${encodeURIComponent(themeId)}&${placeQuery(place)}`)
  }
  climatology(param: ClimateParam, bbox: Bbox) {
    return getJson<ClimateGrid>(`${this.base}/climatology/grid?param=${encodeURIComponent(param)}&bbox=${bbox.join(',')}`)
  }
  customResult(place: Place, variableId: string, opts: { start?: string; end?: string }) {
    const extra = [opts.start ? `start=${opts.start}` : '', opts.end ? `end=${opts.end}` : ''].filter(Boolean).join('&')
    return getJson<AnalysisResult>(`${this.base}/custom/variables/${encodeURIComponent(variableId)}?${placeQuery(place)}${extra ? `&${extra}` : ''}`)
  }
}
