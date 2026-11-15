import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient, defaultApiUrl } from './data'
import type { DataClient } from './data/client'
import { DataProvider, GlossaryProvider, ViewProvider, useView } from './context'
import { useL } from './lib/findingsCopy'
import { useT } from './i18n'
import { Sources } from './screens/Sources'
import { HowItWorks } from './screens/HowItWorks'
import { useH } from './lib/howCopy'
import './App.css'
import { parseHash, toHash, type Route } from './lib/route'
import { useAsync } from './lib/useAsync'
import { demoById, prepareDemo } from './lib/demos'
import type { Catalog } from './types/catalog'
import { ViewToggle } from './components/ViewToggle'
import { LangToggle } from './components/LangToggle'
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
  const client = useMemo(() => injected ?? createClient(defaultApiUrl()), [injected])
  const cat = useAsync(() => loadCatalog(client), [client])
  const [route, go] = useRoute()
  const t = useT()
  if (route.demo) prepareDemo(route.demo) // an example place shows its real name from the first screen

  return (
    <ViewProvider>
      <a href="#main" className="skip">
        {t('app.skip', 'Skip to content')}
      </a>
      <header className="topbar">
        <button type="button" className="brand" onClick={() => go({ screen: 'home' })}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: '-4px', marginRight: 6 }}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>{t('app.title', 'Earth System Trend Detective')}
        </button>
        <TopNav />
      </header>
      <main id="main">
        {cat.loading && <p className="page">{t('app.loading', 'Loading…')}</p>}
        {cat.error && (
          <p className="page error" role="alert">
            {t('app.catalogError', 'Could not load the catalog: {message}', { message: cat.error.message })}
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
      <Footer />
    </ViewProvider>
  )
}

function TopNav() {
  const l = useL()
  const h = useH()
  return (
    <nav className="topnav">
      <a href="#/how">{h('how.link')}</a>
      <a href="#/sources">{l('sources.link')}</a>
      <ViewToggle />
      <LangToggle />
    </nav>
  )
}

function Footer() {
  const { view } = useView()
  const l = useL()
  const h = useH()
  return (
    <footer className="footer">
      {l('common.footer')} ·{' '}
      <a href="#/how">{h('how.link')}</a> · <a href="#/sources">{l('sources.link')}</a>
      {view === 'scientific' && <> · v{__APP_VERSION__}</>}
    </footer>
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
    case 'how':
      return <HowItWorks />
    case 'sources':
      return <Sources />
    default:
      return <Home go={go} route={route} />
  }
}
