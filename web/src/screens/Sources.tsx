import { useEffect, useState, type ReactNode } from 'react'
import { useData, useView } from '../context'
import { tx, useT } from '../i18n'
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

const ICON = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const

const SatIcon = () => (
  <svg className="src-ico" viewBox="0 0 24 24" {...ICON}>
    <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    <path d="M9.5 9.5 6 6M14.5 14.5 18 18" />
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="17" y="17" width="5" height="5" rx="1" />
  </svg>
)
const ModelIcon = () => (
  <svg className="src-ico" viewBox="0 0 24 24" {...ICON}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 12h16M12 4v16" />
  </svg>
)
const BoxIcon = () => (
  <svg className="src-ico" viewBox="0 0 24 24" {...ICON}>
    <path d="M21 8 12 3 3 8v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8" />
  </svg>
)
const OutIcon = () => (
  <svg className="src-out" viewBox="0 0 24 24" {...ICON} strokeWidth={2}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
)

/**
 * "Where our data comes from": satellite instruments, computer models, then the instruments we cannot fetch live.
 * Each instrument is a card with the variables (the quantities we trend) that come from it.
 */
export function Sources() {
  const { catalog } = useData()
  const { view } = useView()
  const l = useL()
  const { s } = useS()
  const wanted = useWantedInstrument()
  const listed = catalog.variables.filter((v) => (v as { listed?: boolean }).listed !== false)
  const usedBy = (i: Instrument) => listed.filter((v) => (v.source as CardSource).instrument_id === i.id)
  // a result page needs a place: the first ready-made one has every variable saved
  const place = catalog.regions.find((r) => r.listed !== false)
  const varHref = (id: string) => toHash({ screen: 'variable', region: place?.id, variable: id })
  const inUse = INSTRUMENTS.filter((i) => i.live !== 'offline')
  const satellites = inUse.filter((i) => i.kind === 'satellite')
  const models = inUse.filter((i) => i.kind === 'model')
  const notUsed = INSTRUMENTS.filter((i) => i.live === 'offline')

  const card = (i: Instrument) => {
    const offline = i.live === 'offline'
    const vars = offline ? [] : usedBy(i)
    const model = i.kind === 'model'
    const platformKey = model ? 'sp.platform.model' : manySatellites(i.platform) ? 'sp.platform.satMany' : 'sp.platform.sat'
    const varsId = `inst-${i.id}-vars`
    return (
      <li key={i.id} id={`inst-${i.id}`} className={`card src-card${offline ? ' src-off' : ''}${wanted === i.id ? ' src-wanted' : ''}`}>
        <div className="src-top">
          <div className="src-head">
            <h3>{shortName(i)}</h3>
            <span className="src-since mono">{l('sources.since', { year: i.since })}</span>
          </div>
          <div className="src-chips">
            <span className="src-chip">{s(platformKey, { platform: i.platform ?? '' })}</span>
            <span className={`src-chip ${offline ? 'src-chip-saved' : 'src-chip-live'}`}>{l(`sources.live.${i.live}` as FKey)}</span>
          </div>
        </div>
        <dl className="src-facts">
          <div>
            <dt>{l('sources.measures')}</dt>
            <dd>{tx(i.measures, view)}</dd>
          </div>
          <div>
            <dt>{l('sources.how')}</dt>
            <dd>{tx(i.how, view)}</dd>
          </div>
        </dl>
        {!offline && (
          <div className="src-vars-wrap">
            <p className="src-vars-title" id={varsId}>
              {s('sp.varsCount', { n: vars.length })}
            </p>
            {vars.length > 0 && (
              <ul className="src-vars" aria-labelledby={varsId}>
                {vars.map((v) => (
                  <li key={v.id}>
                    <a className="src-var" href={varHref(v.id)}>
                      {tx(v.name, view)}
                      {(v.source as CardSource).delivered_by && <small>{l('sources.viaPower')}</small>}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {i.link && (
          <a className="src-link" href={i.link} target="_blank" rel="noopener noreferrer">
            {s('sp.nasaPageOf', { name: shortName(i) })}
            <OutIcon />
          </a>
        )}
      </li>
    )
  }

  const group = (id: string, tone: 'sat' | 'model' | 'off', icon: ReactNode, title: string, items: Instrument[], aside?: ReactNode, note?: string) =>
    items.length > 0 && (
      <section className="src-section" aria-labelledby={id}>
        <div className="src-section-head">
          <div className="src-section-title">
            <span className={`src-tile src-tile-${tone}`}>{icon}</span>
            <div>
              <h2 id={id}>{title}</h2>
              {note && <p className="src-note">{note}</p>}
            </div>
          </div>
          {aside}
        </div>
        <ul className="src-grid">{items.map(card)}</ul>
      </section>
    )

  return (
    <div className="page sources">
      <section className="src-intro">
        <h1>{l('sources.title')}</h1>
        <p className="lead">{l('sources.intro')}</p>
        <div className="src-words">
          <div className="card src-word">
            <span className="eyebrow">
              <Term id="instrument" cap />
            </span>
            <span>{s('sp.word.instrument')}</span>
          </div>
          <div className="card src-word">
            <span className="eyebrow">
              <Term id="variable" cap />
            </span>
            <span>{s('sp.word.variable')}</span>
          </div>
          <div className="card src-word">
            <span className="eyebrow">NASA POWER</span>
            <span>{s('sp.word.power')}</span>
          </div>
        </div>
      </section>
      {group(
        'src-sat',
        'sat',
        <SatIcon />,
        s('sp.satTitle'),
        satellites,
        <span className="src-status">
          <span className="src-dot" aria-hidden="true" />
          {l('sources.live.giovanni')}
        </span>,
      )}
      {group('src-model', 'model', <ModelIcon />, s('sp.modelTitle'), models)}
      {group('src-off', 'off', <BoxIcon />, s('sp.notUsedTitle'), notUsed, undefined, s('sp.notUsedWhy'))}
      <AiUse />
    </div>
  )
}

/** How AI was used (submission disclosure) and the "no endorsement" line. Same words in both views. */
function AiUse() {
  const t = useT()
  return (
    <section className="src-section src-ai" aria-labelledby="src-ai-h">
      <h2 id="src-ai-h">{t('sources.ai.title', 'How we used AI')}</h2>
      <ul>
        <li>{t('sources.ai.coding', 'AI coding assistants (Claude Code by Anthropic) helped us write code and text.')}</li>
        <li>{t('sources.ai.helper', 'An optional helper in the app uses the Claude API. It suggests which variables fit a question you type.')}</li>
        <li>{t('sources.ai.never', 'The helper never works out results and never changes them.')}</li>
        <li>{t('sources.ai.numbers', 'All numbers come from NASA data and our own statistics code.')}</li>
      </ul>
      <h2 id="src-noend-h">{t('sources.ai.noEndTitle', 'No endorsement')}</h2>
      <p>{t('sources.ai.noEnd', 'This is a NASA Space Apps Challenge project. It is not endorsed by NASA.')}</p>
    </section>
  )
}
