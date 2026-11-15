import type { Text, UnitsInfo } from '../types/contract'
import { getLang, numberLocale, t } from '../i18n'

export type ViewMode = 'simple' | 'scientific'

export function pick(text: Text | string | null | undefined, view: ViewMode): string {
  if (text == null) return ''
  return typeof text === 'string' ? text : text[view]
}

/** Number with a sign (+ or the real minus) and fixed decimals, in the active language. */
export function signed(n: number, decimals: number): string {
  const abs = Math.abs(n).toLocaleString(numberLocale(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${abs}`
}

/** Unsigned number with fixed decimals, in the active language. */
export function plainNum(n: number, decimals: number): string {
  return n.toLocaleString(numberLocale(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** "+1.49 %RH per decade" (scientific) or "+1.49 percentage points every 10 years" (simple). */
export function formatSlope(slope: number | null, units: UnitsInfo, view: ViewMode): string {
  if (slope == null) return '—'
  const num = signed(slope, Math.max(units.decimals, 1))
  return view === 'simple'
    ? t('result.slope.simple', '{n} {unit} every 10 years', { n: num, unit: units.simple })
    : t('result.slope.sci', '{n} {unit} per decade', { n: num, unit: units.display })
}

export function formatP(p: number): string {
  if (p < 0.001) return '< 0.001'
  return p.toFixed(p < 0.01 ? 4 : 3)
}

export function parseYm(s: string): { y: number; m: number } {
  const [y, m] = s.split('-').map(Number)
  return { y, m }
}

const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
}
export const monthNames = MONTHS.en

/** "2002-09" -> "Sep 2002" (or "sep 2002" in Spanish) */
export function formatYm(s: string): string {
  const { y, m } = parseYm(s)
  return `${MONTHS[getLang()][m - 1]} ${y}`
}

/** First letter in capitals ("rainy season" -> "Rainy season") for names shown on their own (tabs, options, chips). */
export function capFirst(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s
}
