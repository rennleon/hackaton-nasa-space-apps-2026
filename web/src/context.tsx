import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { DataClient } from './data/client'
import type { Catalog, GlossaryTerm, Text } from './types/catalog'
import { pick, type ViewMode } from './lib/text'

const STORAGE_KEY = 'trend-detective:view'

function initialView(): ViewMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'simple' || v === 'scientific') return v
  } catch {
    /* storage unavailable */
  }
  return 'simple'
}

interface ViewCtx {
  view: ViewMode
  setView: (v: ViewMode) => void
  /** pick the active register from a Text */
  t: (text: Text | string | null | undefined) => string
}
const ViewContext = createContext<ViewCtx>({ view: 'simple', setView: () => {}, t: (x) => pick(x, 'simple') })

export function ViewProvider({ children, initial }: { children: ReactNode; initial?: ViewMode }) {
  const [view, setViewState] = useState<ViewMode>(initial ?? initialView())
  const setView = useCallback((v: ViewMode) => {
    setViewState(v)
    try {
      localStorage.setItem(STORAGE_KEY, v)
    } catch {
      /* ignore */
    }
  }, [])
  const value = useMemo(() => ({ view, setView, t: (x: Text | string | null | undefined) => pick(x, view) }), [view, setView])
  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>
}
export const useView = () => useContext(ViewContext)

const GlossaryContext = createContext<Map<string, GlossaryTerm>>(new Map())
export function GlossaryProvider({ terms, children }: { terms: GlossaryTerm[]; children: ReactNode }) {
  const map = useMemo(() => new Map(terms.map((t) => [t.id, t])), [terms])
  return <GlossaryContext.Provider value={map}>{children}</GlossaryContext.Provider>
}
export const useGlossary = () => useContext(GlossaryContext)

interface DataCtx {
  client: DataClient
  catalog: Catalog
}
const DataContext = createContext<DataCtx | null>(null)
export const DataProvider = DataContext.Provider
export function useData(): DataCtx {
  const c = useContext(DataContext)
  if (!c) throw new Error('DataProvider missing')
  return c
}
