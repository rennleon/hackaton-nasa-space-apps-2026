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
import { ThemeToggle } from './components/ThemeToggle'
import { Home } from './screens/Home'
import { ThemePicker } from './screens/ThemePicker'
import { Shortlist } from './screens/Shortlist'
import { VariableView } from './screens/VariableView'
import { DemoOverlay } from './screens/DemoOverlay'
import { Notebook } from './screens/Notebook'
import { useFinds } from './lib/myFinds'

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
        <div className="topbar-in">
          <button type="button" className="brand" onClick={() => go({ screen: 'home' })}>
            <span className="brand-logo" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" /></svg>
            </span>
            {t('app.title', 'Earth System Trend Detective')}
          </button>
          <TopNav screen={route.screen} />
        </div>
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

function TopNav({ screen }: { screen: Route['screen'] }) {
  const l = useL()
  const h = useH()
  const t = useT()
  return (
    <nav className="topnav" aria-label={t('app.nav.label', 'Main')}>
      <a className="topnav-link" href="#/how" aria-current={screen === 'how' ? 'page' : undefined}>
        {h('how.link')}
      </a>
      <a className="topnav-link" href="#/sources" aria-current={screen === 'sources' ? 'page' : undefined}>
        {l('sources.link')}
      </a>
      <NotebookLink screen={screen} />
      <ViewToggle />
      <LangToggle />
      <ThemeToggle />
    </nav>
  )
}

function NotebookLink({ screen }: { screen: Route['screen'] }) {
  const t = useT()
  const n = useFinds().length
  return (
    <a className="topnav-link" href="#/notebook" aria-current={screen === 'notebook' ? 'page' : undefined}>
      {t('finds.nav', 'My notebook')}
      {n > 0 && <span className="mono"> ({n})</span>}
    </a>
  )
}

function Footer() {
  const { view } = useView()
  const l = useL()
  const h = useH()
  return (
    <footer className="footer">
      <div className="footer-in">
        <p>{l('common.footer')}</p>
        <div className="footer-links">
          <a href="#/how">{h('how.link')}</a>
          <a href="#/sources">{l('sources.link')}</a>
          {view === 'scientific' && <span className="mono">v{__APP_VERSION__}</span>}
        </div>
      </div>
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
    case 'notebook':
      return <Notebook go={go} />
    default:
      return <Home go={go} route={route} />
  }
}
