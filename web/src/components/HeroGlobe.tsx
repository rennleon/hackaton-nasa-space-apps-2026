import { useEffect, useRef } from 'react'
import { GLOBE_DOTS } from '../lib/globeDots'

const TURN_SECONDS = 90 // one full turn: slow and calm, but the motion is noticeable
const TILT = (-18 * Math.PI) / 180 // lean the north pole towards the viewer a little
const FPS = 30

/**
 * Decorative dotted Earth that turns very slowly behind the start-page hero. Drawn on a canvas from a baked list of
 * land points (no network, no map library). Purely visual: hidden from screen readers, ignores the pointer, pauses
 * off-screen or in a hidden tab, and stays still for viewers who ask for reduced motion. Its faintness is set in CSS.
 */
export function HeroGlobe() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    // no 2D canvas (e.g. the jsdom test DOM): skip quietly, the hero works the same without the globe
    if (!canvas || typeof CanvasRenderingContext2D === 'undefined') return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // unit vectors of the land points, computed once
    const n = GLOBE_DOTS.length / 2
    const px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const lat = (GLOBE_DOTS[2 * i] * Math.PI) / 180
      const lon = (GLOBE_DOTS[2 * i + 1] * Math.PI) / 180
      px[i] = Math.cos(lat) * Math.sin(lon)
      py[i] = Math.sin(lat)
      pz[i] = Math.cos(lat) * Math.cos(lon)
    }

    let w = 0, h = 0
    let colour = '#000'
    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width
      h = r.height
      canvas.width = Math.round(r.width * dpr)
      canvas.height = Math.round(r.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      colour = getComputedStyle(canvas).color
    }

    const cosT = Math.cos(TILT), sinT = Math.sin(TILT)
    const draw = (angle: number) => {
      const R = Math.min(w, h) * 0.46
      const cx = w / 2, cy = h / 2
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = colour
      ctx.strokeStyle = colour
      // rim of the planet
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.stroke()
      // land dots: rotate about the polar axis, then tilt; only the near side is drawn, fading towards the rim
      const cosA = Math.cos(angle), sinA = Math.sin(angle)
      const dot = Math.max(1.2, R / 120)
      for (let i = 0; i < n; i++) {
        const x1 = px[i] * cosA + pz[i] * sinA
        const z1 = -px[i] * sinA + pz[i] * cosA
        const y2 = py[i] * cosT - z1 * sinT
        const z2 = py[i] * sinT + z1 * cosT
        if (z2 <= 0) continue
        ctx.globalAlpha = 0.25 + 0.75 * z2
        ctx.beginPath()
        ctx.arc(cx + x1 * R, cy - y2 * R, dot * (0.6 + 0.4 * z2), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    resize()
    const start = performance.now()
    const angleAt = (t: number) => -((t - start) / 1000 / TURN_SECONDS) * Math.PI * 2 + 1.2 // start over the Americas
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    draw(angleAt(start))

    let raf = 0
    let last = 0
    let visible = true
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (!visible || t - last < 1000 / FPS) return
      last = t
      draw(angleAt(t))
    }
    if (!still) raf = requestAnimationFrame(loop)

    const ro = new ResizeObserver(() => {
      resize()
      draw(angleAt(performance.now()))
    })
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
    io.observe(canvas)
    // theme switch changes the colour: re-read it when <html data-theme> changes
    const mo = new MutationObserver(() => {
      colour = getComputedStyle(canvas).color
      draw(angleAt(performance.now()))
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onScheme = () => {
      colour = getComputedStyle(canvas).color
      draw(angleAt(performance.now()))
    }
    mq?.addEventListener('change', onScheme)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      mo.disconnect()
      mq?.removeEventListener('change', onScheme)
    }
  }, [])

  return <canvas ref={ref} className="hero-globe" aria-hidden="true" />
}
