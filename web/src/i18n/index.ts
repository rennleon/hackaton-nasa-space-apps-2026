import { useSyncExternalStore } from 'react'
import es from './es'

export type Lang = 'en' | 'es'
const KEY = 'td.lang'
let lang: Lang = (() => {
  try { return localStorage.getItem(KEY) === 'es' ? 'es' : 'en' } catch { return 'en' }
})()
const subs = new Set<() => void>()

export function getLang(): Lang { return lang }
export function setLang(l: Lang): void {
  lang = l
  try { localStorage.setItem(KEY, l) } catch { /* private mode */ }
  document.documentElement.lang = l
  subs.forEach((f) => f())
}
export function useLang(): Lang {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, getLang, getLang)
}
/** t('result.gauge.sure', 'Sure it\'s real', { years: 20 }) — English default inline; {name} placeholders. */
export function t(key: string, en: string, vars?: Record<string, string | number>): string {
  const s = (lang === 'es' && es[key]) || en
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : s
}
/** Call inside components so they re-render when the language changes. */
export function useT(): typeof t { useLang(); return t }
/** Backend Text objects: Spanish variants arrive later as optional simple_es / scientific_es. */
export function tx(text: { simple: string; scientific: string } | null | undefined, mode: 'simple' | 'scientific'): string {
  if (!text) return ''
  const o = text as { simple: string; scientific: string; simple_es?: string | null; scientific_es?: string | null }
  if (lang === 'es') { const v = mode === 'simple' ? o.simple_es : o.scientific_es; if (v) return v }
  return mode === 'simple' ? o.simple : o.scientific
}
