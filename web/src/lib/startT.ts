// Translation helper for the start screen: one key per sentence, with a Simple and a Scientific English default.
import { tx, useT, numberLocale } from '../i18n'
import { useView } from '../context'

type Vars = Record<string, string | number>

/**
 * `s('start.hero.lead', 'kid words', 'scientific words', { name })`. When both registers read the same, pass one
 * text. The key gets a `.simple` / `.scientific` suffix only when the two differ.
 */
export function useStartT() {
  const t = useT()
  const { view } = useView()
  const s = (key: string, simple: string, scientific?: string, vars?: Vars) => {
    if (scientific === undefined || scientific === simple) return t(key, simple, vars)
    return t(`${key}.${view}`, view === 'simple' ? simple : scientific, vars)
  }
  return { s, view, tx: (text: Parameters<typeof tx>[0]) => tx(text, view) }
}

export { numberLocale }
