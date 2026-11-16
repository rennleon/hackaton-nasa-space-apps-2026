import type { Place } from '../lib/place'
import type { Bbox, ClimateParam } from '../lib/climate'
import { exampleAt } from '../lib/places'
import { HttpError, LiveDataUnavailable, type AnalyzeOptions, type AnalysisOutcome, type DataClient } from './client'

/**
 * Catalog reads try the API first. A pre-loaded region's results (default settings, declared seasons, each theme's
 * shared window) come from the precomputed files first: the same engine wrote them, so the numbers are the same,
 * with no wait and no network. The API answers only what has no file (another period, a region not precomputed).
 */
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
  scan = (r: string, t: string) => this.fallback.scan(r, t).catch(() => this.api.scan(r, t))
  result = (r: string, v: string, s?: string) => this.fallback.result(r, v, s).catch(() => this.api.result(r, v, s))

  /** The live grid first; the precomputed windows (ready-made places) when the API is down or not configured. */
  climatology = (p: ClimateParam, b: Bbox) => this.either((c) => (c.climatology ? c.climatology(p, b) : Promise.reject(new Error('no climate layer'))))

  async analyze(regionId: string, variableId: string, opts: AnalyzeOptions): Promise<AnalysisOutcome> {
    // The static twin holds the default, the declared seasons and the shared windows. Any other period comes back
    // flagged: ask the API, and if it is down too, show the flagged default with its notice.
    const pre: AnalysisOutcome | null = await this.fallback.analyze(regionId, variableId, opts).catch(() => null)
    if (pre && !pre.customPeriodUnavailable) return pre
    return this.api.analyze(regionId, variableId, opts).catch((err) => (pre ? pre : Promise.reject(err)))
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
  customResult = async (p: Place, v: string, o: { start?: string; end?: string }) => {
    const apiFirst = () => this.live((c) => c.customResult(p, v, o))
    if (!exampleAt(p)) return apiFirst()
    // Example points: precomputed files first (the default, and each shortlist card's shared window), so the demo
    // numbers match and no live computation or rate-limit token is spent. A period with no file (the static client
    // flags it) goes to the API; if that fails too, the flagged default is shown with its notice.
    const pre: AnalysisOutcome | null = await this.fallback.customResult(p, v, o).catch(() => null)
    if (pre && !pre.customPeriodUnavailable) return pre
    return apiFirst().catch((err) => (pre ? pre : Promise.reject(err)))
  }
}
