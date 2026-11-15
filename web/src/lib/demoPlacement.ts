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

/** Below this width the note is a bottom sheet: full width, docked to the bottom edge, so it can never run off the screen. */
export const NARROW = 600

/**
 * The lit-up rectangle: the target plus its padding, cut to what is really visible (inside the screen and below a
 * sticky header of `inset` px). Null when none of it is visible, so the caller can dim the whole page instead.
 */
export function clampSpot(target: Box, vp: Size, inset = 0, pad = SPOT_PAD): Box | null {
  const t = inflate(target, pad)
  const left = Math.max(t.left, 0)
  const top = Math.max(t.top, inset)
  const right = Math.min(t.left + t.width, vp.width)
  const bottom = Math.min(t.top + t.height, vp.height)
  return right - left > 0 && bottom - top > 0 ? { top, left, width: right - left, height: bottom - top } : null
}

/**
 * Tooltip position (viewport coordinates). No target: centred at the bottom of the screen.
 * `inset` is the height of a sticky header the note must stay below. On a narrow screen the note is docked to the bottom.
 */
export function placeTip(target: Box | null, tip: Size, vp: Size, gap = 14, margin = 12, inset = 0): Placement {
  const minTop = margin + inset
  const maxLeft = Math.max(margin, vp.width - tip.width - margin)
  const maxTop = Math.max(minTop, vp.height - tip.height - margin)
  const bottom: Placement = { top: maxTop, left: clamp((vp.width - tip.width) / 2, margin, maxLeft), side: 'dock', overlaps: false }
  if (!target) return bottom
  const t = inflate(target, SPOT_PAD)
  const covers = (p: Placement) => {
    const x = Math.max(0, Math.min(p.left + tip.width, t.left + t.width) - Math.max(p.left, t.left))
    const y = Math.max(0, Math.min(p.top + tip.height, t.top + t.height) - Math.max(p.top, t.top))
    return x * y
  }
  if (vp.width < NARROW) return { ...bottom, overlaps: covers(bottom) > 0 }
  const cx = clamp(t.left + t.width / 2 - tip.width / 2, margin, maxLeft)
  const cy = clamp(t.top + t.height / 2 - tip.height / 2, minTop, maxTop)
  const candidates: Array<[Side, number, number]> = [
    ['below', t.top + t.height + gap, cx],
    ['above', t.top - gap - tip.height, cx],
    ['right', cy, t.left + t.width + gap],
    ['left', cy, t.left - gap - tip.width],
  ]
  for (const [side, top, left] of candidates) {
    const inside = top >= minTop && left >= margin && top + tip.height <= vp.height - margin && left + tip.width <= vp.width - margin
    if (inside && !intersects({ top, left, width: tip.width, height: tip.height }, t)) return { top, left, side, overlaps: false }
  }
  // Nothing fits beside it: dock at the screen edge that covers the least of the target.
  const topDock: Placement = { ...bottom, top: minTop }
  const best = covers(topDock) < covers(bottom) ? topDock : bottom
  return { ...best, overlaps: covers(best) > 0 }
}
