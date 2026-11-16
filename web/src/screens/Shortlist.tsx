import { useState } from 'react'
import { useData, useView } from '../context'
import { numberLocale, tx } from '../i18n'
import { useAsync } from '../lib/useAsync'
import { Timeline } from '../components/Timeline'
import { HomogeneityPanel } from '../components/HomogeneityPanel'
import { HowStrip } from '../components/HowStrip'
import { ThemeIcon } from '../components/ThemeIcon'
import { SourceTag } from '../components/SourceTag'
import { Term } from '../components/Term'
import { CertaintyIcon, VerdictChip } from '../components/VerdictChip'
import { Sparkline, TrendArrow } from '../components/Sparkline'
import { classifyLiveError, LiveNotice } from '../components/LiveNotice'
import { monthRuns } from '../lib/placeFacts'
import { sizeParts } from '../lib/places'
import { parsePlace, placeRegion } from '../lib/place'
import { capFirst, formatSlope, plainNum } from '../lib/text'
import { availabilityOf, certaintyOfEntry, cleanPlaceName, countByCertainty, directionOf, splitEntries, summarize, variableRefFromEntry, type Certainty } from '../lib/findings'
import { useL, type FKey } from '../lib/findingsCopy'
import { instrumentById } from '../lib/instruments'
import { instrumentHref, manySatellites, shortName, useS } from '../lib/sourceLabels'
import type { Route } from '../lib/route'
import type { Comparison, PlaceProfile, ScanEntry, ScanResult } from '../types/contract'
import { childrenOf, relatedThemes, topLevel } from '../lib/themes'
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
  const parentTheme = theme?.parent ? catalog.themes.find((x) => x.id === theme.parent) : undefined
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
    // open the variable page on the SAME years this card's verdict used (the scan's shared window, as YYYY-MM),
    // so the card and the page give the same answer; the page offers "all the years we have" from there
    // a season asks a different question than the card's all-months answer: then the page keeps its own default
    const typed = Boolean(route.start || route.end) // years typed on the shortlist win, both ends as typed
    const shared = !declared && !typed && data?.common_window && data.window_start && data.window_end
    go({
      screen: 'variable', region: custom ? undefined : region.id, place: route.place, theme: themeId, variable: e.variable_id,
      season: declared ? route.season : undefined,
      start: route.start ?? (shared ? data.window_start! : undefined),
      end: route.end ?? (shared ? data.window_end! : undefined),
    })
  }
  const years = data?.window_start && data.window_end ? { start: data.window_start.slice(0, 4), end: data.window_end.slice(0, 4) } : null
  const placeText = data?.place?.text ? tx(data.place.text, view) : region.listed !== false && !custom ? tx(region.description, view) : ''

  const notes = (
    <>
      {years && <p className="muted small">{l('findings.commonWindow', { start: years.start, end: years.end })}</p>}
      {parentTheme && (
        <p className="muted small">
          {l('findings.subtopicNote', { parent: view === 'simple' ? tx(parentTheme.name, view).toLowerCase() : tx(parentTheme.name, view), n: summary.total })}
        </p>
      )}
    </>
  )

  return (
    <div className="findings">
      <button type="button" className="findings-back link" onClick={() => go({ screen: 'home' })}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        {l('findings.back')}
      </button>

      <header className="findings-head">
        <div className="findings-title">
          <p className="eyebrow">{l('findings.eyebrow')}</p>
          <h1 id="res-h">{placeName}</h1>
          <PlaceFacts profile={data?.place} bbox={region.geometry.bbox} area={place?.kind === 'point' ? 'pin' : region.geometry.kind === 'shape' ? 'shape' : 'box'} />
          {parentTheme && theme && (
            <p className="muted small findings-crumb">
              {tx(parentTheme.name, view)} <span aria-hidden="true">›</span> {tx(theme.name, view)}
            </p>
          )}
          {theme && (
            <div className="findings-theme">
              <span className="theme-chip">
                <ThemeIcon id={theme.id} parent={theme.parent} size={16} />
                {tx(theme.name, view)}
              </span>
              <p className="findings-q">{tx(theme.question, view)}</p>
            </div>
          )}
          {placeText && <p className="muted place-text">{placeText}</p>}
          <HomogeneityPanel homogeneity={data?.place?.homogeneity} route={route} go={go} canTry={client.customPlaces !== false} />
        </div>
      </header>

      <EditBar route={route} region={region} custom={custom} themeId={themeId} set={set} go={go} years={years} />

      <section className="findings-body" aria-labelledby="res-h" aria-busy={scan.loading}>
        {scan.loading && <LoadingState />}
        {!scan.loading && scan.error && <ErrorState error={scan.error} custom={custom} go={go} onRetry={() => setAttempt((n) => n + 1)} />}
        {data && (
          <>
            {available.length > 0 ? (
              <>
                <Summary summary={summary} scan={data} available={available} notes={notes} />
                <HowStrip />
                <Legend entries={available} variables={catalog.variables} />
              </>
            ) : (
              <>
                <div className="findings-notes">{notes}</div>
                <EmptyState themeId={themeId} set={set} />
              </>
            )}
            {available.length > 0 && <h2 className="visually-hidden">{l('findings.facts.cards')}</h2>}
            {available.length > 0 && (
              <ul className="fgrid">
                {available.map((e) => (
                  <FindingCard key={e.variable_id} e={e} card={catalog.variables.find((v) => v.id === e.variable_id)} onOpen={() => open(e)} />
                ))}
              </ul>
            )}
            {available.length > 0 && <Timeline entries={available} variables={catalog.variables} />}
            {unavailable.length > 0 && <UnavailableRow entries={unavailable} startOpen={available.length === 0} />}
            {custom && <p className="muted small">{l('findings.livePlace')}</p>}
          </>
        )}
      </section>
    </div>
  )
}

