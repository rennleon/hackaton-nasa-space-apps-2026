import { describe, expect, it } from 'vitest'
import { inflate, intersects, placeTip, SPOT_PAD, type Box } from './demoPlacement'

const vp = { width: 1280, height: 800 }
const tip = { width: 380, height: 220 }
const box = (b: Partial<Box>): Box => ({ top: 100, left: 100, width: 300, height: 120, ...b })
const tipBox = (p: { top: number; left: number }): Box => ({ top: p.top, left: p.left, width: tip.width, height: tip.height })

describe('placeTip', () => {
  it('goes below the target when there is room, and never covers it', () => {
    const t = box({})
    const p = placeTip(t, tip, vp)
    expect(p.side).toBe('below')
    expect(p.overlaps).toBe(false)
    expect(intersects(tipBox(p), inflate(t, SPOT_PAD))).toBe(false)
  })

  it('goes above when the target is at the bottom of the screen', () => {
    const t = box({ top: 640, height: 120 })
    const p = placeTip(t, tip, vp)
    expect(p.side).toBe('above')
    expect(intersects(tipBox(p), inflate(t, SPOT_PAD))).toBe(false)
  })

  it('goes beside a tall full-height target when the screen is wide', () => {
    const t = box({ top: 60, left: 20, width: 300, height: 700 })
    const p = placeTip(t, tip, vp)
    expect(p.side).toBe('right')
    expect(intersects(tipBox(p), inflate(t, SPOT_PAD))).toBe(false)
  })

  it('stays inside the screen on a phone', () => {
    const phone = { width: 375, height: 700 }
    const t = box({ top: 60, left: 12, width: 351, height: 180 })
    const p = placeTip(t, { width: 351, height: 240 }, phone)
    expect(p.left).toBeGreaterThanOrEqual(0)
    expect(p.left + 351).toBeLessThanOrEqual(phone.width)
    expect(p.top + 240).toBeLessThanOrEqual(phone.height)
    expect(intersects({ top: p.top, left: p.left, width: 351, height: 240 }, inflate(t, SPOT_PAD))).toBe(false)
  })

  it('docks at the bottom with no target, and says so when a huge target cannot be avoided', () => {
    const none = placeTip(null, tip, vp)
    expect(none).toMatchObject({ side: 'dock', overlaps: false })
    expect(none.top + tip.height).toBeLessThanOrEqual(vp.height)
    const huge = placeTip(box({ top: 0, left: 0, width: 1280, height: 800 }), tip, vp)
    expect(huge).toMatchObject({ side: 'dock', overlaps: true })
  })
})
