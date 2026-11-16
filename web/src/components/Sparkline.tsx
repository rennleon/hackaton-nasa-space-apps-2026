import type { YearPoint } from '../types/contract'
import type { Direction } from '../lib/findings'
import './Sparkline.css'

const W = 120
const H = 38
const PAD = 4
/** The wide form fills a card: the same dots and line on a 10:3 canvas (the viewBox scales evenly, so the dots stay round). */
const WIDE = { w: 320, h: 96, pad: 10, r: 3.4 }

/** Least-squares line through the dots, only used to draw the line (the verdict comes from the engine). */
function fit(pts: { x: number; y: number }[]): { a: number; b: number } | null {
  const n = pts.length
  if (n < 3) return null
  const mx = pts.reduce((s, q) => s + q.x, 0) / n
  const my = pts.reduce((s, q) => s + q.y, 0) / n
  const sxx = pts.reduce((s, q) => s + (q.x - mx) ** 2, 0)
  if (sxx === 0) return null
  const b = pts.reduce((s, q) => s + (q.x - mx) * (q.y - my), 0) / sxx
  return { a: my - b * mx, b }
}

/** One dot per year plus one line. Dots outside the analysis window are hollow. */
export function Sparkline({ series, label, wide = false }: { series: YearPoint[]; label: string; wide?: boolean }) {
  const pts = [...series].sort((p, q) => p.year - q.year)
  if (pts.length < 2) return null
  const x0 = pts[0].year
  const x1 = pts[pts.length - 1].year
  let y0 = Math.min(...pts.map((q) => q.anomaly))
  let y1 = Math.max(...pts.map((q) => q.anomaly))
  if (y1 === y0) {
    y0 -= 1
    y1 += 1
  }
  const w = wide ? WIDE.w : W
  const h = wide ? WIDE.h : H
  const pad = wide ? WIDE.pad : PAD
  const X = (x: number) => pad + ((x - x0) / (x1 - x0 || 1)) * (w - 2 * pad)
  const Y = (y: number) => h - pad - ((y - y0) / (y1 - y0)) * (h - 2 * pad)
  const inside = pts.filter((q) => q.in_window).map((q) => ({ x: q.year, y: q.anomaly }))
  const line = fit(inside)
  const lx0 = inside.length ? inside[0].x : x0
  const lx1 = inside.length ? inside[inside.length - 1].x : x1
  return (
    <svg className={wide ? 'spark spark-wide' : 'spark'} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} preserveAspectRatio={wide ? undefined : 'none'}>
      {line && <line className="spark-line" x1={X(lx0)} y1={Y(line.a + line.b * lx0)} x2={X(lx1)} y2={Y(line.a + line.b * lx1)} />}
      {pts.map((q) => (
        <circle key={q.year} className={q.in_window ? 'spark-dot' : 'spark-dot spark-out'} cx={X(q.year)} cy={Y(q.anomaly)} r={wide ? WIDE.r : 1.9} />
      ))}
    </svg>
  )
}

/** Trend arrow. Its shape carries the direction; `label` is its accessible name (the card adds a tooltip and the colour). */
export function TrendArrow({ direction, sure, label }: { direction: Direction; sure: boolean; label: string }) {
  const rotate = direction === 'up' ? 0 : direction === 'down' ? 180 : 90
  return (
    <svg className={`trend-arrow${sure ? ' trend-sure' : ''}`} viewBox="0 0 20 20" width="22" height="22" role="img" aria-label={label}>
      <g transform={`rotate(${rotate} 10 10)`}>
        <path d="M10 3.5v13M4.8 8.6L10 3.5l5.2 5.1" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}
