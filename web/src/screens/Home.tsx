import { useCallback, useEffect, useRef, useState } from 'react'
import { HeroGlobe } from '../components/HeroGlobe'
import { useData } from '../context'
import { CoordsForm } from '../components/CoordsForm'
import { PlaceChooser } from '../components/PlaceChooser'
import { PlaceIcon, type PlaceIconName } from '../components/PlaceIcons'
import { PlaceSearch } from '../components/PlaceSearch'
import { ReadyPlaces } from '../components/ReadyPlaces'
import { StartQuestions } from '../components/StartQuestions'
import { DEMOS, demoById, demoStart } from '../lib/demos'
import { formatPlace, parsePlace } from '../lib/place'
import { recallPlaceName } from '../lib/placeNames'
import type { GeoResult } from '../lib/geocode'
import { namedPoint, routeFor, type Chosen, type ExamplePlace } from '../lib/places'
import type { Route } from '../lib/route'
import { Icon } from '../components/ResultIcons'
import { useStartT } from '../lib/startT'
import './Home.css'

type TabId = 'search' | 'places' | 'map' | 'coords'
const TABS: { id: TabId; icon: PlaceIconName }[] = [
  { id: 'search', icon: 'search' },
  { id: 'map', icon: 'pin' },
  { id: 'coords', icon: 'grid' },
  { id: 'places', icon: 'mountain' },
]

