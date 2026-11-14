import { useData, useView } from '../context'
import type { Route } from '../lib/route'

const ICONS: Record<string, string> = { heat: '🌡', water: '💧', air: '🌫' }

export function ThemePicker({ route, go }: { route: Route; go: (r: Route) => void }) {
  const { catalog } = useData()
  const { t, view } = useView()
  const region = catalog.regions.find((r) => r.id === route.region)
  return (
    <div className="page">
      <nav aria-label="Breadcrumb">
        <button type="button" className="link" onClick={() => go({ screen: 'home' })}>
          ← All regions
        </button>
      </nav>
      <h1>{region ? t(region.name) : 'Pick a region first'}</h1>
      <p className="lead">{view === 'simple' ? 'What do you want to know?' : 'Choose a theme.'}</p>
      {!region ? (
        <button type="button" className="btn" onClick={() => go({ screen: 'home' })}>
          Choose a region
        </button>
      ) : (
        <ul className="theme-grid">
          {catalog.themes.map((th) => (
            <li key={th.id}>
              <button type="button" className="theme-card" onClick={() => go({ screen: 'shortlist', region: region.id, theme: th.id })}>
                <span aria-hidden="true" className="theme-icon">
                  {ICONS[th.id] ?? '•'}
                </span>
                <span className="theme-name">{t(th.name)}</span>
                <span className="theme-q">{t(th.question)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
