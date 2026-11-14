import type { Place } from '../lib/place'
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

  async analyze(regionId: string, variableId: string, opts: AnalyzeOptions): Promise<AnalysisOutcome> {
    try {
      return await this.api.analyze(regionId, variableId, opts)
    } catch {
      // No static twin for a custom period: serve the default (or season) result and say so.
      const res = await this.fallback.result(regionId, variableId, opts.seasonId)
      const custom = Boolean(opts.start || opts.end)
      return custom ? { ...res, customPeriodUnavailable: true } : res
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
  customScan = (p: Place, t: string) => this.live((c) => c.customScan(p, t))
  customResult = (p: Place, v: string, o: { start?: string; end?: string }) => this.live((c) => c.customResult(p, v, o))
}
