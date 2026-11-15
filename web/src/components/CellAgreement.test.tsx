import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { ViewProvider } from '../context'
import { setLang } from '../i18n'
import { bannedIn } from '../lib/copy.test'
import type { AnalysisResult, CellAgreement } from '../types/contract'
import { TrustPanel } from './TrustPanel'

const base = JSON.parse(readFileSync('src/fixtures/airs_rh_surf_day.json', 'utf8')) as AnalysisResult
const withCells = (cell_agreement: CellAgreement | null): AnalysisResult => ({ ...base, robustness: { ...base.robustness, cell_agreement } })
const wrap = (r: AnalysisResult, view: 'simple' | 'scientific' = 'simple') =>
  render(
    <ViewProvider initial={view}>
      <TrustPanel result={r} />
    </ViewProvider>,
  )
const group = (c: HTMLElement) => c.querySelector('[data-demo="trust-cells"]') as HTMLElement | null

afterEach(() => setLang('en'))

describe('TrustPanel: do the parts of the box agree?', () => {
  it('shows nothing for a point or an unchecked box', () => {
    const { container } = wrap(withCells(null))
    expect(group(container)).toBeNull()
    expect(container.textContent).not.toMatch(/map squares in your box/)
  })

  it('agree, all the same way: icon, word and a short sentence', () => {
    const { container } = wrap(withCells({ n_cells: 12, n_same_sign: 12, n_opposite: 0, n_opposite_sure: 0, verdict: 'agree' }))
    const g = group(container)!
    expect(g.textContent).toContain('Do the parts of your box agree?')
    expect(g.textContent).toContain('We checked 12 map squares in your box. All go the same way.')
    const row = g.querySelector('li')!
    expect(row).toHaveClass('trust-pass')
    expect(row.querySelector('svg')).not.toBeNull()
    expect(row.textContent).toMatch(/Good:/)
  })

  it('agree with a few going the other way names the count', () => {
    const { container } = wrap(withCells({ n_cells: 12, n_same_sign: 11, n_opposite: 1, n_opposite_sure: 0, verdict: 'agree' }))
    expect(group(container)!.textContent).toContain('We checked 12 map squares in your box. 11 go the same way.')
  })

  it('mostly: a note, not a warning', () => {
    const { container } = wrap(withCells({ n_cells: 10, n_same_sign: 7, n_opposite: 3, n_opposite_sure: 0, verdict: 'mostly' }))
    const g = group(container)!
    expect(g.textContent).toContain('7 go the same way. A few do not.')
    expect(g.querySelector('li')).toHaveClass('trust-info')
  })

  it('mixed: says the parts may cancel out, and is a caution', () => {
    const { container } = wrap(withCells({ n_cells: 8, n_same_sign: 4, n_opposite: 4, n_opposite_sure: 2, verdict: 'mixed' }))
    const g = group(container)!
    expect(g.textContent).toContain('Some surely go the other way. They may cancel out.')
    expect(g.querySelector('li')).toHaveClass('trust-caution')
  })

  it('unclear: cells point different ways but none is sure, so no alarm', () => {
    const { container } = wrap(withCells({ n_cells: 21, n_same_sign: 9, n_opposite: 12, n_opposite_sure: 0, verdict: 'unclear' }))
    const g = group(container)!
    expect(g.textContent).toContain('They point different ways. None of them is sure.')
    expect(g.textContent).not.toMatch(/cancel/)
    expect(g.querySelector('li')).not.toHaveClass('trust-caution')
  })

  it('Simple copy: no banned words, whole numbers, at most 12 words per sentence', () => {
    for (const ca of [
      { n_cells: 12, n_same_sign: 12, n_opposite: 0, n_opposite_sure: 0, verdict: 'agree' },
      { n_cells: 12, n_same_sign: 11, n_opposite: 1, n_opposite_sure: 0, verdict: 'agree' },
      { n_cells: 10, n_same_sign: 7, n_opposite: 3, n_opposite_sure: 0, verdict: 'mostly' },
      { n_cells: 8, n_same_sign: 4, n_opposite: 4, n_opposite_sure: 2, verdict: 'mixed' },
      { n_cells: 21, n_same_sign: 9, n_opposite: 12, n_opposite_sure: 0, verdict: 'unclear' },
    ] as CellAgreement[]) {
      const { container, unmount } = wrap(withCells(ca))
      const text = group(container)!.querySelector('li')!.textContent!.replace(/^[^:]*: /, '')
      expect(bannedIn(text), text).toEqual([])
      expect(text).not.toMatch(/\d[.,]\d|%|-\d/)
      for (const sentence of text.split(/(?<=[.?!])\s+/)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(12)
      unmount()
    }
  })

  it('Scientific: counts, the FDR note and the Wilks reference', () => {
    const { container } = wrap(withCells({ n_cells: 8, n_same_sign: 5, n_opposite: 3, n_opposite_sure: 3, verdict: 'mixed' }), 'scientific')
    const g = group(container)!
    expect(g.textContent).toContain('Cells with the box\'s sign of slope: 5 of 8. Opposite: 3, of which 3 significant (Benjamini–Hochberg FDR, α = 0.05).')
    expect(g.textContent).toContain('Result: mixed.')
    expect(screen.getByRole('link', { name: /Wilks \(2016\)/ })).toHaveAttribute('href', 'https://doi.org/10.1175/BAMS-D-15-00267.1')
  })

  it('Spanish', () => {
    setLang('es')
    const { container } = wrap(withCells({ n_cells: 12, n_same_sign: 11, n_opposite: 1, n_opposite_sure: 0, verdict: 'agree' }))
    expect(group(container)!.textContent).toContain('Revisamos 12 cuadrados del mapa de tu zona. 11 van hacia el mismo lado.')
  })
})
