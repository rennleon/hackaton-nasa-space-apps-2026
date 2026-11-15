import { describe, expect, it } from 'vitest'
import { availabilityOf, certaintyOfEntry, cleanPlaceName, directionOf, sourceParts, splitEntries, summarize } from './findings'
import { FC } from './findingsCopy'
import { bannedIn } from './copy.test'
import type { ScanEntry, VariableRef } from '../types/contract'

const units = { display: 'x', simple: 'x', decimals: 1 }
const entry = (id: string, label: ScanEntry['shortlist_label'], verdict: ScanEntry['verdict_label'], p: number | null, extra: Partial<ScanEntry> = {}): ScanEntry => ({
  variable_id: id, name: { simple: id, scientific: id }, role: 'target', source_type: 'observed', shortlist_label: label, verdict_label: verdict,
  slope_per_decade: p == null ? null : 1, units, p_decisive: p, p_adjusted: p, reason: null, worth_investigating: true, mdt_per_decade: null, why: { simple: '', scientific: '' },
  availability: 'available', instrument_id: null, yearly_series: null, cross_check: null, ...extra,
})

describe('availability, sort and collapse', () => {
  const entries = [
    entry('gone', 'cant_tell', 'cant_tell', null, { availability: 'no_data_here' }),
    entry('soon', 'no_detectable_change', 'no_detectable_change', 0.5),
    entry('sure', 'changing', 'significant', 0.001),
    entry('short', 'cant_tell', 'cant_tell', null, { availability: 'too_short' }),
    entry('maybe', 'possibly_changing', 'borderline', 0.04),
  ]
  it('puts results first, strongest first, and collapses everything not available', () => {
    const { available, unavailable } = splitEntries(entries)
    expect(available.map((e) => e.variable_id)).toEqual(['sure', 'maybe', 'soon'])
    expect(unavailable.map((e) => e.variable_id).sort()).toEqual(['gone', 'short'])
  })
  it('treats an old scan without availability by its slope', () => {
    const old = { ...entry('a', 'changing', 'significant', 0.01), availability: undefined } as unknown as ScanEntry
    const none = { ...entry('b', 'cant_tell', 'cant_tell', null), availability: undefined } as unknown as ScanEntry
    expect(availabilityOf(old)).toBe('available')
    expect(availabilityOf(none)).toBe('no_data_here')
  })
  it('counts clear changes from the same signal as the verdict chip', () => {
    const { available } = splitEntries(entries)
    const s = summarize(available)
    expect(s).toMatchObject({ total: 3, clear: 1 })
    expect(s.strongest?.variable_id).toBe('sure')
  })
  it('uses the Benjamini-Hochberg label, not the single-variable verdict', () => {
    const cut = entry('cut', 'possibly_changing', 'significant', 0.04)
    expect(certaintyOfEntry(cut)).toBe('maybe')
    expect(summarize([cut, entry('sure', 'changing', 'significant', 0.001)])).toMatchObject({ total: 2, clear: 1 })
    expect(certaintyOfEntry(entry('x', 'cant_tell', 'cant_tell', null))).toBe('cant_tell')
    expect(certaintyOfEntry(entry('y', 'no_detectable_change', 'borderline', 0.2))).toBe('too_soon')
  })
  it('direction from the slope sign', () => {
    expect([directionOf(2), directionOf(-1), directionOf(0), directionOf(null)]).toEqual(['up', 'down', 'flat', null])
  })
})

describe('place names and source parts', () => {
  it('hides internal labels', () => {
    expect(cleanPlaceName('Cajamarca (test box)')).toBe('Cajamarca')
    expect(cleanPlaceName('Wisconsin')).toBe('Wisconsin')
  })
  const base: VariableRef = {
    id: 'v', giovanni_id: null, name: { simple: 'v', scientific: 'v' }, definition: { simple: '', scientific: '' }, source_type: 'observed', instrument: 'AIRS', units,
    instrument_id: 'airs', platform: 'Aqua', delivered_by: null, cell_deg: 1,
  }
  it('names the instrument, platform and start year', () => {
    expect(sourceParts(base)).toMatchObject({ kind: 'satellite', name: 'AIRS', platform: 'Aqua', since: 2002, viaPower: false })
  })
  it('NASA POWER is a delivery service, not the instrument', () => {
    const p = sourceParts({ ...base, source_type: 'model', instrument: 'MERRA-2', instrument_id: 'merra2', platform: null, delivered_by: 'NASA POWER' })
    expect(p).toMatchObject({ kind: 'model', name: 'MERRA-2', platform: null, viaPower: true })
  })
})

describe('Findings copy', () => {
  it('has no technical words in the Simple strings', () => {
    for (const [key, v] of Object.entries(FC)) expect(bannedIn(v.simple), key).toEqual([])
  })
  it('keeps Simple sentences short', () => {
    for (const [key, v] of Object.entries(FC)) for (const s of v.simple.split(/[.?!]\s/)) expect(s.split(/\s+/).length, key).toBeLessThanOrEqual(22)
  })
})
