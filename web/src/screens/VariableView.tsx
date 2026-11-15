import { useEffect, useState } from 'react'
import { useData, useView } from '../context'
import { useAsync } from '../lib/useAsync'
import { Charts } from '../components/Charts'
import { VerdictCard } from '../components/Verdict'
import { StartYears } from '../components/StartYears'
import { TrustPanel } from '../components/TrustPanel'
import { SourceTag } from '../components/SourceTag'
import { cleanInternal, fmt, useResultCopy } from '../lib/resultCopy'
import { Term } from '../components/Term'
import { TermText } from '../components/TermText'
import type { Route } from '../lib/route'
import { capFirst, parseYm } from '../lib/text'
import { COPY } from '../lib/copy'
import { LiveNotice } from '../components/LiveNotice'
import { WhereElse } from '../components/WhereElse'
import { parsePlace, placeRegion } from '../lib/place'
import { YourYears } from '../components/YourYears'
import { HowStrip } from '../components/HowStrip'

/** Route years are `YYYY` (typed by the user) or `YYYY-MM` (handed over by a shortlist card: its exact shared window). */
export function periodMonth(v: string | undefined, edge: 'start' | 'end'): string | undefined {
  if (!v) return undefined
  return /^\d{4}-\d{2}$/.test(v) ? v : `${v}-${edge === 'start' ? '01' : '12'}`
}

export function VariableView({ route, go }: { route: Route; go: (r: Route) => void }) {
  const { client, catalog } = useData()
  const { view } = useView()
  const { s, c, bx } = useResultCopy()
  const place = parsePlace(route.place)
  const custom = place !== null
  const region = place ? placeRegion(place) : catalog.regions.find((r) => r.id === route.region)
  const card = catalog.variables.find((v) => v.id === route.variable)
  const customPeriod = Boolean(route.start || route.end)
  // opened from a shortlist card: the period is that card's shared window, so both say the same thing
  const fromList = /^\d{4}-\d{2}$/.test(route.start ?? '') && /^\d{4}-\d{2}$/.test(route.end ?? '')
  const pStart = periodMonth(route.start, 'start')
  const pEnd = periodMonth(route.end, 'end')
  const res = useAsync(async () => {
    if (!region || !card) throw new Error('unknown region or variable')
    if (place) return client.customResult(place, card.id, { start: pStart, end: pEnd })
    if (!customPeriod) return client.result(region.id, card.id, route.season)
    return client.analyze(region.id, card.id, { start: pStart, end: pEnd, seasonId: route.season })
  }, [region?.id, card?.id, route.place, route.season, route.start, route.end])

  // years the user typed (not a card's shared window): also fetch the declared default answer to show beside it
  const userPeriod = customPeriod && !fromList
  const declared = useAsync(async () => {
    if (!userPeriod || !region || !card) return null
    if (place) return client.customResult(place, card.id, {})
    return client.result(region.id, card.id, route.season)
  }, [userPeriod, region?.id, card?.id, route.place, route.season])

  const [start, setStart] = useState(route.start?.slice(0, 4) ?? '')
  const [end, setEnd] = useState(route.end?.slice(0, 4) ?? '')
  useEffect(() => {
    setStart(route.start?.slice(0, 4) ?? '')
    setEnd(route.end?.slice(0, 4) ?? '')
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
    // keep the card's exact months when the user did not change the years
    const keep = (typed: string, cur?: string) => (typed && cur?.slice(0, 4) === typed ? cur : typed || undefined)
    go({ ...route, start: keep(start, route.start), end: keep(end, route.end) })
  }
  const invalid = Boolean(start && end && Number(start) > Number(end))
  return (
    <div className="page variable">
      <nav aria-label={s('result.breadcrumb', 'Breadcrumb')}>
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
              {capFirst(bx(sn.name))}
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
              {fromList ? s('result.period.allYears', 'Use all the years we have', 'Use the full record') : s('result.period.reset', 'Reset to default')}
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
          {custom && res.data.variable.delivered_by === 'NASA POWER' && <p className="muted small">{c('result.powerCredit', COPY.powerCredit)}</p>}
          {(res.data as { customPeriodUnavailable?: boolean }).customPeriodUnavailable && (
            <p role="status" className="notice">
              {s('result.periodUnavailable', 'Custom period unavailable right now, showing the default.')}
            </p>
          )}
          {fromList && res.data.window && !(res.data as { customPeriodUnavailable?: boolean }).customPeriodUnavailable && (
            <p className="muted small" data-testid="same-years-note">
              {s('result.sameYears', 'Same years as the list.', 'Same window as the shortlist card (shared window across the theme). The card is also corrected for testing all the theme\'s variables at once (Benjamini–Hochberg), so it can be more cautious than this page. Use the full record to see this variable on its own.')}
            </p>
          )}
          {res.data.window && (
            <p className="muted">
              <TermText
                text={
                  view === 'simple'
                    ? s('result.window.simple', 'Years used: {from} to {to}{season}. We take away the {seasonal_cycle} first.', '', {
                        from: res.data.window.start.slice(0, 4),
                        to: res.data.window.end.slice(0, 4),
                        season: res.data.season ? ` (${bx(res.data.season.name)})` : '',
                        seasonal_cycle: '{seasonal_cycle}',
                      })
                    : s('result.window.sci', '', 'Window: {from} to {to} ({years} years{season}). {seasonal_cycle} removed per calendar month.', {
                        from: res.data.window.start,
                        to: res.data.window.end,
                        years: fmt(res.data.window.years, 1),
                        season: res.data.season ? `, ${bx(res.data.season.name)}` : '',
                        seasonal_cycle: '{seasonal_cycle}',
                      })
                }
                terms={{ seasonal_cycle: <Term id="seasonal_cycle" cap={view !== 'simple'} /> }}
              />
            </p>
          )}
          <div className="variable-grid">
            <div className="variable-main">
              {userPeriod && !(res.data as { customPeriodUnavailable?: boolean }).customPeriodUnavailable && (
                <YourYears mine={res.data} declared={declared.loading ? null : declared.data} />
              )}
              <VerdictCard result={res.data} />
              <TrustPanel result={res.data} />
              <StartYears result={res.data} />
            </div>
            <Charts result={res.data} fromList={fromList && !(res.data as { customPeriodUnavailable?: boolean }).customPeriodUnavailable} />
          </div>
          <HowStrip />
          <WhereElse variableId={card.id} route={route} go={go} />
        </>
      )}
    </div>
  )
}
