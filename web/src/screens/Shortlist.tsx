import { useState } from 'react'
import { useData, useView } from '../context'
import { tx } from '../i18n'
import { useAsync } from '../lib/useAsync'
import { Timeline } from '../components/Timeline'
import { certaintyOf } from '../components/CertaintyMeter'
import { SourceTag } from '../components/SourceTag'
import { VerdictChip } from '../components/VerdictChip'
import { Sparkline, TrendArrow } from '../components/Sparkline'
import { classifyLiveError, LiveNotice } from '../components/LiveNotice'
import { parsePlace, placeRegion } from '../lib/place'
import { formatSlope } from '../lib/text'
import { availabilityOf, cleanPlaceName, directionOf, splitEntries, summarize, variableRefFromEntry } from '../lib/findings'
import { useL, type FKey } from '../lib/findingsCopy'
import type { Route } from '../lib/route'
import type { Comparison, ScanEntry, ScanResult } from '../types/contract'
import type { RegionCard, VariableCard } from '../types/catalog'
import './Findings.css'

export function Shortlist({ route, go }: { route: Route; go: (r: Route) => void }) {
  const { client, catalog } = useData()
  const { view } = useView()
  const l = useL()
  const [attempt, setAttempt] = useState(0)
  const place = parsePlace(route.place)
  const custom = place !== null
  const region = place ? placeRegion(place) : catalog.regions.find((r) => r.id === route.region)
  const themeId = route.theme ?? catalog.themes[0]?.id
  const theme = catalog.themes.find((x) => x.id === themeId)
  const scan = useAsync(() => {
    if (!region || !themeId) return Promise.reject(new Error('no region'))
    return place ? client.customScan(place, themeId) : client.scan(region.id, themeId)
  }, [region?.id, themeId, attempt])
  if (!region) {
    return (
      <div className="page">
        <p>{l('findings.pickRegion')}</p>
        <button type="button" className="btn" onClick={() => go({ screen: 'home' })}>
          {l('findings.choosePlace')}
        </button>
      </div>
    )
  }
  const set = (patch: Partial<Route>) => go({ ...route, screen: 'shortlist', theme: themeId, ...patch })
  const placeName = cleanPlaceName(tx(region.name, view))
  const data = scan.loading ? null : scan.data
  const { available, unavailable } = splitEntries(data?.entries ?? [])
  const summary = summarize(available)
  const open = (e: ScanEntry) => {
    const declared = region.declared_seasons.some((s) => s.variable === e.variable_id && s.id === route.season)
    go({ screen: 'variable', region: custom ? undefined : region.id, place: route.place, theme: themeId, variable: e.variable_id, season: declared ? route.season : undefined, start: route.start, end: route.end })
  }
  const years = data?.window_start && data.window_end ? { start: data.window_start.slice(0, 4), end: data.window_end.slice(0, 4) } : null
  const placeText = data?.place?.text ? tx(data.place.text, view) : region.listed !== false && !custom ? tx(region.description, view) : ''

  return (
    <div className="findings">
      <header className="findings-head">
        <p className="eyebrow">{l('findings.eyebrow')}</p>
        <h1 id="res-h">{placeName}</h1>
        {theme && <p className="findings-q">{tx(theme.question, view)}</p>}
        {placeText && <p className="muted place-text">{placeText}</p>}
        <EditBar route={route} region={region} custom={custom} themeId={themeId} set={set} go={go} />
      </header>

      <section aria-labelledby="res-h" aria-busy={scan.loading}>
        {scan.loading && <LoadingState />}
        {!scan.loading && scan.error && <ErrorState error={scan.error} custom={custom} go={go} onRetry={() => setAttempt((n) => n + 1)} />}
        {data && (
          <>
            {years && <p className="muted small">{l('findings.commonWindow', { start: years.start, end: years.end })}</p>}
            {available.length > 0 ? (
              <Summary summary={summary} scan={data} />
            ) : (
              <EmptyState themeId={themeId} set={set} />
            )}
            {available.length > 0 && (
              <ul className="fgrid">
                {available.map((e) => (
                  <FindingCard key={e.variable_id} e={e} card={catalog.variables.find((v) => v.id === e.variable_id)} onOpen={() => open(e)} />
                ))}
              </ul>
            )}
            {unavailable.length > 0 && <UnavailableRow entries={unavailable} startOpen={available.length === 0} />}
            {custom && <p className="muted small">{l('findings.livePlace')}</p>}
            {available.length > 0 && (
              <details className="coverage">
                <summary>{l('findings.coverage')}</summary>
                <Timeline entries={available} variables={catalog.variables} />
              </details>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function EditBar({ route, region, custom, themeId, set, go }: { route: Route; region: RegionCard; custom: boolean; themeId?: string; set: (p: Partial<Route>) => void; go: (r: Route) => void }) {
  const { catalog } = useData()
  const { view } = useView()
  const l = useL()
  const seasons = [...new Map(region.declared_seasons.map((s) => [s.id, s])).values()]
  const pickable = catalog.regions.filter((r) => r.listed !== false || r.id === region.id)
  return (
    <div className="editbar" role="group" aria-label={l('findings.editLabel')}>
      <span className="editbar-label">{l('findings.edit')}</span>
      {custom ? (
        <span className="chip chip-static">
          <span className="chip-k">{l('findings.chip.place')}</span>
          <span>{cleanPlaceName(tx(region.name, view))}</span>
          <button type="button" className="link" onClick={() => go({ screen: 'home' })}>
            {l('findings.changePlace')}
          </button>
        </span>
      ) : (
        <label className="chip">
          <span className="chip-k">{l('findings.chip.place')}</span>
          <select value={region.id} onChange={(e) => e.target.value !== region.id && set({ region: e.target.value, place: undefined, season: undefined })}>
            {pickable.map((r) => (
              <option key={r.id} value={r.id}>
                {cleanPlaceName(tx(r.name, view))}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="chip">
        <span className="chip-k">{l('findings.chip.question')}</span>
        <select value={themeId} onChange={(e) => set({ theme: e.target.value })}>
          {catalog.themes.map((th) => (
            <option key={th.id} value={th.id}>
              {tx(th.name, view)}
            </option>
          ))}
        </select>
      </label>
      <span className="chip" role="group" aria-label={l('findings.chip.years')}>
        <span className="chip-k">{l('findings.chip.years')}</span>
        <input type="number" inputMode="numeric" min={1980} max={2026} aria-label={l('findings.from')} placeholder={l('findings.anyYear')} value={route.start ?? ''} onChange={(e) => set({ start: e.target.value || undefined })} />
        <span aria-hidden="true">–</span>
        <input type="number" inputMode="numeric" min={1980} max={2026} aria-label={l('findings.to')} placeholder={l('findings.anyYear')} value={route.end ?? ''} onChange={(e) => set({ end: e.target.value || undefined })} />
      </span>
      {!custom && seasons.length > 0 && (
        <label className="chip">
          <span className="chip-k">{l('findings.chip.season')}</span>
          <select value={route.season ?? ''} onChange={(e) => set({ season: e.target.value || undefined })}>
            <option value="">{l('findings.allMonths')}</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {tx(s.name, view)}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="muted small editbar-hint">{route.season && !custom ? l('findings.seasonHint') : l('findings.yearsHint')}</p>
    </div>
  )
}

function Summary({ summary, scan }: { summary: ReturnType<typeof summarize>; scan: ScanResult }) {
  const { view } = useView()
  const l = useL()
  const { total, clear, strongest } = summary
  const vars = { clear, total, alpha: scan.alpha }
  const key: FKey =
    clear === 0 ? (total === 1 ? 'findings.summary.noneOne' : 'findings.summary.none') : total === 1 ? 'findings.summary.oneOfOne' : clear === 1 ? 'findings.summary.one' : 'findings.summary.some'
  return (
    <div className="summary" role="status">
      <p className="summary-main">{l(key, vars)}</p>
      {strongest && (
        <p className="summary-sub">{l('findings.strongest', { name: tx(strongest.name, view), slope: formatSlope(strongest.slope_per_decade, strongest.units, view) })}</p>
      )}
      {view === 'scientific' && <p className="muted small">{l('findings.scanNote', { n: total, alpha: scan.alpha })}</p>}
    </div>
  )
}

function LoadingState() {
  const l = useL()
  return (
    <div>
      <p className="loading-text" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        {l('findings.loading')}
      </p>
      <ul className="fgrid" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="fcard fcard-skeleton">
            <span className="sk sk-title" />
            <span className="sk sk-line" />
            <span className="sk sk-spark" />
            <span className="sk sk-chip" />
          </li>
        ))}
      </ul>
    </div>
  )
}

function ErrorState({ error, custom, go, onRetry }: { error: Error; custom: boolean; go: (r: Route) => void; onRetry: () => void }) {
  const { catalog } = useData()
  const { view } = useView()
  const l = useL()
  // The service accepted the request but rejected the place or the years: say exactly that (existing notice).
  if (custom && classifyLiveError(error) !== 'down') return <LiveNotice error={error} go={go} />
  return (
    <div role="alert" className="state state-error">
      <p className="state-title">{l(custom ? 'findings.error.down' : 'findings.error.noSaved')}</p>
      {custom && (
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          {l('findings.retry')}
        </button>
      )}
      {view === 'scientific' && <p className="small muted">{error.message}</p>}
      <p className="small">{l('findings.readyMade')}:</p>
      <ul className="inline-list">
        {catalog.regions
          .filter((r) => r.listed !== false)
          .map((r) => (
            <li key={r.id}>
              <button type="button" className="link" onClick={() => go({ screen: 'theme', region: r.id })}>
                {cleanPlaceName(tx(r.name, view))}
              </button>
            </li>
          ))}
      </ul>
    </div>
  )
}

function EmptyState({ themeId, set }: { themeId?: string; set: (p: Partial<Route>) => void }) {
  const { catalog } = useData()
  const { view } = useView()
  const l = useL()
  return (
    <div className="state state-empty">
      <p className="state-title">{l('findings.empty.title')}</p>
      <p>{l('findings.empty.help')}</p>
      <ul className="inline-list" aria-label={l('findings.otherQuestions')}>
        {catalog.themes
          .filter((th) => th.id !== themeId)
          .map((th) => (
            <li key={th.id}>
              <button type="button" className="btn" onClick={() => set({ theme: th.id })}>
                {tx(th.name, view)}
              </button>
            </li>
          ))}
      </ul>
    </div>
  )
}

function SecondOpinion({ c }: { c: Comparison }) {
  const { view } = useView()
  const l = useL()
  if (!c.outcome) return null
  return (
    <p className="fcard-second small">
      <strong>{l('findings.secondOpinion')}:</strong> {l(`findings.second.${c.outcome}` as FKey)}
      {view === 'scientific' && c.text && <> · {tx(c.text, view)}</>}
    </p>
  )
}

export function FindingCard({ e, card, onOpen }: { e: ScanEntry; card?: VariableCard; onOpen: () => void }) {
  const { view } = useView()
  const l = useL()
  const certainty = certaintyOf(e.verdict_label)
  const dir = directionOf(e.slope_per_decade)
  const years = e.yearly_series && e.yearly_series.length > 1 ? e.yearly_series : null
  const name = tx(e.name, view)
  const sure = certainty === 'sure'
  const dec = e.units.decimals
  return (
    <li className={`fcard fcard-${certainty}`}>
      <h3 className="fcard-name">
        <button type="button" className="fcard-open" aria-label={l('findings.open', { name })} onClick={onOpen}>
          {name}
        </button>
      </h3>
      <SourceTag variable={variableRefFromEntry(e, card)} />
      {card && <p className="fcard-def muted">{tx(card.definition, view)}</p>}
      {years && (
        <div className="fcard-trend">
          <Sparkline series={years} label={l('findings.spark', { from: years[0].year, to: years[years.length - 1].year })} />
          {dir && <TrendArrow direction={dir} sure={sure} label={l(`findings.heading.${dir}` as FKey)} />}
        </div>
      )}
      <div className="fcard-verdict">
        <VerdictChip certainty={certainty} />
        {e.worth_investigating ? (
          <span className="fcard-rec small">{l('findings.recommended')}</span>
        ) : (
          !sure && <span className="fcard-rec small muted">{l('findings.hardToSpot')}</span>
        )}
      </div>
      {e.cross_check && <SecondOpinion c={e.cross_check} />}
      {view === 'scientific' && (
        <p className="muted small">
          {e.slope_per_decade != null && formatSlope(e.slope_per_decade, e.units, view)}
          {e.p_adjusted != null && <> · {l('findings.adjP', { p: e.p_adjusted.toFixed(3) })}</>}
          {e.mdt_per_decade != null && <> · MDT {e.mdt_per_decade.toFixed(dec)} {e.units.display}/decade</>}
        </p>
      )}
    </li>
  )
}

export function UnavailableRow({ entries, startOpen }: { entries: ScanEntry[]; startOpen: boolean }) {
  const { view } = useView()
  const l = useL()
  return (
    <details className="unavail" open={startOpen}>
      <summary>{l('findings.notAvailable', { n: entries.length })}</summary>
      <ul>
        {entries.map((e) => {
          const a = availabilityOf(e)
          return (
            <li key={e.variable_id}>
              <strong>{tx(e.name, view)}</strong>
              <span className="muted">: {e.reason ? tx(e.reason, view) : l(`findings.unavailable.${a}` as FKey)}</span>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
