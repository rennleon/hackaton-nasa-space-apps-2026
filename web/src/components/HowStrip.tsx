import { useEffect, useRef } from 'react'
import { BANDS, STEPS, useH, type HKey } from '../lib/howCopy'
import { toHash } from '../lib/route'
import './HowStrip.css'

const stepKey = (n: number, part: 'title' | 'text') => `how.s${n}.${part}` as HKey

/** "How we worked this out": the four stages of the method as a numbered row. Each stage is a disclosure whose steps
 * (same words as the "How it works" page) open in a floating panel over the page, so the section never grows. One
 * stage at a time; a click outside or Escape closes it. "See every step" opens the full page.
 * Shared by the findings list and the result page. */
export function HowStrip() {
  const h = useH()
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    const openOnes = () => [...(root.current?.querySelectorAll('details[open]') ?? [])] as HTMLDetailsElement[]
    const onDown = (e: PointerEvent) => {
      for (const d of openOnes()) if (!d.contains(e.target as Node)) d.open = false
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      for (const d of openOnes()) {
        d.open = false
        d.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])
  // opening one stage closes the others (also covers browsers without <details name>)
  const onToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    const d = e.currentTarget
    if (!d.open) return
    for (const o of root.current?.querySelectorAll('details[open]') ?? []) if (o !== d) (o as HTMLDetailsElement).open = false
  }
  return (
    <section ref={root} className="card howstrip" aria-labelledby="howstrip-h" data-demo="how-strip">
      <div className="howstrip-head">
        <h2 id="howstrip-h">{h('how.strip.title')}</h2>
        <a className="howstrip-all" href={toHash({ screen: 'how' })}>
          {h('how.strip.all')}
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </a>
      </div>
      <ol className="howstrip-stages" aria-label={h('how.stagesLabel')}>
        {BANDS.map((band, i) => {
          const steps = STEPS.filter((s) => s.band === band)
          return (
            <li key={band} className={`howstrip-stage how-band-${band}`}>
              <details name="howstrip" onToggle={onToggle}>
                <summary>
                  <span className="howstrip-n" aria-hidden="true">{i + 1}</span>
                  <span className="howstrip-words">
                    <span className="howstrip-name">{h(`how.band.${band}` as HKey)}</span>
                    <span className="howstrip-steps">{h('how.stageSteps', { from: steps[0].n, to: steps[steps.length - 1].n })}</span>
                  </span>
                  <svg className="howstrip-chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                <ol className="howstrip-list" start={steps[0].n}>
                  {steps.map((s) => (
                    <li key={s.n} className="howstrip-step">
                      <span className="howstrip-dot" aria-hidden="true">{s.n}</span>
                      <div className="howstrip-step-body">
                        <h3 className="howstrip-step-title">
                          <span className="visually-hidden">{h('how.stepN', { n: s.n })}: </span>
                          {h(stepKey(s.n, 'title'))}
                        </h3>
                        <p className="howstrip-step-text">{h(stepKey(s.n, 'text'))}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </details>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
