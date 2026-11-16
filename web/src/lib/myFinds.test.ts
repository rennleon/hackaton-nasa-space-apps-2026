import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { FINDS_KEY, findFromResult, isSaved, loadFinds, removeFind, saveFind, type Find } from './myFinds'
import { findFileName, findLink, findReportJson, findReportText } from './findReport'
import type { AnalysisResult } from '../types/contract'

const result = JSON.parse(readFileSync('src/fixtures/airs_rh_surf_day.json', 'utf8')) as AnalysisResult
const route = { screen: 'variable' as const, region: 'cajamarca_west', theme: 'water', variable: 'airs_rh_surf_day' }
const make = (over: Partial<Find> = {}): Find => ({ ...findFromResult(result, route, 'Cajamarca')!, ...over })

beforeEach(() => {
  localStorage.clear()
  loadFinds() // sync the in-memory mirror
})
afterEach(() => vi.restoreAllMocks())

describe('findFromResult', () => {
  it('captures place, variable, window, rate, range, tests and source', () => {
    const f = make()
    expect(f.id).toBe('cajamarca_west|airs_rh_surf_day|2002-09..2021-12|all')
    expect(f.place_label).toBe('Cajamarca')
    expect(f.variable_name).toBe('Afternoon humidity')
    expect(f.window_start).toBe('2002-09')
    expect(f.slope_per_10y).toBeCloseTo(1.476, 2)
    expect(f.units).toBe('%RH')
    expect(f.ci_low).toBeLessThan(f.slope_per_10y)
    expect(f.ci_high).toBeGreaterThan(f.slope_per_10y)
    expect(f.verdict).toBe('sure')
    expect(f.tests.filter((x) => x.decisive)).toHaveLength(2)
    expect(f.source).toBe('AIRS')
    expect(f.dataset).toBe('AIRS3STM v7.0 · RelHumSurf_A')
    expect(f.route).toEqual({ region: 'cajamarca_west', theme: 'water', variable: 'airs_rh_surf_day' })
  })

  it('returns null without a trend', () => {
    expect(findFromResult({ ...result, trend: null }, route, 'x')).toBeNull()
  })
})

describe('my finds storage', () => {
  it('starts empty, saves newest first, and survives a reload', () => {
    expect(loadFinds()).toEqual([])
    saveFind(make({ id: 'a' }))
    saveFind(make({ id: 'b' }))
    expect(loadFinds().map((f) => f.id)).toEqual(['b', 'a'])
    expect(JSON.parse(localStorage.getItem(FINDS_KEY)!)).toHaveLength(2)
    expect(isSaved('a')).toBe(true)
    expect(isSaved('zzz')).toBe(false)
  })

  it('dedupes by id', () => {
    saveFind(make({ id: 'a', place_label: 'first' }))
    saveFind(make({ id: 'a', place_label: 'second' }))
    expect(loadFinds()).toHaveLength(1)
    expect(loadFinds()[0].place_label).toBe('first')
  })

  it('removes a find', () => {
    saveFind(make({ id: 'a' }))
    saveFind(make({ id: 'b' }))
    expect(removeFind('a').map((f) => f.id)).toEqual(['b'])
    expect(loadFinds().map((f) => f.id)).toEqual(['b'])
  })

  it('ignores broken or foreign data', () => {
    localStorage.setItem(FINDS_KEY, '{not json')
    expect(loadFinds()).toEqual([])
    localStorage.setItem(FINDS_KEY, JSON.stringify([{ nope: 1 }, make({ id: 'ok' })]))
    expect(loadFinds().map((f) => f.id)).toEqual(['ok'])
  })

  it('keeps working in memory when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => loadFinds()).not.toThrow()
    expect(() => saveFind(make({ id: 'mem' }))).not.toThrow()
    expect(loadFinds().map((f) => f.id)).toEqual(['mem'])
    expect(() => removeFind('mem')).not.toThrow()
    expect(loadFinds()).toEqual([])
  })
})

describe('find report', () => {
  const f = make({ saved_at: '2026-11-15T10:00:00.000Z' })
  const link = findLink(f, 'https://example.org/app/')

  it('links back to the result with the same route params', () => {
    expect(link).toBe('https://example.org/app/#/variable?region=cajamarca_west&theme=water&variable=airs_rh_surf_day')
  })

  it('writes a citable plain-text summary', () => {
    const text = findReportText(f, link)
    for (const part of [
      'What: Afternoon humidity',
      'Where: Cajamarca',
      'Years used: 2002-09 – 2021-12',
      'Rate of change: +1.476 %RH per 10 years',
      '95% range:',
      'both persistence-aware tests agree at the 95% level',
      'Mann–Kendall (Hamed–Rao corrected): p < 0.001 (decisive)',
      'OLS slope, effective sample size: p < 0.001 (decisive)',
      'Data source: AIRS',
      'Dataset: AIRS3STM v7.0 · RelHumSurf_A',
      'Made with: Earth System Trend Detective v',
      'Date: 2026-11-15',
      `Link: ${link}`,
    ])
      expect(text, part).toContain(part)
  })

  it('writes the same fields as JSON', () => {
    const j = JSON.parse(findReportJson(f, link))
    expect(j.app.name).toBe('Earth System Trend Detective')
    expect(j.link).toBe(link)
    expect(j.variable_id).toBe('airs_rh_surf_day')
    expect(j.slope_per_10y).toBeCloseTo(1.476, 2)
    expect(j.dataset).toBe('AIRS3STM v7.0 · RelHumSurf_A')
    expect(findFileName(f)).toBe('trend-find-airs_rh_surf_day-2002-09-2021-12.json')
  })
})
