import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from './data'
import type { DataClient } from './data/client'
import { DataProvider, GlossaryProvider, ViewProvider } from './context'
import { parseHash, toHash, type Route } from './lib/route'
import { useAsync } from './lib/useAsync'
import { demoById } from './lib/demos'
import type { Catalog } from './types/catalog'
import { ViewToggle } from './components/ViewToggle'
import { Home } from './screens/Home'
import { ThemePicker } from './screens/ThemePicker'
import { Shortlist } from './screens/Shortlist'
import { VariableView } from './screens/VariableView'
import { DemoOverlay } from './screens/DemoOverlay'

function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = useCallback((r: Route) => {
    const h = toHash(r)
    if (h === window.location.hash) setRoute(r)
    else window.location.hash = h
    window.scrollTo?.(0, 0)
  }, [])
  return [route, go]
}

async function loadCatalog(client: DataClient): Promise<Catalog> {
  const [regions, themes, variables, glossary] = await Promise.all([client.regions(), client.themes(), client.variables(), client.glossary()])
  return { regions, themes, variables, glossary }
}

export default function App({ client: injected }: { client?: DataClient }) {
  const client = useMemo(() => injected ?? createClient(), [injected])
  const cat = useAsync(() => loadCatalog(client), [client])
  const [route, go] = useRoute()

  return (
    <ViewProvider>
      <a href="#main" className="skip">
        Skip to content
      </a>
      <header className="topbar">
        <button type="button" className="brand" onClick={() => go({ screen: 'home' })}>
          <span aria-hidden="true">🌍</span> Earth System Trend Detective
        </button>
        <ViewToggle />
      </header>
      <main id="main">
        {cat.loading && <p className="page">Loading…</p>}
        {cat.error && (
          <p className="page error" role="alert">
            Could not load the catalog: {cat.error.message}
          </p>
        )}
        {cat.data && (
          <GlossaryProvider terms={cat.data.glossary}>
            <DataProvider value={{ client, catalog: cat.data }}>
              <Screen route={route} go={go} />
              {route.demo && demoById(route.demo) && (
                <DemoOverlay
                  demoId={route.demo}
                  step={route.step ?? 0}
                  onStep={(i) => {
                    const d = demoById(route.demo!)!
                    go({ ...d.steps[i].route, demo: d.id, step: i })
                  }}
                  onExit={() => go({ screen: 'home' })}
                />
              )}
            </DataProvider>
          </GlossaryProvider>
        )}
      </main>
      <footer className="footer">
        Map data &copy; OpenStreetMap contributors. Data: NASA satellite and model products via NASA Giovanni (GES DISC); results computed by our analysis engine.
      </footer>
    </ViewProvider>
  )
}

function Screen({ route, go }: { route: Route; go: (r: Route) => void }) {
  const keep = (r: Route): Route => (route.demo ? { ...r, demo: route.demo, step: route.step } : r)
  const goKeep = (r: Route) => go(keep(r))
  switch (route.screen) {
    case 'theme':
      return <ThemePicker route={route} go={goKeep} />
    case 'shortlist':
      return <Shortlist route={route} go={goKeep} />
    case 'variable':
      return <VariableView route={route} go={goKeep} />
    default:
      return <Home go={go} />
  }
}