/** "About this place": only facts the scan really carries (climate group, height, rainy months) plus the size of the box. */
/** `area`: a pin is one data grid cell drawn as a square; a shape region (Wisconsin) is measured by the box around it. */
function PlaceFacts({ profile, bbox, area }: { profile: PlaceProfile | null | undefined; bbox: [number, number, number, number]; area: 'box' | 'pin' | 'shape' }) {
  const { view } = useView()
  const l = useL()
  const sci = view === 'scientific'
  // `model`: the fact comes from the NASA POWER model climatology, so its chip says "computer model estimate"
  const facts: { key: FactKind; label: string; value: string; model?: boolean }[] = []
  // A mixed box (homogeneity check) has no one climate, height or rainy season: the backend text says "different
  // kinds of places", so the facts do too, and the box-average values are not shown as if they described it.
  const mixed = profile?.homogeneity?.kind === 'mixed'
  if (mixed) {
    facts.push({ key: 'climate', label: l('findings.facts.climate'), value: sci && profile?.climate_code ? l('findings.facts.mixedMean', { code: profile.climate_code }) : l('findings.facts.mixed'), model: true })
  } else if (profile?.climate_group) {
    const word = l(`findings.climate.${profile.climate_group}` as FKey)
    facts.push({ key: 'climate', label: l('findings.facts.climate'), value: sci && profile.climate_code ? `${word} (${profile.climate_code})` : word, model: true })
  }
  // height only when the place is high up, in both views (the Scientific view adds the model-grid metres)
  const elev = profile?.elevation_m_model
  if (!mixed && profile?.high_up) {
    const metres = sci && elev != null ? l('findings.facts.elev', { m: Math.round(elev).toLocaleString(numberLocale()) }) : null
    facts.push({ key: 'height', label: l('findings.facts.height'), value: [l('findings.facts.highUp'), metres].filter(Boolean).join(' · '), model: true })
  }
  const runs = mixed ? [] : monthRuns(profile?.wet_months ?? [])
  if (runs.length > 0) {
    const month = (m: number) => capFirst(new Date(2000, m - 1, 1).toLocaleString(numberLocale(), { month: 'long' }))
    facts.push({ key: 'wet', label: l('findings.facts.wet'), value: runs.map(([a, b]) => (a === b ? month(a) : `${month(a)} – ${month(b)}`)).join(', '), model: true })
  }
  const areaLabel = area === 'pin' ? l('findings.facts.areaPin') : area === 'shape' ? l('findings.facts.areaShape') : l('findings.facts.area')
  facts.push({ key: 'area', label: areaLabel, value: l(area === 'pin' ? 'findings.facts.areaPinValue' : 'findings.facts.areaValue', sizeParts(bbox)) })
  const modelTag = l('findings.facts.modelTag')
  return (
    <dl className="findings-facts" aria-label={l('findings.facts.aria')}>
      {facts.map((f) => (
        <div key={f.key} className={`fact fact-${f.key}`} title={f.model ? `${f.label}: ${f.value} (${modelTag})` : undefined}>
          <dt>
            <FactIcon kind={f.key} />
            {f.label}
          </dt>
          <dd>
            <span className="fact-v">{f.value}</span>
            {f.model && <span className="visually-hidden"> ({modelTag})</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

type FactKind = 'climate' | 'height' | 'wet' | 'area'

/** Small line pictures for the place facts: thermometer with a leaf, mountain, raindrop, measured box. */
function FactIcon({ kind }: { kind: FactKind }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'climate' && (
        <>
          <path d="M9 14.5V5a2 2 0 1 0-4 0v9.5a3.5 3.5 0 1 0 4 0Z" />
          <path d="M7 15V9" />
          <path d="M13 20c0-5 3-8 8-8 0 5-3 8-8 8Zm0 0 4-4" />
        </>
      )}
      {kind === 'height' && <path d="m2 20 7-12 4 6 3-4 6 10Z" />}
      {kind === 'wet' && <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />}
      {kind === 'area' && (
        <>
          <rect x="4" y="7" width="16" height="13" rx="1.5" strokeDasharray="3 2.5" />
          <path d="M4 3.5h16M4 2v3M20 2v3" />
        </>
      )}
    </svg>
  )
}

function EditBar({ route, region, custom, themeId, set, go, years }: { route: Route; region: RegionCard; custom: boolean; themeId?: string; set: (p: Partial<Route>) => void; go: (r: Route) => void; years: { start: string; end: string } | null }) {
  const { catalog } = useData()
  const { view } = useView()
  const l = useL()
  const seasons = [...new Map(region.declared_seasons.map((s) => [s.id, s])).values()]
  const pickable = catalog.regions.filter((r) => r.listed !== false || r.id === region.id)
  // every change applies at once: there is no Update button
  return (
    <form className="card editform" aria-label={l('findings.editLabel')} onSubmit={(e) => e.preventDefault()}>
      {custom ? (
        <div className="field field-place">
          <span className="field-k">{l('findings.chip.place')}</span>
          <span className="input input-static">
            <span className="input-static-name">{cleanPlaceName(tx(region.name, view))}</span>
            <button type="button" className="link" onClick={() => go({ screen: 'home' })}>
              {l('findings.changePlace')}
            </button>
          </span>
        </div>
      ) : (
        <label className="field field-place">
          <span className="field-k">{l('findings.chip.place')}</span>
          <select className="input" value={region.id} onChange={(e) => e.target.value !== region.id && set({ region: e.target.value, place: undefined, season: undefined })}>
            {pickable.map((r) => (
              <option key={r.id} value={r.id}>
                {cleanPlaceName(tx(r.name, view))}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field field-question">
        <span className="field-k">{l('findings.chip.question')}</span>
        <select className="input" value={themeId} onChange={(e) => set({ theme: e.target.value })}>
          {topLevel(catalog.themes).map((top) => (
            <optgroup key={top.id} label={tx(top.name, view)}>
              {[top, ...childrenOf(catalog.themes, top.id)].map((th) => (
                <option key={th.id} value={th.id}>
                  {tx(th.name, view)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <fieldset className="field field-years">
        <legend className="field-k">{l('findings.chip.years')}</legend>
        <div className="years-pair">
          <input className="input mono" type="number" inputMode="numeric" min={1980} max={2026} aria-label={l('findings.from')} placeholder={years?.start ?? l('findings.anyYear')} value={route.start ?? ''} onChange={(e) => set({ start: e.target.value || undefined })} />
          <span aria-hidden="true" className="muted">–</span>
          <input className="input mono" type="number" inputMode="numeric" min={1980} max={2026} aria-label={l('findings.to')} placeholder={years?.end ?? l('findings.anyYear')} value={route.end ?? ''} onChange={(e) => set({ end: e.target.value || undefined })} />
        </div>
      </fieldset>
      {!custom && seasons.length > 0 && (
        <label className="field field-season">
          <span className="field-k">{l('findings.chip.season')}</span>
          <select className="input" value={route.season ?? ''} onChange={(e) => set({ season: e.target.value || undefined })}>
            <option value="">{l('findings.allMonths')}</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {capFirst(tx(s.name, view))}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="muted small editform-hint">{route.season && !custom ? l('findings.seasonHint') : l('findings.yearsHint')}</p>
    </form>
  )
}

/** Count tiles: one per certainty level that is present, with a big number, an icon and the words (never colour alone). */
const LEVELS: Certainty[] = ['sure', 'maybe', 'too_soon', 'cant_tell']

function Summary({ summary, scan, available, notes }: { summary: ReturnType<typeof summarize>; scan: ScanResult; available: ScanEntry[]; notes: React.ReactNode }) {
  const { view } = useView()
  const l = useL()
  const { total, clear, strongest } = summary
  const vars = { clear, total, alpha: scan.alpha }
  const key: FKey =
    clear === 0 ? (total === 1 ? 'findings.summary.noneOne' : 'findings.summary.none') : total === 1 ? 'findings.summary.oneOfOne' : clear === 1 ? 'findings.summary.one' : 'findings.summary.some'
  const counts = countByCertainty(available)
  return (
    <section className="card summary" role="status">
      <div className="summary-text">
        <h2 className="summary-main">{l(key, vars)}</h2>
        {strongest && (
          <p className="summary-sub">{l('findings.strongest', { name: tx(strongest.name, view), slope: formatSlope(strongest.slope_per_decade, strongest.units, view) })}</p>
        )}
        {notes}
        {view === 'scientific' && <p className="muted small">{l('findings.scanNote', { n: total, alpha: scan.alpha })}</p>}
      </div>
      <ul className="summary-tiles" aria-label={l('findings.tiles.aria')}>
        {LEVELS.filter((c) => counts[c] > 0).map((c) => (
          <li key={c} className={`count-tile count-tile-${c}`}>
            <span className="count-tile-n">{counts[c]}</span>
            <span className="count-tile-w">
              <CertaintyIcon certainty={c} />
              {l(`findings.chip.${c}` as FKey)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Small picture for the kind of instrument: a satellite with its panels, or a model grid. */
function InstrumentIcon({ model }: { model: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {model ? (
        <>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M4 12h16M12 4v16" />
        </>
      ) : (
        <>
          <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
          <path d="M9.5 9.5 6 6M14.5 14.5 18 18" />
          <rect x="2" y="2" width="5" height="5" rx="1" />
          <rect x="17" y="17" width="5" height="5" rx="1" />
        </>
      )}
    </svg>
  )
}

/** "Instruments in this list: [AIRS (satellite)] [MERRA-2 (computer model)]", chips that link to the sources page. */
function Legend({ entries, variables }: { entries: ScanEntry[]; variables: VariableCard[] }) {
  const { s, rich } = useS()
  const ids = [
    ...new Set(
      entries.flatMap((e) => {
        const id = e.instrument_id ?? (variables.find((v) => v.id === e.variable_id)?.source as { instrument_id?: string | null } | undefined)?.instrument_id
        return id ? [id] : []
      }),
    ),
  ]
  const list = ids.flatMap((id) => {
    const inst = instrumentById(id)
    return inst ? [inst] : []
  })
  if (list.length === 0) return null
  return (
    <section className="legend" aria-labelledby="legend-h">
      <h2 id="legend-h" className="legend-label">{rich('legend.label', {}, { instrument: <Term id="instrument">{s('legend.instruments')}</Term> })}</h2>
      <ul className="legend-list">
        {list.map((i) => {
          const model = i.kind === 'model'
          const key = model ? 'legend.model' : manySatellites(i.platform) ? 'legend.satMany' : 'legend.sat'
          return (
            <li key={i.id}>
              <a href={instrumentHref(i.id)} className={model ? 'legend-chip legend-model' : 'legend-chip legend-sat'}>
                <span className="legend-ico">
                  <InstrumentIcon model={model} />
                </span>
                {s(key, { name: shortName(i) })}
              </a>
            </li>
          )
        })}
      </ul>
    </section>
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
        {relatedThemes(catalog.themes, themeId).map((th) => (
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

function SecondOpinion({ c, own }: { c: Comparison; own: string | null }) {
  const { view } = useView()
  const l = useL()
  const { s } = useS()
  if (!c.outcome) return null
  // the partner measures the same thing with a different instrument: say so, and name it
  const other = c.against_instrument && c.against_instrument !== own ? instrumentById(c.against_instrument) : undefined
  return (
    <p className="fcard-second small">
      <strong>{l('findings.secondOpinion')}:</strong> {l(`findings.second.${c.outcome}` as FKey)}
      {view === 'scientific' && c.text && <> · {tx(c.text, view)}</>}
      {other && (
        <>
          <br />
          <span className="fcard-same">{s('legend.same', { name: shortName(other) })}</span>
        </>
      )}
    </p>
  )
}

export function FindingCard({ e, card, onOpen }: { e: ScanEntry; card?: VariableCard; onOpen: () => void }) {
  const { view } = useView()
  const l = useL()
  const certainty = certaintyOfEntry(e)
  const dir = directionOf(e.slope_per_decade)
  const years = e.yearly_series && e.yearly_series.length > 1 ? e.yearly_series : null
  // the years this card's verdict used (the scan's shared window), so it can be told apart from the result page's full record
  const used = years ? years.filter((y) => y.in_window).map((y) => y.year) : []
  const usedFrom = used.length > 1 ? Math.min(...used) : null
  const usedTo = used.length > 1 ? Math.max(...used) : null
  const someOut = years != null && used.length < years.length
  const sparkSpan = years ? { from: years[0].year, to: years[years.length - 1].year } : { from: 0, to: 0 }
  const sparkLabel =
    someOut && usedFrom != null && usedTo != null ? l('findings.sparkUsed', { ...sparkSpan, ufrom: usedFrom, uto: usedTo }) : l('findings.spark', sparkSpan)
  const name = tx(e.name, view)
  // R1: the reason this variable is worth a look (a cited expectation, or what this record can detect)
  const why = tx(e.why, view).trim()
  const sure = certainty === 'sure'
  const dec = e.units.decimals
  return (
    <li className={`fcard fcard-${certainty}`} data-demo={`finding-${e.variable_id}`}>
      <div className="fcard-top">
        <VerdictChip certainty={certainty} />
        {/* the arrow's shape says the direction (colour only backs it up); its words go to screen readers and the tooltip */}
        {dir && (
          <span className={`fcard-dir fcard-dir-${dir}`} title={l(`findings.heading.${dir}` as FKey)}>
            <TrendArrow direction={dir} sure={sure} label={l(`findings.heading.${dir}` as FKey)} />
          </span>
        )}
      </div>
      <div className="fcard-title">
        <h3 className="fcard-name">
          <button type="button" className="fcard-open" aria-label={l('findings.open', { name })} onClick={onOpen}>
            {name}
          </button>
        </h3>
        {card && <p className="fcard-def muted">{tx(card.definition, view)}</p>}
      </div>
      {years && (
        <div className="fcard-chart">
          <div className="fcard-panel">
            <Sparkline wide series={years} label={sparkLabel} />
            <div className="fcard-axis small muted">
              <span className="mono">{years[0].year}</span>
              {/* only when some dots are left out: what full and empty dots mean (the years are in the tooltip, the chart label and the summary) */}
              {someOut && usedFrom != null && usedTo != null && (
                <span className="fcard-key" aria-hidden="true" title={l('findings.cardYears', { from: usedFrom, to: usedTo })}>
                  <span className="fcard-key-item">
                    <span className="fcard-key-dot" />
                    {l('findings.key.used')}
                  </span>
                  <span className="fcard-key-item">
                    <span className="fcard-key-dot fcard-key-out" />
                    {l('findings.key.out')}
                  </span>
                </span>
              )}
              <span className="mono">{years[years.length - 1].year}</span>
            </div>
          </div>
        </div>
      )}
      <div className="fcard-notes">
        {!e.worth_investigating && !sure && <p className="fcard-rec small muted">{l('findings.hardToSpot')}</p>}
        {why && (
          <p className="fcard-why small muted">
            <span className="fcard-why-label">{l('findings.why')}:</span> {why}
          </p>
        )}
        {view === 'scientific' && (
          <p className="muted small">
            {[
              e.slope_per_decade != null ? formatSlope(e.slope_per_decade, e.units, view) : null,
              e.p_adjusted != null ? l('findings.adjP', { p: e.p_adjusted.toFixed(3) }) : null,
              e.mdt_per_decade != null ? l('findings.mdt', { mdt: plainNum(e.mdt_per_decade, dec), unit: e.units.display }) : null,
            ]
              .filter((x) => x != null)
              .join(' · ')}
          </p>
        )}
        <SourceTag compact variable={variableRefFromEntry(e, card)} />
      </div>
      {e.cross_check && <SecondOpinion c={e.cross_check} own={e.instrument_id ?? (card?.source as { instrument_id?: string | null } | undefined)?.instrument_id ?? null} />}
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
