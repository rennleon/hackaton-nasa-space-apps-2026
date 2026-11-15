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

/**
 * Units for a number in this view. Simple: the kid scale (display value * kid_scale, read with the kid label, e.g.
 * 0.031 AOD -> 3.1 "on the haze scale"), the same scale as the then/now line and the Simple chart. Scientific: display
 * units. Never pair `units.simple` with a kid-scaled number or a kid label with a display number.
 */
export function viewUnits(units: UnitsInfo, view: ViewMode): { scale: number; label: string; decimals: number } {
  if (view !== 'simple' || !units.kid_label) return { scale: 1, label: view === 'simple' ? units.simple : units.display, decimals: Math.max(units.decimals, 1) }
  const scale = units.kid_scale ?? 1
  const label = (getLang() === 'es' ? units.kid_label_es : null) ?? units.kid_label
  return { scale, label, decimals: Math.max(1, units.decimals - Math.round(Math.log10(scale))) }
}

/**
 * A unit label as it reads right after a number. Mirrors the backend amount_en / amount_es: a kid label that starts
 * with "on " / "en " gets "point(s)" / "punto(s)" in front ("1.1 points on the haze scale"); "degrees" is "degree" for 1.
 * Pass the number shown; a label with no number beside it (an axis title) can pass 2 for the plural.
 */
export function unitAfter(label: string, shown: number): string {
  const one = Math.abs(shown) === 1
  if (label.startsWith('on ')) return `point${one ? '' : 's'} ${label}`
  if (label.startsWith('en ')) return `punto${one ? '' : 's'} ${label}`
  if (one && label === 'degrees') return 'degree'
  if (one && label === 'grados') return 'grado'
  return label
}

/** "+1.49 %RH per decade" (scientific) or "+1.5 on the humidity scale every 10 years" (simple). */
export function formatSlope(slope: number | null, units: UnitsInfo, view: ViewMode): string {
  if (slope == null) return '—'
  const u = viewUnits(units, view)
  const num = signed(slope * u.scale, u.decimals)
  const shown = Number(num.replace('−', '-').replace('+', ''))
  return view === 'simple'
    ? t('result.slope.simple', '{n} {unit} every 10 years', { n: num, unit: unitAfter(u.label, shown) })
    : t('result.slope.sci', '{n} {unit} per decade', { n: num, unit: u.label })
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
