import { Fragment } from 'react'
import { useView } from '../context'
import { BANDS, STEPS, useH, type HKey } from '../lib/howCopy'
import './HowItWorks.css'

const key = (n: number, part: 'title' | 'text') => `how.s${n}.${part}` as HKey

function Arrow() {
  return (
    <svg className="how-arrow" viewBox="0 0 12 24" width="14" height="28" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 1v20M1 16l5 6 5-6" />
    </svg>
  )
}

/** A wavy series (seasons included) becomes a calmer line with a slight slope once the seasons are taken out. */
function SeasonsPicture() {
  const h = useH()
  // the same slow rise as the "after" line, hidden under a big seasonal swing
  const wave = 'M' + Array.from({ length: 61 }, (_, i) => {
    const x = 4 + i * 3
    const y = 50 - (x - 4) * 0.07 - 24 * Math.sin(((x - 4) / 36) * Math.PI)
    return `${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' L')
  return (
    <figure className="how-pic">
      <svg viewBox="0 0 400 80" role="img" aria-label={h('how.pic.label')} focusable="false" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={wave} stroke="var(--accent)" />
        <path d="M196 40h22M212 33l8 7-8 7" stroke="var(--muted)" strokeWidth="2" />
        <path d="M232 52C250 46 262 58 280 48S310 44 330 40S360 38 396 30" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="3 5" opacity="0.8" />
        <path d="M232 52L396 30" stroke="var(--trend)" />
      </svg>
      <figcaption className="how-pic-cap small muted" aria-hidden="true">
        <span>{h('how.pic.before')}</span>
        <span>{h('how.pic.after')}</span>
      </figcaption>
    </figure>
  )
}

/** "How it works": the pipeline from "pick a place" to the verdict, one box per step, four bands, top to bottom. */
export function HowItWorks() {
  const { view } = useView()
  const h = useH()
  const last = STEPS[STEPS.length - 1].n
  return (
    <div className="page how">
      <h1>{h('how.title')}</h1>
      <p className="lead">{h('how.lead')}</p>
      <div className="how-flow" role="group" aria-label={h('how.flowLabel')}>
        {BANDS.map((band) => {
          const steps = STEPS.filter((s) => s.band === band)
          return (
            <section key={band} className={`how-band how-band-${band}`} aria-labelledby={`how-band-${band}`}>
              <h2 id={`how-band-${band}`} className="how-band-title">{h(`how.band.${band}` as HKey)}</h2>
              <ol className="how-steps" start={steps[0].n}>
                {steps.map((s) => (
                  <Fragment key={s.n}>
                    <li className="how-step card" id={`how-step-${s.n}`}>
                      <p className="how-n eyebrow">{h('how.stepN', { n: s.n })}</p>
                      <h3>{h(key(s.n, 'title'))}</h3>
                      <p className="how-text">{h(key(s.n, 'text'))}</p>
                      {s.n === 10 && <SeasonsPicture />}
                      {view === 'scientific' && (
                        <p className="how-code small muted">
                          {h('how.code')}: {s.modules.map((m, i) => <Fragment key={m}>{i > 0 && ', '}<code>{m}</code></Fragment>)}
                        </p>
                      )}
                    </li>
                    {s.n !== last && <li className="how-link" aria-hidden="true"><Arrow /></li>}
                  </Fragment>
                ))}
              </ol>
            </section>
          )
        })}
      </div>
    </div>
  )
}
