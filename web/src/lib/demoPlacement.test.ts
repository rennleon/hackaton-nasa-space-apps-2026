import { describe, expect, it } from 'vitest'
import { clampSpot, inflate, intersects, placeTip, SPOT_PAD, type Box } from './demoPlacement'

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

describe('phone bottom sheet and sticky header', () => {
  const phone = { width: 390, height: 844 }
  const sheet = { width: 366, height: 300 }

  it('docks full-width at the bottom on a narrow screen, fully on screen', () => {
    const t = box({ top: 200, left: 12, width: 366, height: 150 })
    const p = placeTip(t, sheet, phone)
    expect(p.side).toBe('dock')
    expect(p.overlaps).toBe(false)
    expect(p.left).toBeGreaterThanOrEqual(0)
    expect(p.left + sheet.width).toBeLessThanOrEqual(phone.width)
    expect(p.top + sheet.height).toBeLessThanOrEqual(phone.height)
  })

  it('reports an overlap when the target sits behind the bottom sheet', () => {
    const p = placeTip(box({ top: 600, left: 12, width: 366, height: 150 }), sheet, phone)
    expect(p).toMatchObject({ side: 'dock', overlaps: true })
  })

  it('keeps a wide-screen note below the sticky header', () => {
    const p = placeTip(box({ top: 400, left: 100, width: 300, height: 360 }), tip, vp, 14, 12, 90)
    expect(p.top).toBeGreaterThanOrEqual(12 + 90)
  })

  it('clamps the spotlight to the screen and below the header', () => {
    expect(clampSpot({ top: 40, left: -20, width: 600, height: 200 }, phone, 120)).toEqual({ top: 120, left: 0, width: 390, height: 126 })
    expect(clampSpot({ top: 100, left: 12, width: 100, height: 40 }, phone, 0)).toEqual({ top: 94, left: 6, width: 112, height: 52 })
  })

  it('has no spotlight when the target is out of sight', () => {
    expect(clampSpot({ top: 900, left: 10, width: 100, height: 40 }, phone, 100)).toBeNull()
    expect(clampSpot({ top: 10, left: 10, width: 100, height: 40 }, phone, 120)).toBeNull()
  })
})
