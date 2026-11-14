import { useEffect, useState } from 'react'
import { useData, useView } from '../context'
import { useAsync } from '../lib/useAsync'
import { Charts } from '../components/Charts'
import { SelectionPanel, VerdictCard } from '../components/Verdict'
import { Term } from '../components/Term'
import type { Route } from '../lib/route'
import { parseYm } from '../lib/text'

export function VariableView({ route, go }: { route: Route; go: (r: Route) => void }) {
  const { client, catalog } = useData()
  const { t, view } = useView()
  const region = catalog.regions.find((r) => r.id === route.region)
  const card = catalog.variables.find((v) => v.id === route.variable)
  const custom = Boolean(route.start || route.end)
  const res = useAsync(async () => {
    if (!region || !card) throw new Error('unknown region or variable')
    if (!custom) return client.result(region.id, card.id, route.season)
    return client.analyze(region.id, card.id, {
      start: route.start ? `${route.start}-01` : undefined,
      end: route.end ? `${route.end}-12` : undefined,
      seasonId: route.season,
    })
  }, [region?.id, card?.id, route.season, route.start, route.end])

  const [start, setStart] = useState(route.start ?? '')
  const [end, setEnd] = useState(route.end ?? '')
  useEffect(() => {
    setStart(route.start ?? '')
    setEnd(route.end ?? '')
  }, [route.start, route.end])

  if (!region || !card) {
    return (
      <div className="page">
        <p>Unknown variable.</p>
        <button type="button" className="btn" onClick={() => go({ screen: 'home' })}>
          Home
        </button>
      </div>
    )
  }
  const seasons = region.declared_seasons.filter((s) => s.variable === card.id)
  const minYear = parseYm(card.record_start).y
  const w = res.data?.window
  const back = () => go({ screen: 'shortlist', region: region.id, theme: route.theme, season: route.season })
  const apply = (e: React.FormEvent) => {
    e.preventDefault()
    go({ ...route, start: start || undefined, end: end || undefined })
  }
  const invalid = Boolean(start && end && Number(start) > Number(end))
  return (
    <div className="page variable">
      <nav aria-label="Breadcrumb">
        <button type="button" className="link" onClick={back}>
          ← Back to the shortlist
        </button>
      </nav>
      <h1>{t(card.name)}</h1>
      <p className="muted">
        {t(region.name)} · {t(card.definition)}
      </p>

      <div className="controls">
        <div role="tablist" aria-label="Time of year" className="tabs">
          <button role="tab" type="button" aria-selected={!route.season} onClick={() => go({ ...route, season: undefined })}>
            All months
          </button>
          {seasons.map((s) => (
            <button key={s.id} role="tab" type="button" aria-selected={route.season === s.id} onClick={() => go({ ...route, season: s.id })}>
              {t(s.name)}
            </button>
          ))}
        </div>
        <form className="period" onSubmit={apply}>
          <label>
            <span>{view === 'simple' ? 'From year' : 'Start year'}</span>
            <input type="number" min={minYear} max={2026} value={start} placeholder={w ? w.start.slice(0, 4) : 'default'} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            <span>{view === 'simple' ? 'To year' : 'End year'}</span>
            <input type="number" min={minYear} max={2026} value={end} placeholder={w ? w.end.slice(0, 4) : 'default'} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <button type="submit" className="btn" disabled={invalid}>
            Analyze period
          </button>
          {custom && (
            <button type="button" className="link" onClick={() => go({ ...route, start: undefined, end: undefined })}>
              Reset to default
            </button>
          )}
          {invalid && <span role="alert" className="error">Start must be before end.</span>}
        </form>
      </div>

      {res.loading && <p aria-live="polite">Loading…</p>}
      {res.error && (
        <p role="alert" className="error">
          No result is available for this combination yet.
        </p>
      )}
      {res.data && (
        <>
          {(res.data as { customPeriodUnavailable?: boolean }).customPeriodUnavailable && (
            <p role="status" className="notice">
              Custom period unavailable right now, showing the default.
            </p>
          )}
          {res.data.window && (
            <p className="muted">
              {view === 'simple' ? (
                <>
                  Years used: {res.data.window.start.slice(0, 4)} to {res.data.window.end.slice(0, 4)}
                  {res.data.season ? ` (${t(res.data.season.name)})` : ''}. We take away the <Term id="seasonal_cycle" /> first.
                </>
              ) : (
                <>
                  Window: {res.data.window.start} to {res.data.window.end} ({res.data.window.years.toFixed(1)} years
                  {res.data.season ? `, ${t(res.data.season.name)}` : ''}). Seasonal cycle removed per calendar month: <Term id="seasonal_cycle" />
                </>
              )}
            </p>
          )}
          <div className="variable-grid">
            <div className="variable-main">
              <VerdictCard result={res.data} />
              <SelectionPanel result={res.data} />
            </div>
            <Charts result={res.data} />
          </div>
        </>
      )}
    </div>
  )
}
