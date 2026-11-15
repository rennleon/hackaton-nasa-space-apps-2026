import { useData, useView } from '../context'
import { tx } from '../i18n'
import { INSTRUMENTS, type Instrument } from '../lib/instruments'
import { useL, type FKey } from '../lib/findingsCopy'
import type { VariableCard } from '../types/catalog'
import './Sources.css'

type CardSource = VariableCard['source'] & { instrument_id?: string | null; delivered_by?: string | null }

/** "Where our data comes from": one card per instrument or model, and the variables we take from it. */
export function Sources() {
  const { catalog } = useData()
  const { view } = useView()
  const l = useL()
  const listed = catalog.variables.filter((v) => (v as { listed?: boolean }).listed !== false)
  const usedBy = (i: Instrument) => listed.filter((v) => (v.source as CardSource).instrument_id === i.id)
  return (
    <div className="page sources">
      <h1>{l('sources.title')}</h1>
      <p className="lead">{l('sources.intro')}</p>
      <p className="muted">{l('sources.powerNote')}</p>
      <ul className="src-grid">
        {INSTRUMENTS.map((i) => {
          const vars = usedBy(i)
          return (
            <li key={i.id} className={`card src-card src-${i.kind}`}>
              <div className="src-head">
                <h2>{tx(i.name, view)}</h2>
                <span className="src-kind">{l(`sources.kind.${i.kind}` as FKey)}</span>
              </div>
              <p className="src-meta small muted">
                {l('sources.since', { year: i.since })}
                {i.platform && <> · {l('sources.platform', { platform: i.platform })}</>}
              </p>
              <p className={`src-live src-live-${i.live} small`}>{l(`sources.live.${i.live}` as FKey)}</p>
              <dl>
                <dt>{l('sources.measures')}</dt>
                <dd>{tx(i.measures, view)}</dd>
                <dt>{l('sources.how')}</dt>
                <dd>{tx(i.how, view)}</dd>
                <dt>{l('sources.usedFor')}</dt>
                <dd>
                  {vars.length ? (
                    <ul className="src-vars">
                      {vars.map((v) => (
                        <li key={v.id}>
                          {tx(v.name, view)}
                          {(v.source as CardSource).delivered_by && <span className="muted small"> · {l('sources.viaPower')}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="muted">{l('sources.nothingYet')}</span>
                  )}
                </dd>
              </dl>
              {i.link && (
                <a className="small" href={i.link} target="_blank" rel="noopener noreferrer">
                  {l('sources.nasaPage')}
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
