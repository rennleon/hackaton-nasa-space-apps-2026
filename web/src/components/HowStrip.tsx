import { BANDS, STEPS, useH, type HKey } from '../lib/howCopy'
import { toHash } from '../lib/route'
import './HowStrip.css'

/** "How we worked this out": the four stages of the method as a numbered row. Each stage opens the "How it works"
 * page on that stage; "See every step" opens it from the top. Shared by the findings list and the result page. */
export function HowStrip() {
  const h = useH()
  return (
    <section className="card howstrip" aria-labelledby="howstrip-h" data-demo="how-strip">
      <div className="howstrip-head">
        <h2 id="howstrip-h">{h('how.strip.title')}</h2>
        <a className="howstrip-all" href={toHash({ screen: 'how' })}>
          {h('how.strip.all')}
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </a>
      </div>
      <ol className="howstrip-stages" aria-label={h('how.strip.label')}>
        {BANDS.map((band, i) => {
          const steps = STEPS.filter((s) => s.band === band)
          return (
            <li key={band} className={`howstrip-stage how-band-${band}`}>
              <a href={toHash({ screen: 'how', stage: band })}>
                <span className="howstrip-n" aria-hidden="true">{i + 1}</span>
                <span className="howstrip-words">
                  <span className="howstrip-name">{h(`how.band.${band}` as HKey)}</span>
                  <span className="howstrip-steps">{h('how.stageSteps', { from: steps[0].n, to: steps[steps.length - 1].n })}</span>
                </span>
              </a>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
