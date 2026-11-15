import { useEffect, useState } from 'react'
import { useData, useView } from '../context'
import { tx, useT } from '../i18n'
import { formatPlace, parsePlace } from '../lib/place'
import { rememberPlaceName } from '../lib/placeNames'
import type { Route } from '../lib/route'
import { signed } from '../lib/text'
import type { Certainty } from '../lib/findings'
import type { Text } from '../types/catalog'
import { VerdictChip } from './VerdictChip'
import './WhereElse.css'

export interface WherePlace {
  place_id: string
  name: Text
  kind: 'region' | 'example'
  region_id: string | null
  lat: number | null
  lon: number | null
  label?: string
  certainty: Certainty
  direction: 'up' | 'down' | null
  slope_per_decade: number | null
  ci_low: number | null
  ci_high: number | null
  units: { display: string; simple: string; decimals: number }
  window_start: string | null
  window_end: string | null
  availability: string
  headline: Text
  how_much: Text
}

export interface WhereData {
  variable_id: string
  generated?: string
  places: WherePlace[]
}

/** Missing or malformed file: nothing to show, and no error. */
async function loadWhere(variableId: string): Promise<WhereData | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL ?? '/'}data/where/${variableId}.json`)
    if (!res.ok) return null
    const data = (await res.json()) as WhereData
    return Array.isArray(data?.places) && data.places.length ? data : null
  } catch {
    return null
  }
}

const isAvailable = (p: WherePlace) => p.availability === 'available'
const hasDirection = (p: WherePlace) => (p.certainty === 'sure' || p.certainty === 'maybe') && p.direction !== null

/** Only when at least two places are both "sure" and they disagree. */
export function goesBothWays(places: WherePlace[]): boolean {
  const sure = places.filter((p) => isAvailable(p) && p.certainty === 'sure' && p.direction)
  return sure.some((p) => p.direction === 'up') && sure.some((p) => p.direction === 'down')
}

function isCurrent(p: WherePlace, route: Route): boolean {
  if (p.kind === 'region' && p.region_id) return !route.place && route.region === p.region_id
  const pt = parsePlace(route.place)
  return pt?.kind === 'point' && p.lat !== null && p.lon !== null && Math.abs(pt.lat - p.lat) < 0.05 && Math.abs(pt.lon - p.lon) < 0.05
}

function range(p: WherePlace): string {
  if (p.slope_per_decade === null) return '—'
  const d = Math.max(p.units.decimals, 1)
  const sign = (n: number) => signed(n, d)
  const ci = p.ci_low !== null && p.ci_high !== null ? ` [${sign(p.ci_low)}, ${sign(p.ci_high)}]` : ''
  return `${sign(p.slope_per_decade)}${ci} ${p.units.display}`
}

/** Why a place has no result, in the active language (one literal key per code, so the key-coverage test sees them). */
function whyNone(code: string, t: ReturnType<typeof useT>): string {
  if (code === 'no_data_here') return t('where.avail.no_data_here', 'No data here')
  if (code === 'too_many_gaps') return t('where.avail.too_many_gaps', 'Too many gaps in the record')
  if (code === 'too_short') return t('where.avail.too_short', 'Record too short')
  return t('where.avail.other', 'Not available')
}

const years = (p: WherePlace) => (p.window_start && p.window_end ? `${p.window_start.slice(0, 4)}–${p.window_end.slice(0, 4)}` : '—')

function Arrow({ direction }: { direction: 'up' | 'down' }) {
  const t = useT()
  return (
    <span className={`where-arrow where-${direction}`}>
      <svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true" focusable="false">
        <path d={direction === 'up' ? 'M8 13V3M3.5 7.5L8 3l4.5 4.5' : 'M8 3v10M3.5 8.5L8 13l4.5-4.5'} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="visually-hidden">{direction === 'up' ? t('where.up', 'Going up') : t('where.down', 'Going down')}</span>
    </span>
  )
}

/** The same variable's verdict in the five ready-made places, so "where" has an answer and opposite trends show. */
export function WhereElse({ variableId, route, go }: { variableId: string; route: Route; go: (r: Route) => void }) {
  const t = useT()
  const { view } = useView()
  const { client } = useData()
  const [data, setData] = useState<WhereData | null>(null)
  useEffect(() => {
    let alive = true
    setData(null)
    void loadWhere(variableId).then((d) => alive && setData(d))
    return () => {
      alive = false
    }
  }, [variableId])
  if (!data) return null

  const open = (p: WherePlace) => {
    if (p.kind === 'region' && p.region_id) {
      go({ screen: 'variable', region: p.region_id, variable: variableId, theme: route.theme })
    } else if (p.lat !== null && p.lon !== null) {
      const key = formatPlace({ kind: 'point', lat: p.lat, lon: p.lon })
      rememberPlaceName(key, p.name.simple)
      go({ screen: 'variable', place: key, variable: variableId, theme: route.theme })
    }
  }
  const canOpen = (p: WherePlace) => (p.kind === 'region' ? Boolean(p.region_id) : Boolean(client.customPlaces || client.staticExamples) && p.lat !== null && p.lon !== null)
  const both = goesBothWays(data.places)
  const bothText = both
    ? view === 'simple'
      ? t('where.both.simple', 'It goes up in some places and down in others.')
      : t('where.both.scientific', 'Opposite directions in different places, each with both tests agreeing.')
    : ''

  return (
    <section className="card where" aria-labelledby="where-h" data-demo="where">
      <h3 id="where-h">{t('where.title', 'Where else?')}</h3>
      <p className="muted">
        {view === 'simple'
          ? t('where.lead.simple', 'The same measurement in other places.')
          : t('where.lead.scientific', 'The same variable analysed separately in the ready-made places.')}
      </p>
      {both && (
        <p className="where-both" role="status" data-demo="where-both">
          {bothText}
        </p>
      )}
      {view === 'simple' ? (
        <ul className="where-row">
          {data.places.map((p) => {
            const current = isCurrent(p, route)
            const ok = isAvailable(p)
            const body = (
              <>
                <span className="where-name">{tx(p.name, view)}</span>
                {current && <span className="where-here">{t('where.here', 'You are here')}</span>}
                {ok ? (
                  <>
                    <span className="where-verdict">
                      {hasDirection(p) && <Arrow direction={p.direction as 'up' | 'down'} />}
                      <VerdictChip certainty={p.certainty} />
                    </span>
                    <span className="where-much">{tx(p.how_much, view)}</span>
                  </>
                ) : (
                  <span className="where-none muted">{t('where.noData', 'No data here')}</span>
                )}
              </>
            )
            return (
              <li key={p.place_id} className={current ? 'where-card is-current' : 'where-card'}>
                {current || !canOpen(p) ? (
                  <div className="where-body" aria-current={current ? 'true' : undefined}>
                    {body}
                    {!current && <span className="where-live muted">{t('where.needsLive', 'Needs the live service')}</span>}
                  </div>
                ) : (
                  <button type="button" className="where-body" onClick={() => open(p)}>
                    {body}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <>
          <div className="where-scroll">
            <table className="where-table">
              <thead>
                <tr>
                  <th scope="col">{t('where.col.place', 'Place')}</th>
                  <th scope="col">{t('where.col.window', 'Window')}</th>
                  <th scope="col">{t('where.col.slope', 'Sen slope per decade (95% range)')}</th>
                  <th scope="col">{t('where.col.verdict', 'Verdict')}</th>
                </tr>
              </thead>
              <tbody>
                {data.places.map((p) => {
                  const current = isCurrent(p, route)
                  const ok = isAvailable(p)
                  return (
                    <tr key={p.place_id} className={current ? 'is-current' : undefined} aria-current={current ? 'true' : undefined}>
                      <th scope="row">
                        {current || !canOpen(p) ? (
                          tx(p.name, view)
                        ) : (
                          <button type="button" className="link" onClick={() => open(p)}>
                            {tx(p.name, view)}
                          </button>
                        )}
                        {current && <span className="where-here"> {t('where.here', 'You are here')}</span>}
                      </th>
                      <td data-label={t('where.col.window', 'Window')}>{ok ? years(p) : '—'}</td>
                      <td data-label={t('where.col.slope', 'Sen slope per decade (95% range)')}>{ok ? range(p) : whyNone(p.availability, t)}</td>
                      <td data-label={t('where.col.verdict', 'Verdict')}>{ok ? <VerdictChip certainty={p.certainty} /> : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">{t('where.note', 'Each place uses its own full record; windows differ.')}</p>
        </>
      )}
    </section>
  )
}