/** Start: one card in two steps. Step 1 picks a place (search, map, numbers or ready-made), step 2 asks a question. */
export function Home({ go, route }: { go: (r: Route) => void; route?: Route }) {
  const { catalog, client } = useData()
  const { s } = useStartT()
  const listed = catalog.regions.filter((r) => r.listed !== false)
  const liveOff = client.customPlaces === false
  // A demo step can arrive with a place already picked (`#/home?region=…` or `?place=pt:…`).
  const fromRoute = useCallback((): Chosen | null => {
    if (!route?.demo) return null
    const region = route.region ? listed.find((r) => r.id === route.region) : undefined
    if (region) return { kind: 'region', region }
    const place = parsePlace(route.place)
    return place ? { kind: 'place', place, name: recallPlaceName(formatPlace(place)), viaMap: false } : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.demo, route?.region, route?.place, catalog])
  // A demo step that points at a ready-made card needs that tab open.
  const demoTab = (): TabId | null => {
    if (!route?.demo) return null
    return demoById(route.demo)?.steps[route.step ?? 0]?.target?.startsWith('ready-') ? 'places' : null
  }
  const [chosen, setChosen] = useState<Chosen | null>(fromRoute)
  /** what the map tab draws: the last place chosen or tapped there (a tap is not "chosen" until "Use this spot") */
  const [picked, setPicked] = useState<Chosen | null>(chosen)
  // Without the live service, search, map and numbers are off: start on the tab that works.
  const [tab, setTab] = useState<TabId>(() => demoTab() ?? (liveOff ? 'places' : 'search'))
  useEffect(() => {
    const c = fromRoute()
    setChosen(c)
    if (c) setPicked(c)
  }, [fromRoute])
  const demoStepTab = route?.demo ? demoTab() : null
  // "Use this spot" only takes a pin or box tapped on the map, never an earlier pick from another tab
  const mapPick = picked?.kind === 'place' && picked.viaMap ? picked : null
  useEffect(() => {
    if (demoStepTab) setTab(demoStepTab)
  }, [demoStepTab, route?.step])

  const card = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const tabButtons = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({})
  /** where focus goes after the next change of step: the place name (step 2) or the tab we came from (step 1) */
  const focusNext = useRef<'heading' | 'tab' | null>(null)
  useEffect(() => {
    const target = focusNext.current
    if (!target) return
    focusNext.current = null
    card.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
    if (target === 'heading') heading.current?.focus({ preventScroll: true })
    else tabButtons.current[tab]?.focus({ preventScroll: true })
  }, [chosen, tab])

  const choose = useCallback((c: Chosen) => {
    focusNext.current = 'heading'
    setPicked(c)
    setChosen(c)
  }, [])
  const back = () => {
    focusNext.current = 'tab'
    setChosen(null)
  }

  const labels: Record<TabId, string> = {
    search: s('start.tab.search', 'Search'),
    places: s('start.tab.places', 'Ready-made places'),
    map: s('start.tab.map', 'On the map'),
    coords: s('start.tab.coords', 'Coordinates'),
  }
  const onTabKey = (e: React.KeyboardEvent) => {
    const at = TABS.findIndex((t) => t.id === tab)
    const to = e.key === 'ArrowRight' ? (at + 1) % TABS.length : e.key === 'ArrowLeft' ? (at - 1 + TABS.length) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1
    if (to < 0) return
    e.preventDefault()
    setTab(TABS[to].id)
    tabButtons.current[TABS[to].id]?.focus()
  }

  const step = chosen ? 2 : 1
  const stepLabels = [s('start.steps.one', 'Pick a place', 'Choose a place'), s('start.steps.two', 'Ask a question', 'Choose a question'), s('start.steps.three', 'See what changed', 'Read the trend and verdict')]

  return (
    <div className="page start">
      <HeroGlobe />
      <section className="hero" aria-labelledby="hero-h">
        <h1 id="hero-h">{s('start.hero.title', 'Earth trends, measured and tested')}</h1>
        <p className="lead">
          {s(
            'start.hero.lead',
            'We measure how a place is changing. Then we check how sure we are.',
            'Rate of change per 10 years with a 95% range, tested with persistence-aware Mann–⁠Kendall and OLS t-tests on de-seasonalised NASA data.',
          )}
        </p>
        {/* the two guided demos run on saved results, so they work offline and from any step */}
        <div className="hero-demos" role="group" aria-labelledby="hero-demos-label">
          <span id="hero-demos-label" className="hero-demos-label">{s('start.hero.demo', 'Watch a demo')}</span>
          {DEMOS.map((d) => (
            <button key={d.id} type="button" className="btn btn-primary hero-demo" onClick={() => go(demoStart(d))}>
              <Icon name="play" size={16} />
              {s(`demo.${d.id}.label`, d.label.simple, d.label.scientific)}
            </button>
          ))}
        </div>
      </section>

      <section ref={card} className="card start-wizard" aria-label={s('start.wizard.label', 'Find your place')}>
        <div className="start-progress">
          <ol className="steps" aria-label={s('start.stepper.label', 'Progress')}>
            {stepLabels.map((label, i) => {
              const n = i + 1
              const state = n < step ? 'done' : n === step ? 'current' : ''
              return (
                <li key={n} className={`step ${state}`.trim()} aria-current={n === step ? 'step' : undefined}>
                  <span className="step-n" aria-hidden="true">
                    {n < step ? <PlaceIcon name="check" size={16} /> : n}
                  </span>
                  <span className="step-label">
                    {label}
                    {n < step && <span className="visually-hidden"> ({s('start.stepper.done', 'done')})</span>}
                  </span>
                  {n < stepLabels.length && <span className="step-bar" aria-hidden="true" />}
                </li>
              )
            })}
          </ol>
        </div>

        {step === 1 ? (
          <>
            <div className="start-tabs" role="tablist" aria-label={s('start.tabs.label', 'How to pick a place')} onKeyDown={onTabKey}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabButtons.current[t.id] = el
                  }}
                  type="button"
                  role="tab"
                  id={`start-tab-${t.id}`}
                  className="start-tab"
                  aria-selected={tab === t.id}
                  aria-controls="start-panel"
                  tabIndex={tab === t.id ? 0 : -1}
                  onClick={() => setTab(t.id)}
                >
                  <PlaceIcon name={t.icon} />
                  {labels[t.id]}
                </button>
              ))}
            </div>
            <div role="tabpanel" id="start-panel" aria-labelledby={`start-tab-${tab}`} className={`start-panel panel-${tab}`}>
              {tab === 'search' && (
                <>
                  <PlaceSearch
                    disabled={liveOff}
                    onChoose={(r: GeoResult) => choose(namedPoint(Math.round(r.lat * 100) / 100, Math.round(r.lon * 100) / 100, r.label))}
                    onLocate={(lat, lon) => choose(namedPoint(lat, lon, s('start.place.here', 'Where you are', 'Your location')))}
                  />
                  {liveOff && <p className="muted">{s('start.search.off', 'Searching for any place needs our live service. Try a ready-made place.', 'Place search requires the API (VITE_API_URL not set).')}</p>}
                  <p className="start-credit">{s('start.search.credit', 'Place search uses Open-Meteo.')}</p>
                </>
              )}
              {tab === 'places' && (
                <ReadyPlaces
                  regions={listed}
                  liveOff={liveOff && !client.staticExamples}
                  selectedId={picked?.kind === 'region' ? picked.region.id : undefined}
                  onRegion={(r) => choose({ kind: 'region', region: r })}
                  onExample={(e: ExamplePlace) => choose(namedPoint(e.lat, e.lon, s(`start.example.${e.id}.name`, e.name)))}
                />
              )}
              {tab === 'map' && (
                <PlaceChooser
                  regions={listed}
                  chosen={picked}
                  disabled={liveOff}
                  onPlace={(place) => setPicked({ kind: 'place', place, name: null, viaMap: true })}
                  action={
                    <button type="button" className="btn btn-primary" disabled={liveOff || !mapPick} onClick={() => mapPick && choose(mapPick)}>
                      {s('start.map.use', 'Use this spot')}
                    </button>
                  }
                />
              )}
              {tab === 'coords' && (
                <CoordsForm
                  disabled={liveOff}
                  initial={picked?.kind === 'place' ? picked.place : null}
                  onPlace={(place) => choose({ kind: 'place', place, name: null, viaMap: false })}
                />
              )}
            </div>
          </>
        ) : (
          chosen && (
            <div className="start-panel">
              <StartQuestions ref={heading} chosen={chosen} onAsk={(theme) => go(routeFor(chosen, theme))} onChange={back} />
            </div>
          )
        )}
      </section>
    </div>
  )
}
