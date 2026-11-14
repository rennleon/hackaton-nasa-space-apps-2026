import { useData, useView } from '../context'
import { useAsync } from '../lib/useAsync'
import { RegionMap } from '../components/RegionMap'
import { Term } from '../components/Term'
import { Timeline } from '../components/Timeline'
import { sortEntries } from '../lib/labels'
import { CertaintyMeter, certaintyOf } from '../components/CertaintyMeter'
import { COPY } from '../lib/copy'
import { LiveNotice } from '../components/LiveNotice'
import { parsePlace, placeRegion } from '../lib/place'
import { formatSlope } from '../lib/text'
import type { Route } from '../lib/route'
import type { ScanEntry } from '../types/contract'
import type { VariableCard } from '../types/catalog'

export function Shortlist({ route, go }: { route: Route; go: (r: Route) => void }) {
  const { client, catalog } = useData()
  const { t, view } = useView()
  const place = parsePlace(route.place)
  const custom = place !== null
  const region = place ? placeRegion(place) : catalog.regions.find((r) => r.id === route.region)
  const themeId = route.theme ?? catalog.themes[0]?.id
  const theme = catalog.themes.find((x) => x.id === themeId)
  const scan = useAsync(() => {
    if (!region || !themeId) return Promise.reject(new Error('no region'))
    return place ? client.customScan(place, themeId) : client.scan(region.id, themeId)
  }, [region?.id, themeId])
  if (!region) {
    return (
      <div className="page">
        <p>Pick a region first.</p>
        <button type="button" className="btn" onClick={() => go({ screen: 'home' })}>
          Choose a region
        </button>
      </div>
    )
  }
  const seasons = [...new Map(region.declared_seasons.map((s) => [s.id, s])).values()]
  const set = (patch: Partial<Route>) => go({ ...route, screen: 'shortlist', theme: themeId, ...patch })
  const goRegion = (id: string) => set({ region: id, place: undefined, season: undefined })
  const entries = scan.data ? sortEntries(scan.data.entries) : []
  const comparisonCard = catalog.regions.find((r) => r.id === region.comparison_region)
  const comparison = comparisonCard && comparisonCard.listed !== false ? comparisonCard.id : null
  const pickable = custom ? [region, ...catalog.regions.filter((r) => r.listed !== false)] : catalog.regions.filter((r) => r.listed !== false || r.id === region.id)
  return (
    <div className="shortlist">
      <aside className="filters" aria-label="Filters">
        <h2>{view === 'simple' ? 'Your choices' : 'Filters'}</h2>
        <label>
          <span>Region</span>
          <select value={region.id} onChange={(e) => e.target.value !== region.id && goRegion(e.target.value)}>
            {pickable.map((r) => (
              <option key={r.id} value={r.id}>
                {t(r.name)}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Theme</legend>
          {catalog.themes.map((th) => (
            <label key={th.id} className="radio">
              <input type="radio" name="theme" checked={th.id === themeId} onChange={() => set({ theme: th.id })} /> {t(th.name)}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>{view === 'simple' ? 'Which years?' : 'Period (years)'}</legend>
          <div className="row">
            <label>
              <span>From</span>
              <input type="number" min={1980} max={2026} placeholder="default" value={route.start ?? ''} onChange={(e) => set({ start: e.target.value || undefined })} />
            </label>
            <label>
              <span>To</span>
              <input type="number" min={1980} max={2026} placeholder="default" value={route.end ?? ''} onChange={(e) => set({ end: e.target.value || undefined })} />
            </label>
          </div>
          <p className="muted small">Applied when you open a variable. Empty means the default window.</p>
        </fieldset>
        {!custom && (<>
        <label>
          <span>{view === 'simple' ? 'Only one time of year' : 'Season (recurring date range)'}</span>
          <select value={route.season ?? ''} onChange={(e) => set({ season: e.target.value || undefined })}>
            <option value="">All months</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {t(s.name)}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          Only variables that declare this <Term id="seasonal_cycle">season</Term> open in it.
        </p>
        </>)}
      </aside>

      <section className="results" aria-labelledby="res-h" aria-busy={scan.loading}>
        <h1 id="res-h">{theme ? t(theme.question) : 'Shortlist'}</h1>
        <p className="muted">{view === 'simple' ? t(COPY.shortlistIntro) : `Scan of ${entries.length} variables, α = ${scan.data?.alpha ?? 0.05}, Benjamini–Hochberg adjusted (false discovery control).`}</p>
        {scan.data?.common_window && scan.data.window_start && scan.data.window_end && (
          <p className="muted">
            {view === 'simple'
              ? COPY.commonWindow(scan.data.window_start.slice(0, 4), scan.data.window_end.slice(0, 4)).simple
              : COPY.commonWindow(scan.data.window_start, scan.data.window_end).scientific}
          </p>
        )}
        {scan.loading && <p aria-live="polite">{custom ? t(COPY.loadingPlace) : 'Loading…'}</p>}
        {scan.error && custom && <LiveNotice error={scan.error} go={go} />}
        {scan.error && !custom && <p role="alert" className="error">No scan available for this region and theme yet.</p>}
        {custom && scan.data && <p className="muted small">{t(COPY.powerCredit)}</p>}
        <ul className="cards">
          {entries.map((e) => (
            <EntryCard key={e.variable_id} e={e} card={catalog.variables.find((v) => v.id === e.variable_id)} onOpen={() => {
              const declared = region.declared_seasons.some((s) => s.variable === e.variable_id && s.id === route.season)
              go({ screen: 'variable', region: custom ? undefined : region.id, place: route.place, theme: themeId, variable: e.variable_id, season: declared ? route.season : undefined, start: route.start, end: route.end })
            }} />
          ))}
        </ul>
      </section>

      <aside className="mapcol" aria-label="Map">
        <RegionMap regions={custom ? [region] : catalog.regions} selectedId={region.id} visibleIds={[region.id, ...(comparison ? [comparison] : [])]} onSelect={(id) => !custom && set({ region: id })} className="map map-side" />
        <p className="muted small">
          {t(region.description)} {comparison && <>The dashed box is the comparison region used as a cross-check.</>}
        </p>
      </aside>

      {scan.data && (
        <div className="bottom">
          <Timeline entries={entries} variables={catalog.variables} />
        </div>
      )}
    </div>
  )
}

function EntryCard({ e, card, onOpen }: { e: ScanEntry; card?: VariableCard; onOpen: () => void }) {
  const { t, view } = useView()
  const simple = view === 'simple'
  const dec = e.units.decimals
  return (
    <li className="card entry">
      <div className="entry-head">
        <h3>{t(e.name)}</h3>
        <span className="tag">{t(e.source_type === 'model' ? COPY.modelTag : COPY.observedTag)}</span>
      </div>
      {card && <p className="muted">{t(card.definition)}</p>}
      <CertaintyMeter certainty={certaintyOf(e.verdict_label)} compact />
      <p className="small">
        <strong>
          <span aria-hidden="true">{e.worth_investigating ? '🔎' : '–'}</span> {t(e.worth_investigating ? COPY.worthYes : COPY.worthNo)}
        </strong>
      </p>
      {e.why && <p className="muted">{t(e.why)}</p>}
      {!simple && (
        <p className="muted small">
          {e.slope_per_decade != null && (
            <>
              {formatSlope(e.slope_per_decade, e.units, view)} (<Term id="per_decade">trend per decade</Term>)
            </>
          )}
          {e.p_adjusted != null && <> · adj. p = {e.p_adjusted.toFixed(3)}</>}
          {e.mdt_per_decade != null && <> · MDT {e.mdt_per_decade.toFixed(dec)} {e.units.display}/decade</>}
          {' · '}
          {e.role.replace('_', '-')}
          {e.reason && <> · {t(e.reason)}</>}
        </p>
      )}
      {simple && e.slope_per_decade == null && e.reason && e.reason.simple !== e.why?.simple && (
        <p className="muted">{t(e.reason)}</p>
      )}
      <button type="button" className="btn" onClick={onOpen}>
        Open {t(e.name)}
      </button>
    </li>
  )
}
