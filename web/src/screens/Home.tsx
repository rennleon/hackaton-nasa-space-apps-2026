import { useCallback, useEffect, useRef, useState } from 'react'
import { useData } from '../context'
import { PlaceChooser } from '../components/PlaceChooser'
import { PlaceSearch } from '../components/PlaceSearch'
import { ReadyPlaces } from '../components/ReadyPlaces'
import { StartQuestions } from '../components/StartQuestions'
import { DEMOS } from '../lib/demos'
import type { GeoResult } from '../lib/geocode'
import { namedPoint, routeFor, type Chosen, type ExamplePlace } from '../lib/places'
import type { Route } from '../lib/route'
import { useStartT } from '../lib/startT'
import './Home.css'

/** Start: pick a place (search, location, ready-made, map), then ask a question, on one page. */
export function Home({ go }: { go: (r: Route) => void }) {
  const { catalog, client } = useData()
  const { s, tx } = useStartT()
  const listed = catalog.regions.filter((r) => r.listed !== false)
  const liveOff = client.customPlaces === false
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const panel = useRef<HTMLElement>(null)

  // Bring the questions into view after a choice made away from the map (search, location, cards, numbers).
  const [lookAt, setLookAt] = useState(0)
  useEffect(() => {
    if (!lookAt) return
    panel.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
    panel.current?.focus({ preventScroll: true })
  }, [lookAt])
  const choose = useCallback((c: Chosen, reveal = true) => {
    setChosen(c)
    if (reveal) setLookAt((n) => n + 1)
  }, [])

  const demoName = (id: string) => tx(catalog.regions.find((r) => r.id === id)?.name ?? { simple: id, scientific: id }).replace(/ \(.*\)/, '')

  return (
    <div className="page start">
      <section className="hero" aria-labelledby="hero-h">
        <h1 id="hero-h">{s('start.hero.title', 'Is the Earth changing where you live?')}</h1>
        <p className="lead">
          {s(
            'start.hero.lead',
            'Satellites have watched Earth for over 20 years. Pick a place and we will check.',
            'Explore NASA satellite and reanalysis records for a place, remove the seasonal cycle, fit a trend, and read an honest significance verdict with its caveats.',
          )}
        </p>
        <ol className="start-steps">
          <li>{s('start.steps.one', 'Pick a place', 'Choose a place')}</li>
          <li>{s('start.steps.two', 'Ask a question', 'Choose a question')}</li>
          <li>{s('start.steps.three', 'See what changed', 'Read the trend and verdict')}</li>
        </ol>
        <PlaceSearch
          disabled={liveOff}
          onChoose={(r: GeoResult) => choose(namedPoint(Math.round(r.lat * 100) / 100, Math.round(r.lon * 100) / 100, r.label))}
          onLocate={(lat, lon) => choose(namedPoint(lat, lon, s('start.place.here', 'Where you are', 'Your location')))}
        />
        {liveOff && <p className="muted">{s('start.search.off', 'Searching for any place needs our live service. Try a ready-made place.', 'Place search requires the API (VITE_API_URL not set).')}</p>}
        <p className="start-demo">
          <span aria-hidden="true">▶</span> {s('start.demo.watch', 'Watch a demo')}:{' '}
          {DEMOS.map((d) => (
            <button key={d.id} type="button" className="link" onClick={() => go({ ...d.steps[0].route, demo: d.id, step: 0 })}>
              {demoName(d.id)}
            </button>
          ))}
        </p>
      </section>

      {chosen && <StartQuestions ref={panel} chosen={chosen} onAsk={(theme) => go(routeFor(chosen, theme))} onChange={() => setChosen(null)} />}

      <ReadyPlaces
        regions={listed}
        liveOff={liveOff}
        selectedId={chosen?.kind === 'region' ? chosen.region.id : undefined}
        onRegion={(r) => choose({ kind: 'region', region: r })}
        onExample={(e: ExamplePlace) => choose(namedPoint(e.lat, e.lon, s(`start.example.${e.id}.name`, e.name)))}
      />

      <section className="start-map" aria-labelledby="map-h">
        <h2 id="map-h">{s('start.map.title', 'Or pick a spot on the map', 'Or choose on the map')}</h2>
        <PlaceChooser
          regions={listed}
          chosen={chosen}
          disabled={liveOff}
          onPlace={(place, viaMap) => choose({ kind: 'place', place, name: null, viaMap }, !viaMap)}
        />
        {chosen?.kind === 'place' && chosen.viaMap && (
          <p>
            <button type="button" className="btn btn-primary" onClick={() => setLookAt((n) => n + 1)}>
              {s('start.map.next', 'Now pick a question', 'Continue to the questions')}
            </button>
          </p>
        )}
      </section>
    </div>
  )
}
