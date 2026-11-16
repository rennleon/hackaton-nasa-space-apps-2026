import type { AnalysisResult, ScanResult } from '../types/contract'
import type { GlossaryTerm, RegionCard, ThemeCard, VariableCard } from '../types/catalog'
import type { Place } from '../lib/place'
import { mergeGrids, type Bbox, type ClimateGrid, type ClimateParam } from '../lib/climate'
import { exampleAt } from '../lib/places'
import { keywordGuide, type GuideAnswer } from '../lib/guideKeywords'
import { getJson, LiveDataUnavailable, type AnalysisOutcome, type AnalyzeOptions, type DataClient } from './client'

/** Reads the precomputed JSON files under `<base>/data/`. */
export class StaticClient implements DataClient {
  readonly customPlaces = false
  readonly staticExamples = true
  private base: string
  constructor(base: string = import.meta.env.BASE_URL ?? '/') {
    this.base = base.endsWith('/') ? base : base + '/'
  }
  private url(path: string) {
    return `${this.base}data/${path}`
  }
  regions() {
    return getJson<RegionCard[]>(this.url('catalog/regions.json'))
  }
  themes() {
    return getJson<ThemeCard[]>(this.url('catalog/themes.json'))
  }
  variables() {
    return getJson<VariableCard[]>(this.url('catalog/variables.json'))
  }
  glossary() {
    return getJson<GlossaryTerm[]>(this.url('catalog/glossary.json'))
  }
  scan(regionId: string, themeId: string) {
    return getJson<ScanResult>(this.url(`results/${regionId}/scan_${themeId}.json`))
  }
  result(regionId: string, variableId: string, seasonId?: string) {
    const name = seasonId ? `${variableId}__${seasonId}` : variableId
    return getJson<AnalysisResult>(this.url(`results/${regionId}/${name}.json`))
  }
  /**
   * The precompute also writes each variable at every theme's shared window (`<var>__win_<start>_<end>.json`),
   * so a shortlist card's window opens with the card's own numbers. Missing file: undefined.
   */
  private async windowResult(dir: string, variableId: string, opts: { start?: string; end?: string; seasonId?: string }) {
    if (!opts.start || !opts.end || opts.seasonId) return undefined
    try {
      return await getJson<AnalysisResult>(this.url(`results/${dir}/${variableId}__win_${opts.start}_${opts.end}.json`))
    } catch {
      return undefined
    }
  }
  /** Static files only hold the default settings and the shared windows: any other period is answered with the default and a flag. */
  async analyze(regionId: string, variableId: string, opts: AnalyzeOptions): Promise<AnalysisOutcome> {
    const win = await this.windowResult(regionId, variableId, opts)
    if (win) return win
    const res = await this.result(regionId, variableId, opts.seasonId)
    return opts.start || opts.end ? { ...res, customPeriodUnavailable: true } : res
  }
  /** The keyword route over the catalog files. */
  async guide(text: string, lang: string): Promise<GuideAnswer> {
    const [themes, variables, glossary] = await Promise.all([this.themes(), this.variables(), this.glossary()])
    return keywordGuide(text, lang, { themes, variables, glossary })
  }
  private climIndex?: Promise<{ id: string; bbox: Bbox; params: string[] }[]>
  /**
   * Precomputed 10 x 10 degree windows around the two pre-loaded regions and the three example points
   * (`climatology/<place>_<param>.json`). Serves every window that overlaps the requested box (merged),
   * nearest first. Anywhere else there is no file: rejects.
   */
  async climatology(param: ClimateParam, bbox: Bbox): Promise<ClimateGrid> {
    this.climIndex ??= getJson<{ id: string; bbox: Bbox; params: string[] }[]>(this.url('climatology/index.json'))
    let index
    try {
      index = await this.climIndex
    } catch (err) {
      this.climIndex = undefined // try again next time
      throw err
    }
    const cx = (bbox[0] + bbox[2]) / 2
    const cy = (bbox[1] + bbox[3]) / 2
    const dist = (w: Bbox) => Math.hypot((w[0] + w[2]) / 2 - cx, (w[1] + w[3]) / 2 - cy)
    const hits = index
      .filter((p) => p.params.includes(param) && bbox[0] < p.bbox[2] && bbox[2] > p.bbox[0] && bbox[1] < p.bbox[3] && bbox[3] > p.bbox[1])
      .sort((a, b) => dist(a.bbox) - dist(b.bbox))
    if (!hits.length) throw new LiveDataUnavailable('No precomputed climate map for this part of the world')
    const grids = await Promise.all(hits.map((h) => getJson<ClimateGrid>(this.url(`climatology/${h.id}_${param}.json`))))
    return grids.length === 1 ? grids[0] : mergeGrids(grids)!
  }
  /** The three ready-made example points are precomputed; any other place needs the live API. */
  customScan(place: Place, themeId: string): Promise<ScanResult> {
    const ex = exampleAt(place)
    if (!ex) return Promise.reject(new LiveDataUnavailable('No live API configured'))
    return getJson<ScanResult>(this.url(`results/ex_${ex.id}/scan_${themeId}.json`))
  }
  async customResult(place: Place, variableId: string, opts: { start?: string; end?: string }): Promise<AnalysisOutcome> {
    const ex = exampleAt(place)
    if (!ex) throw new LiveDataUnavailable('No live API configured')
    const win = await this.windowResult(`ex_${ex.id}`, variableId, opts)
    if (win) return win
    const res = await getJson<AnalysisResult>(this.url(`results/ex_${ex.id}/${variableId}.json`))
    return opts.start || opts.end ? { ...res, customPeriodUnavailable: true } : res
  }
}
