import type { VariableCard } from '../types/catalog'
import { parseYm } from './text'

export interface Coverage {
  start: number // decimal year
  end: number
  /** shaded (excluded) drift years: [from, to] or null */
  drift: [number, number] | null
}

const toYear = (s: string) => {
  const { y, m } = parseYm(s)
  return y + (m - 1) / 12
}

/** Record coverage of a variable on the timeline: usable window plus the excluded drift period. */
export function coverageFor(v: VariableCard, endYear: number): Coverage {
  const start = toYear(v.record_start)
  const cut = v.artifacts.find((a) => a.action === 'end_window_before')
  if (cut) {
    const from = toYear(cut.start)
    return { start, end: from, drift: [from, endYear] }
  }
  return { start, end: endYear, drift: null }
}
