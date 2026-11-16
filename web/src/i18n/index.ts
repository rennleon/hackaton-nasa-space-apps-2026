import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import es from './es'

export type Lang = 'en' | 'es'
const KEY = 'td.lang'
let lang: Lang = (() => {
  try { return localStorage.getItem(KEY) === 'es' ? 'es' : 'en' } catch { return 'en' }
})()
if (typeof document !== 'undefined') document.documentElement.lang = lang
const subs = new Set<() => void>()

export function getLang(): Lang { return lang }
function applyLang(l: Lang): void {
  lang = l
  try { localStorage.setItem(KEY, l) } catch { /* private mode */ }
  document.documentElement.lang = l
  subs.forEach((f) => f())
}
/** Switch language with a soft cross-fade where the browser supports view transitions (instant otherwise, or when
 *  the viewer asks for reduced motion). The re-render must finish inside the callback, hence flushSync. */
export function setLang(l: Lang): void {
  if (l === lang) return
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (doc.startViewTransition && !reduced) doc.startViewTransition(() => flushSync(() => applyLang(l)))
  else applyLang(l)
}
export function useLang(): Lang {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, getLang, getLang)
}
/** t('result.gauge.sure', 'Sure it\'s real', { years: 20 }) — English default inline; {name} placeholders. */
export function t(key: string, en: string, vars?: Record<string, string | number>): string {
  const s = (lang === 'es' && es[key]) || en
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : s
}
/** Same as t() but for a given language, whatever the current one is. */
export function tIn(l: Lang, key: string, en: string): string {
  return (l === 'es' && es[key]) || en
}
/** Locale for numbers and dates. Peru's team: point as decimal mark, comma for thousands. */
export const numberLocale = (): string => (lang === 'es' ? 'es-PE' : 'en')
/** Call inside components so they re-render when the language changes. */
export function useT(): typeof t { useLang(); return t }
/** Backend Text objects: Spanish variants arrive later as optional simple_es / scientific_es. */
export function tx(text: { simple: string; scientific: string } | null | undefined, mode: 'simple' | 'scientific'): string {
  if (!text) return ''
  const o = text as { simple: string; scientific: string; simple_es?: string | null; scientific_es?: string | null }
  if (lang === 'es') { const v = mode === 'simple' ? o.simple_es : o.scientific_es; if (v) return v }
  return mode === 'simple' ? o.simple : o.scientific
}
