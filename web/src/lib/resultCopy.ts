// Translation plumbing for the variable result screen: every UI string goes through i18n `t` with a
// stable `result.*` key, one key per register (suffix .simple / .sci). Backend Text goes through `tx`.
import { getLang, t, tx, useT } from '../i18n'
import { useView } from '../context'
import type { Text } from '../types/contract'
import type { ViewMode } from './text'

const sfx = (view: ViewMode) => (view === 'simple' ? 'simple' : 'sci')

/** Non-hook: one string with a Simple and a Scientific English default. */
export function sv(view: ViewMode, key: string, simple: string, scientific: string = simple, vars?: Record<string, string | number>): string {
  return t(`${key}.${sfx(view)}`, view === 'simple' ? simple : scientific, vars)
}

/** Number with a fixed number of decimals, in the active language. */
export function fmt(n: number, decimals: number): string {
  return n.toLocaleString(getLang() === 'es' ? 'es' : 'en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** Strip internal wording (for example "(test box)") that must not reach a child in the Simple view. */
export function cleanInternal(s: string, view: ViewMode): string {
  return view === 'simple' ? s.replace(/\s*\((?:test box|stage 1)\)/gi, '') : s
}

/** Hook: re-renders on language change and returns helpers bound to the active view. */
export function useResultCopy() {
  const tt = useT()
  const { view } = useView()
  return {
    view,
    /** plain key + English default (same in both registers) */
    t: tt,
    /** backend Text -> active register (and Spanish variant when present) */
    bx: (text: Text | null | undefined) => tx(text, view),
    /** key + Simple English + Scientific English */
    s: (key: string, simple: string, scientific: string = simple, vars?: Record<string, string | number>) => sv(view, key, simple, scientific, vars),
    /** a COPY Text object */
    c: (key: string, text: Text, vars?: Record<string, string | number>) => sv(view, key, text.simple, text.scientific, vars),
  }
}
