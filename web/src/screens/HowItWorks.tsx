import { Fragment, useEffect, useRef, useState } from 'react'
import { useView } from '../context'
import { BANDS, STEPS, useH, type Band, type HKey } from '../lib/howCopy'
import { parseHash } from '../lib/route'
import './HowItWorks.css'

const key = (n: number, part: 'title' | 'text') => `how.s${n}.${part}` as HKey

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

/** Which stage the reader is in: the last one whose milestone has passed a line about 40% down the screen
 * (the last stage once the page is scrolled to the bottom). */
function useActiveBand(refs: React.MutableRefObject<Partial<Record<Band, HTMLElement | null>>>) {
  const [active, setActive] = useState<Band>(BANDS[0])
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const line = window.innerHeight * 0.4
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      let current: Band = BANDS[0]
      for (const band of BANDS) {
        const el = refs.current[band]
        if (el && el.getBoundingClientRect().top <= line) current = band
      }
      setActive(atBottom && window.scrollY > 0 ? BANDS[BANDS.length - 1] : current)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [refs])
  return [active, setActive] as const
}

/** The stage bar sticks under the top bar on wide screens: keep it just below, however tall the top bar wraps. */
function useTopbarHeight(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('.topbar')
    const el = ref.current
    if (!bar || !el) return
    // on the root, so the stage bar AND the bands (siblings of the bar) read the same height
    const root = document.documentElement
    const set = () => root.style.setProperty('--how-top', `${bar.offsetHeight}px`)
    set()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(set)
    ro.observe(bar)
    return () => ro.disconnect()
  }, [ref])
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

/** "How it works": the pipeline from "pick a place" to the verdict as one journey: a stage bar on top, then a line
 * down the page with a numbered stop per step, a milestone where each of the four stages begins, and the answer at the end. */
export function HowItWorks() {
  const { view } = useView()
  const h = useH()
  const bands = useRef<Partial<Record<Band, HTMLElement | null>>>({})
  const nav = useRef<HTMLElement>(null)
  const [active, setActive] = useActiveBand(bands)
  useTopbarHeight(nav)
  const goTo = (band: Band, smooth = true) => {
    setActive(band)
    const still = !smooth || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    bands.current[band]?.scrollIntoView?.({ behavior: still ? 'auto' : 'smooth', block: 'start' })
  }
  // opened from a "How we worked this out" strip (#/how?stage=trend): land on that stage; otherwise start at the top
  useEffect(() => {
    const land = () => {
      const stage = parseHash(window.location.hash).stage
      if (stage && (BANDS as string[]).includes(stage)) goTo(stage as Band, false)
      else if (window.scrollY > 0) window.scrollTo?.(0, 0)
    }
    land()
    window.addEventListener('hashchange', land)
    return () => window.removeEventListener('hashchange', land)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="page how">
      <h1>{h('how.title')}</h1>
      <p className="lead">{h('how.lead')}</p>

      <nav ref={nav} className="how-stages" aria-label={h('how.stagesLabel')}>
        <ol>
          {BANDS.map((band, i) => {
            const steps = STEPS.filter((s) => s.band === band)
            return (
              <li key={band} className={`how-stage how-band-${band}`}>
                <button type="button" aria-current={active === band ? 'step' : undefined} onClick={() => goTo(band)}>
                  <span className="how-stage-n" aria-hidden="true">{i + 1}</span>
                  <span className="how-stage-words">
                    <span className="how-stage-name">{h(`how.band.${band}` as HKey)}</span>
                    <span className="how-stage-steps">{h('how.stageSteps', { from: steps[0].n, to: steps[steps.length - 1].n })}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="how-journey" role="group" aria-label={h('how.flowLabel')}>
        {BANDS.map((band, i) => {
          const steps = STEPS.filter((s) => s.band === band)
          return (
            <section
              key={band}
              ref={(el) => { bands.current[band] = el }}
              data-band={band}
              className={`how-band how-band-${band}`}
              aria-labelledby={`how-band-${band}`}
            >
              <h2 id={`how-band-${band}`} className="how-milestone">
                <span className="how-milestone-dot" aria-hidden="true">{i + 1}</span>
                <span>{h(`how.band.${band}` as HKey)}</span>
              </h2>
              <ol className="how-steps" start={steps[0].n}>
                {steps.map((s) => (
                  <li key={s.n} className="how-step" id={`how-step-${s.n}`}>
                    <span className="how-dot" aria-hidden="true">{s.n}</span>
                    <div className="how-body card">
                      <h3><span className="visually-hidden">{h('how.stepN', { n: s.n })}: </span>{h(key(s.n, 'title'))}</h3>
                      <p className="how-text">{h(key(s.n, 'text'))}</p>
                      {s.n === 10 && <SeasonsPicture />}
                      {view === 'scientific' && (
                        <p className="how-code small muted">
                          {h('how.code')}: {s.modules.map((m, j) => <Fragment key={m}>{j > 0 && ', '}<code>{m}</code></Fragment>)}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )
        })}
        <p className="how-finish">
          <span className="how-finish-dot"><Check /></span>
          <strong>{h('how.finish')}</strong>
        </p>
      </div>
    </div>
  )
}
