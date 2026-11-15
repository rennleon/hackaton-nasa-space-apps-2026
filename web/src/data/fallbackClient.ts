import type { Place } from '../lib/place'
import type { Bbox, ClimateParam } from '../lib/climate'
import { exampleAt } from '../lib/places'
import { HttpError, LiveDataUnavailable, type AnalyzeOptions, type AnalysisOutcome, type DataClient } from './client'

/** Tries the API first and falls back to the static twin when it fails. */
export class FallbackClient implements DataClient {
  constructor(
    private api: DataClient,
    private fallback: DataClient,
  ) {}

  private async either<T>(fn: (c: DataClient) => Promise<T>): Promise<T> {
    try {
      return await fn(this.api)
    } catch {
      return fn(this.fallback)
    }
  }
  regions = () => this.either((c) => c.regions())
  themes = () => this.either((c) => c.themes())
  variables = () => this.either((c) => c.variables())
  glossary = () => this.either((c) => c.glossary())
  scan = (r: string, t: string) => this.either((c) => c.scan(r, t))
  result = (r: string, v: string, s?: string) => this.either((c) => c.result(r, v, s))

  /** The live grid first; the precomputed windows (ready-made places) when the API is down or not configured. */
  climatology = (p: ClimateParam, b: Bbox) => this.either((c) => (c.climatology ? c.climatology(p, b) : Promise.reject(new Error('no climate layer'))))

  async analyze(regionId: string, variableId: string, opts: AnalyzeOptions): Promise<AnalysisOutcome> {
    try {
      return await this.api.analyze(regionId, variableId, opts)
    } catch {
      // The static twin holds the shared windows; any other custom period gets the default (or season) result and a flag.
      return this.fallback.analyze(regionId, variableId, opts)
    }
  }

  /** No static twin for a custom place: the API's rejection of bad input passes through, anything else is "unavailable". */
  private async live<T>(fn: (c: DataClient) => Promise<T>): Promise<T> {
    try {
      return await fn(this.api)
    } catch (err) {
      if (err instanceof HttpError && err.status >= 400 && err.status < 500) throw err
      throw err instanceof LiveDataUnavailable ? err : new LiveDataUnavailable(err instanceof Error ? err.message : undefined)
    }
  }
  readonly staticExamples = true
  /**
   * A ready-made example point is answered from its precomputed files first (same numbers every time, no wait,
   * and the demo narration matches); the API is only asked for a custom period, or when the files are missing.
   */
  customScan = (p: Place, t: string) =>
    exampleAt(p) ? this.fallback.customScan(p, t).catch(() => this.live((c) => c.customScan(p, t))) : this.live((c) => c.customScan(p, t))
  customResult = (p: Place, v: string, o: { start?: string; end?: string }) => {
    const apiFirst = () => this.live((c) => c.customResult(p, v, o))
    if (!exampleAt(p)) return apiFirst()
    if (o.start || o.end) return apiFirst().catch(() => this.fallback.customResult(p, v, o))
    return this.fallback.customResult(p, v, o).catch(apiFirst)
  }
}
