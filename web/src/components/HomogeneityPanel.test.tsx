import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GlossaryProvider, ViewProvider } from '../context'
import { setLang } from '../i18n'
import es from '../i18n/es'
import { bannedIn } from '../lib/copy.test'
import type { Homogeneity } from '../types/contract'
import { HomogeneityPanel } from './HomogeneityPanel'

const t = (simple: string, scientific = simple, simple_es?: string, scientific_es?: string) => ({ simple, scientific, simple_es, scientific_es })

const base = { precip_min: 0.04, precip_max: 2.42, t2m_min: 8.4, t2m_max: 25.5, elev_min: 0, elev_max: 3843 }

const MIXED: Homogeneity = {
  ...base,
  kind: 'mixed',
  n_cells: 54,
  climate_groups: { A: 5, B: 42, C: 7 },
  reasons: [
    { code: 'elevation', text: t('Some parts are high up and some are low.', 'Model elevation range 3843 m (above 1000 m).', 'Algunas partes están en lo alto y otras en lo bajo.') },
    { code: 'rain', text: t('Some parts get much more rain than others.', 'Annual precipitation 0.04–2.42 mm/day.') },
  ],
  suggestions: [
    { bbox: [-78.12, -8.25, -76.56, -6.25], name: t('the high, cool part', 'Köppen C, model elevation 1500 m or more', 'la parte alta y fresca', 'Köppen C, elevación del modelo de 1500 m o más'), n_cells: 12 },
    { bbox: [-81, -9, -79.5, -7], name: t('the dry low part', 'Köppen B, model elevation below 1500 m', 'la parte baja y seca'), n_cells: 9 },
  ],
  text: t(
    'This box mixes different kinds of places. Their changes can cancel out.',
    'Mixed (rules met: elevation, rain). Averaging across regimes can cancel opposite trends. Rules are project heuristics (concept after Hosking & Wallis 1993), not literature thresholds.',
    'Este cuadro mezcla distintos tipos de lugar. Sus cambios pueden anularse.',
  ),
}
const ONE: Homogeneity = {
  ...base, kind: 'one_kind', n_cells: 100, precip_min: 2.18, precip_max: 2.66, elev_min: 223, elev_max: 506, t2m_min: 5, t2m_max: 8,
  climate_groups: { D: 100 }, reasons: [], suggestions: [],
  text: t('This box is one kind of place.', 'One kind of place: none of the four mixing rules applies. Rules are project heuristics.', 'Este cuadro es un solo tipo de lugar.'),
}
const SPOT: Homogeneity = {
  kind: 'single_spot', n_cells: 1, reasons: [], suggestions: [], climate_groups: {}, precip_min: null, precip_max: null, t2m_min: null, t2m_max: null, elev_min: null, elev_max: null,
  text: t('This is one map square. We can\'t see differences inside it.', 'Single grid cell, so no mixing inside the box is possible.', 'Esto es un solo cuadrado del mapa. No vemos diferencias dentro de él.'),
}

const terms = [
  { id: 'mixed_place', term: t('mixed place', 'mixed region'), definition: t('A box with very different places.', 'Cells differ strongly.') },
]

function show(h: Homogeneity | null | undefined, view: 'simple' | 'scientific' = 'simple', go = vi.fn(), canTry = true) {
  render(
    <ViewProvider initial={view}>
      <GlossaryProvider terms={terms as never}>
        <HomogeneityPanel homogeneity={h} route={{ screen: 'shortlist', theme: 'water', place: 'box:-81,-9,-77,-5', start: '2003-01' }} go={go} canTry={canTry} />
      </GlossaryProvider>
    </ViewProvider>,
  )
  return go
}

afterEach(() => setLang('en'))

