import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { demoById, prepareDemo } from '../lib/demos'
import { clampSpot, NARROW, placeTip, SPOT_PAD, type Box } from '../lib/demoPlacement'
import { useResultCopy } from '../lib/resultCopy'
import './DemoOverlay.css'

const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

/** Size of the screen the page can really use (innerWidth can grow past it when a page overflows sideways). */
const viewport = () => ({
  width: Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth),
  height: window.innerHeight,
})
/** Bottom edge of the top bar while it is sticky (it scrolls away on phones): spotlights and notes stay below it. */
const headerBottom = () => {
  const bar = document.querySelector<HTMLElement>('.topbar')
  return bar && getComputedStyle(bar).position === 'sticky' ? Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) : 0
}

const toBox = (r: DOMRect): Box => ({ top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) })
const sameBox = (a: Box | null, b: Box | null) => a === b || (a !== null && b !== null && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height)

/** Milliseconds a step stays up in auto-play: time to read it, a little slower than an adult. */
export const readingMs = (text: string) => 4000 + text.trim().split(/\s+/).length * 350

/**
 * Guided tour: dims the page, lights up the element a step talks about (`data-demo="…"`) and puts the
 * note next to it, not over it. Esc leaves, arrow keys move, auto-play is optional.
 */
export function DemoOverlay({ demoId, step, onStep, onExit }: { demoId: string; step: number; onStep: (i: number) => void; onExit: () => void }) {
  const { s, t, c } = useResultCopy()
  const demo = demoById(demoId)
  const total = demo?.steps.length ?? 0
  const at = Math.min(step, Math.max(total - 1, 0))
  const current = demo?.steps[at]
  const last = at >= total - 1
  const tipRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const [rect, setRect] = useState<Box | null>(null)
  const [tip, setTip] = useState({ width: 360, height: 220 })
  const [vp, setVp] = useState(viewport)
  const [inset, setInset] = useState(0)
  const [auto, setAuto] = useState(false)
  const caption = demo && current ? c(`demo.${demo.id}.step${at}`, current.caption) : ''

  useEffect(() => prepareDemo(demoId), [demoId])

  // Find the target (it may appear later, once data loads), scroll it into view once per step, then keep it measured.
  const scrolled = useRef(-1)
  const measure = useCallback(() => {
    const size = viewport()
    setVp((v) => (v.width === size.width && v.height === size.height ? v : size))
    const top = headerBottom()
    setInset((n) => (n === top ? n : top))
    const name = current?.target
    const el = name ? document.querySelector<HTMLElement>(`[data-demo="${name}"]`) : null
    if (!el) return setRect((p) => (p === null ? p : null))
    // a target inside a closed "Tell me more" disclosure has no size until it is opened
    const closed = el.closest('details')
    if (closed && !closed.open) closed.open = true
    let r = el.getBoundingClientRect()
    if (scrolled.current !== at) {
      scrolled.current = at
      const room = tipRef.current?.getBoundingClientRect().height ?? 220
      if (r.top < top + SPOT_PAD || r.bottom > size.height - room - 30) {
        window.scrollTo?.({ top: Math.max(0, window.scrollY + r.top - top - SPOT_PAD - 8), behavior: reducedMotion() ? 'auto' : 'smooth' })
        r = el.getBoundingClientRect()
      }
    }
    const next = toBox(r)
    setRect((p) => (sameBox(p, next) ? p : next))
  }, [current?.target, at])

  useEffect(() => {
    scrolled.current = -1
    setRect(null)
    measure()
    const on = () => measure()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    const mo = new MutationObserver(on)
    mo.observe(document.body, { childList: true, subtree: true })
    // smooth scrolling and charts settle over a moment: keep measuring for a few seconds
    const timer = window.setInterval(on, 100)
    const stop = window.setTimeout(() => window.clearInterval(timer), 5000)
    return () => {
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      mo.disconnect()
      window.clearInterval(timer)
      window.clearTimeout(stop)
    }
  }, [measure])

  useLayoutEffect(() => {
    const b = tipRef.current?.getBoundingClientRect()
    if (b && (Math.abs(b.width - tip.width) > 1 || Math.abs(b.height - tip.height) > 1)) setTip({ width: b.width, height: b.height })
  }, [tip.width, tip.height, caption, rect, at, auto, vp.width])

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true })
  }, [at])

  // keyboard: Esc leaves, arrows move
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onExit()
      } else if (e.key === 'ArrowRight' && !last) onStep(at + 1)
      else if (e.key === 'ArrowLeft' && at > 0) onStep(at - 1)
      else if (e.key === 'Tab' && tipRef.current) {
        // keep Tab inside the note: the page behind it is dimmed and not for clicking
        const f = [...tipRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input')]
        if (f.length === 0) return
        const i = f.indexOf(document.activeElement as HTMLElement)
        const to = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : i === f.length - 1 ? 0 : i + 1
        e.preventDefault()
        f[to].focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [at, last, onExit, onStep])

  // auto-play: next step after a reading pause; stops on the last step
  useEffect(() => {
    if (!auto || last) return
    const id = window.setTimeout(() => onStep(at + 1), readingMs(caption))
    return () => window.clearTimeout(id)
  }, [auto, last, at, caption, onStep])

  if (!demo || !current) return null
  const narrow = vp.width < NARROW
  const width = narrow ? vp.width - 24 : Math.min(380, vp.width - 24)
  const place = placeTip(rect, { width, height: tip.height }, vp, 14, 12, inset)
  const spot = rect ? clampSpot(rect, vp, inset) : null

  return (
    <div className="demo-root">
      <div className="demo-shield" aria-hidden="true" />
      {spot ? <div className="demo-spot" style={spot} aria-hidden="true" /> : <div className="demo-dim" aria-hidden="true" />}
      <div
        ref={tipRef}
        className={`demo-tip demo-${place.side}`}
        style={{ top: place.top, left: place.left, width, maxHeight: Math.max(160, vp.height - inset - 24) }}
        role="dialog"
        aria-label={s('demo.aria', 'Demo walkthrough')}
        data-side={place.side}
      >
        <p className="demo-title">{c(`demo.${demo.id}.title`, demo.title)}</p>
        <p className="demo-text" aria-live="polite">
          {caption}
        </p>
        <ol className="demo-dots" aria-label={t('demo.progress', 'Step {n} of {total}', { n: at + 1, total })}>
          {demo.steps.map((_, i) => (
            <li key={i} className={i === at ? 'is-on' : i < at ? 'is-done' : undefined} aria-current={i === at ? 'step' : undefined} />
          ))}
        </ol>
        <p className="muted small demo-count">{t('demo.progress', 'Step {n} of {total}', { n: at + 1, total })}</p>
        <div className="demo-row">
          <button type="button" className="btn" disabled={at <= 0} onClick={() => onStep(at - 1)}>
            {s('demo.back', 'Back')}
          </button>
          {last ? (
            <button ref={nextRef} type="button" className="btn btn-primary" onClick={onExit}>
              {s('demo.finish', 'Finish')}
            </button>
          ) : (
            <button ref={nextRef} type="button" className="btn btn-primary" onClick={() => onStep(at + 1)}>
              {s('demo.next', 'Next')}
            </button>
          )}
          <button type="button" className="link" onClick={onExit}>
            {s('demo.exit', 'Exit demo')}
          </button>
        </div>
        <label className="demo-auto small">
          <input type="checkbox" checked={auto} disabled={last} onChange={(e) => setAuto(e.target.checked)} /> {t('demo.auto', 'Play automatically')}
        </label>
      </div>
    </div>
  )
}
