import { describe, expect, it } from 'vitest'
import { parseHash, toHash } from './route'
import { formatP, formatSlope, formatYm, pick } from './text'
import { coverageFor } from './coverage'
import { sortEntries } from './labels'
import { anomalyChart, chartSummary, rawChart } from './charts'
import type { ScanEntry, AnalysisResult } from '../types/contract'
import type { VariableCard } from '../types/catalog'

const units = { display: '%RH', simple: 'percentage points', decimals: 2 }

describe('route', () => {
  it('round-trips', () => {
    const r = { screen: 'variable' as const, region: 'a', theme: 'water', variable: 'v', season: 'wet', start: '2005', end: '2015', demo: 'x', step: 2 }
    expect(parseHash(toHash(r))).toEqual(r)
  })
  it('falls back to home', () => {
    expect(parseHash('#/nonsense')).toEqual({ screen: 'home' })
    expect(parseHash('')).toEqual({ screen: 'home' })
  })
})

describe('text', () => {
  it('picks register', () => {
    expect(pick({ simple: 's', scientific: 'c' }, 'scientific')).toBe('c')
    expect(pick(null, 'simple')).toBe('')
  })
  it('formats slopes per register', () => {
    expect(formatSlope(1.486, units, 'scientific')).toBe('+1.49 %RH per decade')
    expect(formatSlope(-0.5, units, 'simple')).toBe('−0.50 percentage points every 10 years')
    expect(formatSlope(null, units, 'simple')).toBe('—')
  })
  it('formats p and months', () => {
    expect(formatP(0.0000004)).toBe('< 0.001')
    expect(formatP(0.0312)).toBe('0.031')
    expect(formatYm('2002-09')).toBe('Sep 2002')
  })
})

const card = (over: Partial<VariableCard>): VariableCard => ({
  id: 'v', giovanni_id: 'g', name: { simple: 'a', scientific: 'a' }, definition: { simple: 'a', scientific: 'a' },
  source: { instrument: 'X', type: 'observed' }, units: { native: '%', display: '%', simple: '%', scale: 1, offset: 0, decimals: 1 },
  grid_deg: 1, record_start: '2002-09', artifacts: [], cross_check: null, words: { up: 'u', down: 'd' }, themes: {}, ...over,
})

describe('coverage', () => {
  it('shades drift years', () => {
    const c = coverageFor(card({ artifacts: [{ kind: 'orbit_drift', start: '2022-01', action: 'end_window_before', note: { simple: '', scientific: '' } }] }), 2026.8)
    expect(c.start).toBeCloseTo(2002 + 8 / 12)
    expect(c.end).toBe(2022)
    expect(c.drift).toEqual([2022, 2026.8])
  })
  it('has no drift without artifact', () => {
    expect(coverageFor(card({}), 2026).drift).toBeNull()
  })
})

const entry = (id: string, label: ScanEntry['shortlist_label'], p: number | null): ScanEntry => ({
  variable_id: id, name: { simple: id, scientific: id }, role: 'target', source_type: 'observed', shortlist_label: label,
  verdict_label: 'cant_tell', slope_per_decade: 0, units, p_decisive: p, p_adjusted: p, reason: null, worth_investigating: true, mdt_per_decade: null, why: { simple: '', scientific: '' },
  availability: 'available', instrument_id: null, yearly_series: null, cross_check: null,
})

describe('sortEntries', () => {
  it('puts strongest evidence first and unknown last', () => {
    const out = sortEntries([entry('d', 'cant_tell', null), entry('b', 'changing', 0.04), entry('a', 'changing', 0.001), entry('c', 'no_detectable_change', 0.5)])
    expect(out.map((e) => e.variable_id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

const result: AnalysisResult = {
  schema_version: '1', engine_version: 't', region: { id: 'r', name: { simple: 'r', scientific: 'r' } },
  season: null, season_series: null, seasonal_share: null, selection: null, yearly_series: null, then_now: null, tests: [], persistence: null, detectability: null,
  robustness: { leave_one_year_out: null, drift_label_with_late_years: null, cross_check: null, spatial: null }, chips: [],
  variable: { id: 'v', giovanni_id: 'g', name: { simple: 'v', scientific: 'v' }, definition: { simple: '', scientific: '' }, source_type: 'observed', instrument: 'X', units, instrument_id: null, platform: null, delivered_by: null, cell_deg: null },
  provenance: null, window: { start: '2002-09', end: '2003-01', reason: 'drift_cut', years: 0.4 },
  gates: { passed: true, checks: [] }, published: null, published_context: [],
  series: ['2002-09', '2002-10', '2002-11', '2002-12', '2003-01', '2003-02'].map((t, i) => ({ t, value: 60 + i, anomaly: i - 2, in_window: i < 5 })),
  trend: { slope_per_decade: 1.5, ci_low: 1, ci_high: 2, fit: [{ t: '2002-09', trend: 0, low: -1, high: 1 }, { t: '2003-01', trend: 1, low: 0, high: 2 }] },
  verdict: { label: 'significant', certainty: 'sure', answer: { simple: 'a', scientific: 'a' }, how_much: { simple: 'h', scientific: 'h' }, headline: { simple: 'h', scientific: 'h' }, sentence: { simple: 's', scientific: 's' }, notes: [] },
}

describe('charts', () => {
  it('greys out-of-window months and shades the excluded period', () => {
    const c = rawChart(result, 'scientific')
    expect(c.data).toHaveLength(2)
    expect((c.data[1] as { x: string[] }).x).toEqual(['2003-02-01'])
    expect(c.layout.shapes).toHaveLength(1)
  })
  it('adds a band and a trend trace', () => {
    const c = anomalyChart(result, 'simple')
    expect(c.data).toHaveLength(4)
  })
  it('summarises in both registers', () => {
    expect(chartSummary(result, 'simple')).toMatch(/goes up/)
    expect(chartSummary(result, 'scientific')).toMatch(/per decade/)
  })
})
