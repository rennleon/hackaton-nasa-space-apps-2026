import type { ThemeCard } from '../types/catalog'

// The three main questions come first; a sub-topic is a theme with a `parent` (one level only).
export const topLevel = (themes: ThemeCard[]) => themes.filter((t) => !t.parent)
export const childrenOf = (themes: ThemeCard[], id: string) => themes.filter((t) => t.parent === id)

/** What to offer next to the current question: the main questions, plus its parent's sub-topics (or its own). */
export function relatedThemes(themes: ThemeCard[], id: string | undefined): ThemeCard[] {
  const me = themes.find((t) => t.id === id)
  const root = me?.parent ?? me?.id
  const top = topLevel(themes)
  const near = root ? childrenOf(themes, root) : []
  return [...top, ...near].filter((t) => t.id !== id)
}
