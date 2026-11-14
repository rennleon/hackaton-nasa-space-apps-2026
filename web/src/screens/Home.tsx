import { useData, useView } from '../context'
import { RegionMap } from '../components/RegionMap'
import { DEMOS } from '../lib/demos'
import type { Route } from '../lib/route'

export function Home({ go }: { go: (r: Route) => void }) {
  const { catalog } = useData()
  const { t, view } = useView()
  const listed = catalog.regions.filter((r) => r.listed !== false)
  return (
    <div className="page">
      <section className="hero">
        <h1>Is the Earth changing where you live?</h1>
        <p className="lead">
          {view === 'simple'
            ? 'Satellites have watched the planet for more than 20 years. Pick a place, pick a question, and see whether the numbers are really changing or just wobbling up and down.'
            : 'Explore NASA satellite and reanalysis records for a region, remove the seasonal cycle, fit a trend, and read an honest significance verdict with its caveats.'}
        </p>
        <div className="demo-buttons">
          {DEMOS.map((d) => (
            <button key={d.id} type="button" className="btn btn-primary" onClick={() => go({ ...d.steps[0].route, demo: d.id, step: 0 })}>
              ▶ Watch a demo: {t(catalog.regions.find((r) => r.id === d.id)?.name ?? d.id).replace(/ \(.*\)/, '')}
            </button>
          ))}
        </div>
      </section>
      <div className="home-grid">
        <RegionMap regions={listed} onSelect={(id) => go({ screen: 'theme', region: id })} className="map map-home" />
        <section aria-labelledby="regions-h">
          <h2 id="regions-h">{view === 'simple' ? 'Choose a place' : 'Regions'}</h2>
          <ul className="region-list">
            {listed.map((r) => (
              <li key={r.id} className="card">
                <h3>{t(r.name)}</h3>
                <p>{t(r.description)}</p>
                <p className="muted">{r.regime}</p>
                <button type="button" className="btn" onClick={() => go({ screen: 'theme', region: r.id })}>
                  Explore this region
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
