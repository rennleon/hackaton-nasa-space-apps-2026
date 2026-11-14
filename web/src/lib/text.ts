import type { Text, UnitsInfo } from '../types/contract'

export type ViewMode = 'simple' | 'scientific'

export function pick(text: Text | string | null | undefined, view: ViewMode): string {
  if (text == null) return ''
  return typeof text === 'string' ? text : text[view]
}

/** "+1.49 %RH per decade" (scientific) or "+1.49 percentage points every 10 years" (simple). */
export function formatSlope(slope: number | null, units: UnitsInfo, view: ViewMode): string {
  if (slope == null) return '—'
  const d = Math.max(units.decimals, 1)
  const num = `${slope > 0 ? '+' : slope < 0 ? '−' : ''}${Math.abs(slope).toFixed(d)}`
  return view === 'simple' ? `${num} ${units.simple} every 10 years` : `${num} ${units.display} per decade`
}

export function formatP(p: number): string {
  if (p < 0.001) return '< 0.001'
  return p.toFixed(p < 0.01 ? 4 : 3)
}

export function parseYm(s: string): { y: number; m: number } {
  const [y, m] = s.split('-').map(Number)
  return { y, m }
}

export const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2002-09" -> "Sep 2002" */
export function formatYm(s: string): string {
  const { y, m } = parseYm(s)
  return `${monthNames[m - 1]} ${y}`
}
