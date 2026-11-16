import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient, defaultApiUrl } from './data'
import type { DataClient } from './data/client'
import { DataProvider, GlossaryProvider, ViewProvider, useView } from './context'
import { lIn, useL } from './lib/findingsCopy'
import { tIn, useLang, useT } from './i18n'
import { Sources } from './screens/Sources'
import { HowItWorks } from './screens/HowItWorks'
import { hIn, useH } from './lib/howCopy'
import './App.css'
import { parseHash, toHash, type Route } from './lib/route'
import { useAsync } from './lib/useAsync'
import { demoById, prepareDemo } from './lib/demos'
import type { Catalog } from './types/catalog'
import { ViewToggle } from './components/ViewToggle'
import { HeaderMenu } from './components/HeaderMenu'
import { Stable } from './components/Switch'
import { BrandLogo } from './components/BrandLogo'
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
  const lang = useLang()
  if (route.demo) prepareDemo(route.demo) // an example place shows its real name from the first screen

  return (
    <ViewProvider>
      <a href="#main" className="skip">
        {t('app.skip', 'Skip to content')}
      </a>
      <header className="topbar">
        <div className="topbar-in">
          <button type="button" className="brand" onClick={() => go({ screen: 'home' })}>
            <BrandLogo />
            <span className="brand-name">
              <Stable texts={[tIn('en', 'app.title', 'Trend Detective'), tIn('es', 'app.title', 'Trend Detective')]} active={lang === 'es' ? 1 : 0} lang={['en', 'es']} />
            </span>
          </button>
          <TopNav screen={route.screen} />
          <HeaderMenu />
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
  const { view } = useView()
  const lang = useLang()
  const t = useT()
  const active = lang === 'es' ? 1 : 0
  // each link keeps the width of its longer language, so switching language never shifts the header
  const how = <Stable texts={[hIn('en', 'how.link', view), hIn('es', 'how.link', view)]} active={active} lang={['en', 'es']} />
  const sources = <Stable texts={[lIn('en', 'sources.link', view), lIn('es', 'sources.link', view)]} active={active} lang={['en', 'es']} />
  return (
    <nav className="topnav" aria-label={t('app.nav.label', 'Main')}>
      <div className="topnav-links">
        <a className="topnav-link" href="#/how" aria-current={screen === 'how' ? 'page' : undefined}>
          {how}
        </a>
        <a className="topnav-link" href="#/sources" aria-current={screen === 'sources' ? 'page' : undefined}>
          {sources}
        </a>
      </div>
      <ViewToggle />
    </nav>
  )
}

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const

/** Footer in four short columns (who we are, pages, NASA data, credits) and a bottom line with the challenge. */
function Footer() {
  const { view } = useView()
  const l = useL()
  const h = useH()
  const t = useT()
  return (
    <footer className="footer">
      <div className="footer-in">
        <div className="footer-grid">
          <div className="footer-brand">
            <p className="footer-name">
              <BrandLogo size={30} />
              {t('app.title', 'Trend Detective')}
            </p>
            <p className="footer-tagline">{t('footer.tagline', 'Earth trends, measured and tested')}</p>
          </div>
          <nav className="footer-col" aria-labelledby="footer-explore">
            <h2 id="footer-explore" className="footer-head">{t('footer.explore', 'Explore')}</h2>
            <ul>
              <li><a href="#/how">{h('how.link')}</a></li>
              <li><a href="#/sources">{l('sources.link')}</a></li>
            </ul>
          </nav>
          <div className="footer-col">
            <h2 className="footer-head">{t('footer.data', 'NASA data')}</h2>
            <ul>
              <li><a href="https://giovanni.gsfc.nasa.gov/" {...EXTERNAL}>NASA Giovanni (GES DISC)</a></li>
              <li><a href="https://power.larc.nasa.gov/" {...EXTERNAL}>NASA POWER</a></li>
              <li>{t('footer.data.kinds', 'Satellites and computer models')}</li>
            </ul>
          </div>
          <div className="footer-col">
            <h2 className="footer-head">{t('footer.credits', 'Credits')}</h2>
            <ul>
              <li>
                {t('footer.credits.map', 'Map data ©')}{' '}
                <a href="https://www.openstreetmap.org/copyright" {...EXTERNAL}>
                  {t('footer.credits.osm', 'OpenStreetMap contributors')}
                </a>
              </li>
              <li>{t('footer.credits.engine', 'Results worked out by our own analysis engine')}</li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>{t('footer.challenge', 'Made for the NASA Space Apps Challenge 2026')}</p>
          {view === 'scientific' && <p className="mono">v{__APP_VERSION__}</p>}
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
    default:
      return <Home go={go} route={route} />
  }
}
