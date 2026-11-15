import { useEffect, useState } from 'react'
import { useData, useView } from '../context'
import { tx } from '../i18n'
import { Term } from '../components/Term'
import { INSTRUMENTS, type Instrument } from '../lib/instruments'
import { useL, type FKey } from '../lib/findingsCopy'
import { manySatellites, shortName, useS } from '../lib/sourceLabels'
import { toHash } from '../lib/route'
import type { VariableCard } from '../types/catalog'
import './Sources.css'

type CardSource = VariableCard['source'] & { instrument_id?: string | null; delivered_by?: string | null }

/** The instrument named in the address (`#/sources?instrument=airs`), so a link from a card lands on its section. */
function useWantedInstrument(): string | null {
  const read = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('instrument')
  const [wanted, setWanted] = useState<string | null>(read)
  useEffect(() => {
    const on = () => setWanted(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => {
    if (wanted) document.getElementById(`inst-${wanted}`)?.scrollIntoView?.({ block: 'start' })
  }, [wanted])
  return wanted
}

/**
 * "Where our data comes from": one section per instrument (a sensor on a satellite, or a computer model),
 * with the variables (the quantities we trend) that come from it. Instruments we cannot fetch live come last.
 */
export function Sources() {
  const { catalog } = useData()
  const { view } = useView()
  const l = useL()
  const { s, rich } = useS()
  const wanted = useWantedInstrument()
  const listed = catalog.variables.filter((v) => (v as { listed?: boolean }).listed !== false)
  const usedBy = (i: Instrument) => listed.filter((v) => (v.source as CardSource).instrument_id === i.id)
  // a result page needs a place: the first ready-made one has every variable saved
  const place = catalog.regions.find((r) => r.listed !== false)
  const varHref = (id: string) => toHash({ screen: 'variable', region: place?.id, variable: id })
  const inUse = INSTRUMENTS.filter((i) => i.live !== 'offline')
  const notUsed = INSTRUMENTS.filter((i) => i.live === 'offline')

  const section = (i: Instrument, level: 'h2' | 'h3') => {
    const vars = usedBy(i)
    const H = level
    const model = i.kind === 'model'
    const platformKey = model ? 'sp.platform.model' : manySatellites(i.platform) ? 'sp.platform.satMany' : 'sp.platform.sat'
    return (
      <li key={i.id} id={`inst-${i.id}`} className={`card src-card src-${i.kind}${wanted === i.id ? ' src-wanted' : ''}`}>
        <div className="src-head">
          <H>{s('sp.inst', { name: shortName(i) })}</H>
          <span className="src-kind">{model ? s('sp.platform.model') : s(platformKey, { platform: i.platform ?? '' })}</span>
        </div>
        <p className="src-meta small muted">{l('sources.since', { year: i.since })}</p>
        <p className={`src-live src-live-${i.live} small`}>{l(`sources.live.${i.live}` as FKey)}</p>
        <dl>
          <dt>{l('sources.measures')}</dt>
          <dd>{tx(i.measures, view)}</dd>
          <dt>{l('sources.how')}</dt>
          <dd>{tx(i.how, view)}</dd>
        </dl>
        {i.live === 'offline' ? (
          <p className="src-why">{s('sp.notUsedWhy')}</p>
        ) : (
          <div className="src-flow-wrap">
            <p className="src-vars-title">{s('sp.vars')}</p>
            {vars.length ? (
              <div className="src-flow" role="group" aria-label={s('sp.flowLabel', { name: shortName(i) })}>
                <span className="src-node">{shortName(i)}</span>
                <svg className="src-arrow" viewBox="0 0 24 12" width="24" height="12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 6h20M16 1l5 5-5 5" />
                </svg>
                <ul className="src-vars">
                  {vars.map((v) => (
                    <li key={v.id}>
                      <a href={varHref(v.id)}>{tx(v.name, view)}</a>
                      {(v.source as CardSource).delivered_by && <span className="muted small"> · {l('sources.viaPower')}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="muted">{s('sp.notUsedNone')}</p>
            )}
          </div>
        )}
        {i.link && (
          <a className="small" href={i.link} target="_blank" rel="noopener noreferrer">
            {l('sources.nasaPage')}
          </a>
        )}
      </li>
    )
  }

  return (
    <div className="page sources">
      <h1>{l('sources.title')}</h1>
      <p className="lead">{rich('sp.intro', {}, { instrument: <Term id="instrument" />, variable: <Term id="variable" /> })}</p>
      <p>{l('sources.intro')}</p>
      <p className="muted">{l('sources.powerNote')}</p>
      <ul className="src-grid">{inUse.map((i) => section(i, 'h2'))}</ul>
      {notUsed.length > 0 && (
        <>
          <h2 className="src-not-used">{s('sp.notUsedTitle')}</h2>
          <ul className="src-grid">{notUsed.map((i) => section(i, 'h3'))}</ul>
        </>
      )}
    </div>
  )
}
