// Where the demo tooltip goes: next to the highlighted element, never on top of it (when the screen has room).
export interface Box {
  top: number
  left: number
  width: number
  height: number
}
export interface Size {
  width: number
  height: number
}
export type Side = 'below' | 'above' | 'right' | 'left' | 'dock'
export interface Placement {
  top: number
  left: number
  side: Side
  /** true only when no side has room (a target as big as the screen); the tooltip is then docked at the screen edge */
  overlaps: boolean
}

/** Extra room around the highlighted element (the dim cut-out is drawn with this padding). */
export const SPOT_PAD = 6

export const inflate = (b: Box, by: number): Box => ({ top: b.top - by, left: b.left - by, width: b.width + 2 * by, height: b.height + 2 * by })

export function intersects(a: Box, b: Box): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Tooltip position (viewport coordinates). No target: centred at the bottom of the screen. */
export function placeTip(target: Box | null, tip: Size, vp: Size, gap = 14, margin = 12): Placement {
  const maxLeft = Math.max(margin, vp.width - tip.width - margin)
  const maxTop = Math.max(margin, vp.height - tip.height - margin)
  const bottom: Placement = { top: maxTop, left: clamp((vp.width - tip.width) / 2, margin, maxLeft), side: 'dock', overlaps: false }
  if (!target) return bottom
  const t = inflate(target, SPOT_PAD)
  const cx = clamp(t.left + t.width / 2 - tip.width / 2, margin, maxLeft)
  const cy = clamp(t.top + t.height / 2 - tip.height / 2, margin, maxTop)
  const candidates: Array<[Side, number, number]> = [
    ['below', t.top + t.height + gap, cx],
    ['above', t.top - gap - tip.height, cx],
    ['right', cy, t.left + t.width + gap],
    ['left', cy, t.left - gap - tip.width],
  ]
  for (const [side, top, left] of candidates) {
    const inside = top >= margin && left >= margin && top + tip.height <= vp.height - margin && left + tip.width <= vp.width - margin
    if (inside && !intersects({ top, left, width: tip.width, height: tip.height }, t)) return { top, left, side, overlaps: false }
  }
  // Nothing fits beside it: dock at the screen edge that covers the least of the target.
  const topDock: Placement = { ...bottom, top: margin }
  const cover = (p: Placement) => {
    const x = Math.max(0, Math.min(p.left + tip.width, t.left + t.width) - Math.max(p.left, t.left))
    const y = Math.max(0, Math.min(p.top + tip.height, t.top + t.height) - Math.max(p.top, t.top))
    return x * y
  }
  const best = cover(topDock) < cover(bottom) ? topDock : bottom
  return { ...best, overlaps: cover(best) > 0 }
}
