import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { render } from '@testing-library/react'
import { GlossaryProvider, ViewProvider } from '../context'
import type { GlossaryTerm } from '../types/catalog'
import type { AnalysisResult, VariableRef } from '../types/contract'
import { S, splitGiovanniId } from '../lib/sourceLabels'
import { bannedIn } from '../lib/copy.test'
import { SourceTag } from './SourceTag'

const base = (JSON.parse(readFileSync('src/fixtures/airs_rh_surf_day.json', 'utf8')) as AnalysisResult).variable
const glossary = JSON.parse(readFileSync('public/data/catalog/glossary.json', 'utf8')) as GlossaryTerm[]
const variables = JSON.parse(readFileSync('public/data/catalog/variables.json', 'utf8')) as { id: string; giovanni_id: string }[]

const airs: VariableRef = { ...base, instrument: 'AIRS', instrument_id: 'airs', platform: 'Aqua', source_type: 'observed', delivered_by: null, cell_deg: 1 }
const viaPower: VariableRef = {
  ...base, id: 'power_t2m', giovanni_id: null, name: { simple: 'Air temperature', scientific: 'Air temperature at 2 m' },
  instrument: 'MERRA-2', instrument_id: 'merra2', platform: null, source_type: 'model', delivered_by: 'NASA POWER', cell_deg: 0.5,
}
const direct: VariableRef = {
  ...base, id: 'gldas_evap', giovanni_id: 'GLDAS_NOAH025_M_2_1_Evap_tavg', name: { simple: 'Evaporation', scientific: 'Evapotranspiration' },
  instrument: 'GLDAS', instrument_id: 'gldas', platform: null, source_type: 'model', delivered_by: null, cell_deg: 0.25,
}

const show = (variable: VariableRef, view: 'simple' | 'scientific', compact = false) =>
  render(
    <ViewProvider initial={view}>
      <GlossaryProvider terms={glossary}>
        <SourceTag variable={variable} compact={compact} />
      </GlossaryProvider>
    </ViewProvider>,
  )
/** Visible text of a line, without the hidden glossary tooltips. */
const text = (p: Element) => [...p.querySelectorAll('.source-k, .source-v')].map((e) => {
  const clone = e.cloneNode(true) as Element
  clone.querySelectorAll('.term-tip').forEach((n) => n.remove())
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
})

describe('SourceTag: satellite instrument', () => {
  it('Simple: names the variable and the instrument on its own labelled lines', () => {
    const { container } = show(airs, 'simple')
    const rows = [...container.querySelectorAll('.source-line')].map(text)
    expect(rows[0]).toEqual(['What we measure', 'Afternoon humidity'])
    expect(rows[1]).toEqual(['Measured by', 'AIRS, an instrument on the Aqua satellite'])
    expect(container.querySelector('a')).toHaveAttribute('href', '#/sources?instrument=airs')
    expect(bannedIn(container.textContent ?? '')).toEqual([])
  })
  it('Scientific: variable with product and version, instrument with platform, year and grid', () => {
    const { container } = show(airs, 'scientific')
    const rows = [...container.querySelectorAll('.source-line')].map(text)
    expect(rows[0]).toEqual(['Variable', 'Surface relative humidity, daytime, AIRS ascending (AIRS3STM v7.0 · RelHumSurf_A)'])
    expect(rows[1]).toEqual(['Instrument', 'AIRS · Aqua satellite · since 2002 · 1° grid'])
  })
  it('compact: icon and "Measured by AIRS (Aqua satellite)"', () => {
    const { container } = show(airs, 'simple', true)
    expect(container.textContent).toBe('Measured by AIRS (Aqua satellite)')
    expect(container.querySelector('svg')).not.toBeNull()
    const sci = show(airs, 'scientific', true)
    expect(sci.container.textContent).toBe('Instrument: AIRS (Aqua satellite)')
  })
})

describe('SourceTag: computer model delivered by NASA POWER', () => {
  it('Simple: "Worked out by", a computer model, via NASA POWER, and never a satellite', () => {
    const { container } = show(viaPower, 'simple')
    const rows = [...container.querySelectorAll('.source-line')].map(text)
    expect(rows[0]).toEqual(['What we measure', 'Air temperature'])
    expect(rows[1]).toEqual(['Worked out by', 'MERRA-2, a computer model (via NASA POWER)'])
    expect(container.querySelector('.source-note')?.textContent).toMatch(/^This is a computer model estimate/)
    expect(container.textContent).not.toMatch(/satellite/i)
  })
  it('Scientific: POWER is the delivery service and its parameter is shown', () => {
    const { container } = show(viaPower, 'scientific')
    const rows = [...container.querySelectorAll('.source-line')].map(text)
    expect(rows[0]).toEqual(['Variable', 'Air temperature at 2 m (via NASA POWER · T2M)'])
    expect(rows[1]).toEqual(['Instrument', 'MERRA-2 · computer model · since 1980 · 0.5° grid · via NASA POWER'])
  })
  it('compact keeps "computer model estimate" in Simple', () => {
    expect(show(viaPower, 'simple', true).container.textContent).toBe('Worked out by MERRA-2 (computer model estimate, via NASA POWER)')
  })
})

describe('SourceTag: computer model fetched directly (no NASA POWER)', () => {
  it('Simple and Scientific', () => {
    const s = show(direct, 'simple')
    expect([...s.container.querySelectorAll('.source-line')].map(text)[1]).toEqual(['Worked out by', 'GLDAS, a computer model'])
    expect(s.container.textContent).not.toMatch(/POWER/)
    const sci = show(direct, 'scientific')
    const rows = [...sci.container.querySelectorAll('.source-line')].map(text)
    expect(rows[0][1]).toBe('Evapotranspiration (GLDAS_NOAH025_M v2.1 · Evap_tavg)')
    expect(rows[1][1]).toBe('GLDAS · computer model · since 2000 · 0.25° grid')
  })
})

describe('splitGiovanniId', () => {
  it('breaks product, version and variable apart for every catalog card', () => {
    expect(splitGiovanniId('AIRS3STM_7_0_RelHumSurf_A')).toEqual({ product: 'AIRS3STM', version: '7.0', param: 'RelHumSurf_A' })
    expect(splitGiovanniId('GPM_3IMERGM_07_precipitation')).toEqual({ product: 'GPM_3IMERGM', version: '7', param: 'precipitation' })
    expect(splitGiovanniId('M2TMNXSLV_5_12_4_T2M')).toEqual({ product: 'M2TMNXSLV', version: '5.12.4', param: 'T2M' })
    for (const v of variables.filter((x) => x.giovanni_id)) {
      const parts = splitGiovanniId(v.giovanni_id)
      expect(parts, v.giovanni_id).not.toBeNull()
      expect(`${parts!.product}_${parts!.param}`.length).toBeGreaterThan(3)
    }
  })
})

describe('Simple wording of the variable / instrument labels (R5)', () => {
  it('uses no banned words and short sentences', () => {
    for (const [key, v] of Object.entries(S)) {
      expect(bannedIn(v.simple), key).toEqual([])
      for (const sentence of v.simple.split(/[.?!]\s/)) expect(sentence.split(/\s+/).length, key).toBeLessThanOrEqual(16)
    }
  })
  it('has glossary entries in kid words for variable, instrument, satellite and computer model', () => {
    for (const id of ['variable', 'instrument', 'satellite', 'computer_model']) {
      const g = glossary.find((x) => x.id === id)
      expect(g, id).toBeDefined()
      expect(bannedIn(g!.definition.simple), id).toEqual([])
    }
  })
})
