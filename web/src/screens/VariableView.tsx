import { useEffect, useState } from 'react'
import { useData, useView } from '../context'
import { useAsync } from '../lib/useAsync'
import { Charts } from '../components/Charts'
import { VerdictCard } from '../components/Verdict'
import { TrustPanel } from '../components/TrustPanel'
import { SourceTag } from '../components/SourceTag'
import { cleanInternal, fmt, useResultCopy } from '../lib/resultCopy'
import { Term } from '../components/Term'
import type { Route } from '../lib/route'
import { parseYm } from '../lib/text'
import { COPY } from '../lib/copy'
import { LiveNotice } from '../components/LiveNotice'
import { parsePlace, placeRegion } from '../lib/place'

export function VariableView({ route, go }: { route: Route; go: (r: Route) => void }) {
  const { client, catalog } = useData()
  const { view } = useView()
  const { s, c, bx } = useResultCopy()
  const place = parsePlace(route.place)
  const custom = place !== null
  const region = place ? placeRegion(place) : catalog.regions.find((r) => r.id === route.region)
  const card = catalog.variables.find((v) => v.id === route.variable)
  const customPeriod = Boolean(route.start || route.end)
  const res = useAsync(async () => {
    if (!region || !card) throw new Error('unknown region or variable')
    if (place) {
      return client.customResult(place, card.id, { start: route.start ? `${route.start}-01` : undefined, end: route.end ? `${route.end}-12` : undefined })
    }
    if (!customPeriod) return client.result(region.id, card.id, route.season)
    return client.analyze(region.id, card.id, {
      start: route.start ? `${route.start}-01` : undefined,
      end: route.end ? `${route.end}-12` : undefined,
      seasonId: route.season,
    })
  }, [region?.id, card?.id, route.place, route.season, route.start, route.end])

  const [start, setStart] = useState(route.start ?? '')
  const [end, setEnd] = useState(route.end ?? '')
  useEffect(() => {
    setStart(route.start ?? '')
    setEnd(route.end ?? '')
  }, [route.start, route.end])

  if (!region || !card) {
    return (
      <div className="page">
        <p>{s('result.unknown', 'Unknown variable.')}</p>
        <button type="button" className="btn" onClick={() => go({ screen: 'home' })}>
          {s('result.home', 'Home')}
        </button>
      </div>
    )
  }
  const seasons = region.declared_seasons.filter((s) => s.variable === card.id)
  const minYear = parseYm(card.record_start).y
  const w = res.data?.window
  const back = () => go({ screen: 'shortlist', region: custom ? undefined : region.id, place: route.place, theme: route.theme, season: route.season })
  const apply = (e: React.FormEvent) => {
    e.preventDefault()
    go({ ...route, start: start || undefined, end: end || undefined })
  }
  const invalid = Boolean(start && end && Number(start) > Number(end))
  return (
    <div className="page variable">
      <nav aria-label="Breadcrumb">
        <button type="button" className="link" onClick={back}>
          {s('result.back', '← Back to the shortlist')}
        </button>
      </nav>
      <h1>{bx(card.name)}</h1>
      {res.data && <SourceTag variable={res.data.variable} />}
      <p className="muted">
        {cleanInternal(bx(region.name), view)} · {bx(card.definition)}
      </p>

      <div className="controls">
        {!custom && (
        <div role="tablist" aria-label={s('result.season.label', 'Time of year')} className="tabs">
          <button role="tab" type="button" aria-selected={!route.season} onClick={() => go({ ...route, season: undefined })}>
            {s('result.season.all', 'All months')}
          </button>
          {seasons.map((sn) => (
            <button key={sn.id} role="tab" type="button" aria-selected={route.season === sn.id} onClick={() => go({ ...route, season: sn.id })}>
              {bx(sn.name)}
            </button>
          ))}
        </div>
        )}
        <form className="period" onSubmit={apply}>
          <label>
            <span>{s('result.period.from', 'From year', 'Start year')}</span>
            <input type="number" min={minYear} max={2026} value={start} placeholder={w ? w.start.slice(0, 4) : s('result.period.default', 'default')} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            <span>{s('result.period.to', 'To year', 'End year')}</span>
            <input type="number" min={minYear} max={2026} value={end} placeholder={w ? w.end.slice(0, 4) : s('result.period.default', 'default')} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <button type="submit" className="btn" disabled={invalid}>
            {s('result.period.apply', 'Analyze period')}
          </button>
          {customPeriod && (
            <button type="button" className="link" onClick={() => go({ ...route, start: undefined, end: undefined })}>
              {s('result.period.reset', 'Reset to default')}
            </button>
          )}
          {invalid && <span role="alert" className="error">{s('result.period.invalid', 'Start must be before end.')}</span>}
        </form>
      </div>

      {res.loading && <p aria-live="polite">{custom ? c('result.loadingPlace', COPY.loadingPlace) : s('result.loading', 'Loading…')}</p>}
      {res.error && custom && <LiveNotice error={res.error} go={go} />}
      {res.error && !custom && (
        <p role="alert" className="error">
          {s('result.noResult', 'No result is available for this combination yet.')}
        </p>
      )}
      {res.data && (
        <>
          {custom && <p className="muted small">{c('result.powerCredit', COPY.powerCredit)}</p>}
          {(res.data as { customPeriodUnavailable?: boolean }).customPeriodUnavailable && (
            <p role="status" className="notice">
              {s('result.periodUnavailable', 'Custom period unavailable right now, showing the default.')}
            </p>
          )}
          {res.data.window && (
            <p className="muted">
              {view === 'simple' ? (
                <>
                  {s('result.window.years', 'Years used: {from} to {to}.', '', { from: res.data.window.start.slice(0, 4), to: res.data.window.end.slice(0, 4) })}
                  {res.data.season ? ` (${bx(res.data.season.name)})` : ''} {s('result.window.seasons', 'We take away the', '')} <Term id="seasonal_cycle" /> {s('result.window.first', 'first.', '')}
                </>
              ) : (
                <>
                  {s('result.window.sci', '', 'Window: {from} to {to} ({years} years{season}). Seasonal cycle removed per calendar month:', {
                    from: res.data.window.start,
                    to: res.data.window.end,
                    years: fmt(res.data.window.years, 1),
                    season: res.data.season ? `, ${bx(res.data.season.name)}` : '',
                  })}{' '}
                  <Term id="seasonal_cycle" />
                </>
              )}
            </p>
          )}
          <div className="variable-grid">
            <div className="variable-main">
              <VerdictCard result={res.data} />
              <TrustPanel result={res.data} />
            </div>
            <Charts result={res.data} />
          </div>
        </>
      )}
    </div>
  )
}
