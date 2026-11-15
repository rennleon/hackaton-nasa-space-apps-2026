import { useData, useView } from '../context'
import type { Route } from '../lib/route'
import { parsePlace, placeRegion } from '../lib/place'
import { useStartT } from '../lib/startT'
import { topLevel } from '../lib/themes'
import { SubTopicRow } from '../components/SubTopicRow'
import { ThemeIcon } from '../components/ThemeIcon'

export function ThemePicker({ route, go }: { route: Route; go: (r: Route) => void }) {
  const { catalog } = useData()
  const { t } = useView()
  const { s } = useStartT()
  const place = parsePlace(route.place)
  const region = place ? placeRegion(place) : catalog.regions.find((r) => r.id === route.region)
  const ask = (theme: string) => go({ screen: 'shortlist', region: place ? undefined : region?.id, place: route.place, theme })
  return (
    <div className="page">
      <nav aria-label={s('theme.breadcrumb', 'Breadcrumb')}>
        <button type="button" className="link" onClick={() => go({ screen: 'home' })}>
          {s('theme.all', '← All places', '← All regions')}
        </button>
      </nav>
      <h1>{region ? t(region.name) : s('theme.pickFirst', 'Pick a place first', 'Pick a region first')}</h1>
      <p className="lead">{s('theme.lead', 'What do you want to know?', 'Choose a theme.')}</p>
      {!region ? (
        <button type="button" className="btn" onClick={() => go({ screen: 'home' })}>
          {s('theme.choose', 'Choose a place', 'Choose a region')}
        </button>
      ) : (
        <ul className="theme-grid">
          {topLevel(catalog.themes).map((th) => (
            <li key={th.id} className="theme-item">
              <button type="button" className="theme-card" onClick={() => ask(th.id)}>
                <span aria-hidden="true" className="theme-icon">
                  <ThemeIcon id={th.id} />
                </span>
                <span className="theme-name">{t(th.name)}</span>
                <span className="theme-q">{t(th.question)}</span>
              </button>
              <SubTopicRow parentId={th.id} onPick={ask} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