describe('HomogeneityPanel (Simple view)', () => {
  it('says "Mixed place" with one short sentence and a button per suggested part', () => {
    show(MIXED)
    expect(screen.getByRole('region', { name: 'Is this one kind of place?' })).toBeInTheDocument()
    expect(screen.getByText('Mixed place')).toBeInTheDocument()
    expect(screen.getByText('This box mixes different kinds of places. Their changes can cancel out.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try just the high, cool part' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try just the dry low part' })).toBeInTheDocument()
    expect(screen.queryByText(/project heuristic/)).toBeNull()
    expect(screen.queryByText('Grid cells')).toBeNull() // numbers belong to the Scientific view
  })

  it('the suggestion button opens the shortlist for that box, same question, no old years', async () => {
    const go = show(MIXED)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try just the dry low part' }))
    expect(go).toHaveBeenCalledWith({ screen: 'shortlist', theme: 'water', place: 'box:-81,-9,-79.5,-7' })
  })

  it('no live service (static site): no "Try just" buttons that would lead to an error', () => {
    show(MIXED, 'simple', vi.fn(), false)
    expect(screen.getByText('Mixed place')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Try just/ })).toBeNull()
  })

  it('keeps the reasons behind "Tell me more"', () => {
    show(MIXED)
    const more = screen.getByText('Tell me more').closest('details')!
    expect(more).not.toHaveAttribute('open')
    expect(within(more).getByText('Some parts get much more rain than others.')).toBeInTheDocument()
  })

  it('one kind is a quiet line with no buttons; one spot too', () => {
    show(ONE)
    expect(screen.getByText('One kind of place')).toBeInTheDocument()
    expect(screen.getByText('This box is one kind of place.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('single spot', () => {
    show(SPOT)
    expect(screen.getByText('One map square')).toBeInTheDocument()
    expect(screen.getByText('This is one map square. We can\'t see differences inside it.')).toBeInTheDocument()
  })

  it('shows nothing when the check could not be made', () => {
    show(null)
    show(undefined)
    expect(document.querySelector('.homog')).toBeNull()
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('has no banned words, short sentences, no digits in everything a child reads', () => {
    for (const h of [MIXED, ONE, SPOT]) {
      const strings = [h.text.simple, ...h.reasons.map((r) => r.text.simple), ...h.suggestions.map((s) => `Try just ${s.name.simple}`)]
      for (const s of strings) {
        expect(bannedIn(s), s).toEqual([])
        expect(s, s).not.toMatch(/\d/)
        for (const sentence of s.split(/(?<=\.)\s+/)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(12)
      }
    }
  })
})

describe('HomogeneityPanel (Scientific view)', () => {
  it('shows the numbers, the rule label and the reasons', () => {
    show(MIXED, 'scientific')
    expect(screen.getByText('rule: project heuristic', { exact: false })).toBeInTheDocument()
    const facts = document.querySelector('.homog-facts')!
    expect(facts).toHaveTextContent('Grid cells54')
    expect(facts).toHaveTextContent('0.04–2.42 mm/day')
    expect(facts).toHaveTextContent('0–3,843 m')
    expect(facts).toHaveTextContent('8.4–25.5 °C')
    expect(facts).toHaveTextContent('A 5 · B 42 · C 7')
    expect(screen.getByText('Model elevation range 3843 m (above 1000 m).')).toBeInTheDocument()
    expect(screen.getByText(/Hosking & Wallis 1993/)).toBeInTheDocument()
  })

  it('names each part by its facts and its cell count', async () => {
    const go = show(MIXED, 'scientific')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Use only Köppen C, model elevation 1500 m or more (12 cells)' }))
    expect(go).toHaveBeenCalledWith({ screen: 'shortlist', theme: 'water', place: 'box:-78.12,-8.25,-76.56,-6.25' })
  })
})

describe('HomogeneityPanel (Spanish)', () => {
  it('uses the Spanish words and the backend Spanish text', () => {
    setLang('es')
    show(MIXED)
    expect(screen.getByText('Lugar mezclado')).toBeInTheDocument()
    expect(screen.getByText('Este cuadro mezcla distintos tipos de lugar. Sus cambios pueden anularse.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Probar solo la parte alta y fresca' })).toBeInTheDocument()
  })

  it('has a Spanish string for every key the panel uses', () => {
    for (const k of ['homog.aria', 'homog.mixed.title', 'homog.one.title', 'homog.spot.title', 'homog.why', 'homog.try', 'homog.try.sci', 'homog.rule.sci', 'homog.cells.sci', 'homog.rain.sci', 'homog.unit.rain.sci', 'homog.elev.sci', 'homog.t2m.sci', 'homog.groups.sci']) {
      expect(es[k], k).toBeTruthy()
    }
  })
})
