import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { ViewProvider } from '../context'
import type { AnalysisResult, StartYearPoint, StartYearSensitivity } from '../types/contract'
import { bannedIn } from '../lib/copy.test'
import { StartYears } from './StartYears'

const base = JSON.parse(readFileSync('src/fixtures/airs_rh_surf_day.json', 'utf8')) as AnalysisResult
const wrap = (ui: React.ReactNode, view: 'simple' | 'scientific' = 'simple') => render(<ViewProvider initial={view}>{ui}</ViewProvider>)

const pt = (year: number, slope: number, significant: boolean): StartYearPoint => ({
  start: `${year}-01`, years: 2024 - year, slope_per_decade: slope, ci_low: slope - 0.8, ci_high: slope + 0.8, significant,
})
const panel = (classification: StartYearSensitivity['classification'], slopes: [number, boolean][]): StartYearSensitivity => {
  const points = slopes.map(([v, sig], i) => pt(2003 + i, v, sig))
  return {
    points, n_starts: points.length, classification,
    n_same_sign: points.filter((p) => Math.sign(p.slope_per_decade) === 1).length,
    n_significant: points.filter((p) => p.significant).length,
    n_opposite_sure: points.filter((p) => p.significant && Math.sign(p.slope_per_decade) === -1).length,
  }
}
const FIX: Record<StartYearSensitivity['classification'], StartYearSensitivity> = {
  holds: panel('holds', [[1.5, true], [1.4, true], [1.6, true], [1.2, false]]),
  mostly: panel('mostly', [[1.5, true], [1.4, true], [1.1, false], [-0.2, false]]),
  unclear: panel('unclear', [[0.3, false], [0.1, false], [-0.2, false], [-0.4, false]]),
  depends: panel('depends', [[1.5, true], [0.4, false], [-0.9, false], [-1.2, true]]),
}
const withPanel = (c: keyof typeof FIX): AnalysisResult => ({ ...base, start_years: FIX[c] })

describe('StartYears (Simple)', () => {
  it.each([
    ['holds', 'We tried other start years. The change always points the same way.'],
    ['mostly', 'We tried other start years. The change mostly points the same way.'],
    ['unclear', 'Other start years point different ways. None of them is sure.'],
    ['depends', 'Some start years surely point the other way. Be careful.'],
  ] as const)('says one short sentence for "%s", with an icon', (c, sentence) => {
    const { container } = wrap(<StartYears result={withPanel(c)} />)
    expect(screen.getByRole('heading', { name: 'What if we start in another year?' })).toBeInTheDocument()
    expect(screen.getByText(sentence)).toBeInTheDocument()
    expect(container.querySelector('.sy-answer svg')).not.toBeNull()
  })

  it.each(['holds', 'mostly', 'unclear', 'depends'] as const)('uses no banned words for "%s" and shows no numbers in the chart', (c) => {
    const { container } = wrap(<StartYears result={withPanel(c)} />)
    expect(bannedIn(container.textContent ?? ''), container.textContent ?? '').toEqual([])
    // the chart axis in the Simple view is words, not numbers (no negatives, no decimals)
    expect(container.querySelector('.sy-chart')!.textContent).not.toMatch(/[-−]\d|\d\.\d/)
    // <= 12 words per sentence, read element by element (textContent runs neighbours together)
    for (const el of container.querySelectorAll('p, summary, h3, figcaption > span')) {
      for (const sentence of (el.textContent ?? '').split(/[.?!:]\s*/)) expect(sentence.split(/\s+/).filter(Boolean).length, sentence).toBeLessThanOrEqual(12)
    }
  })

  it('draws one dot per start year: filled when sure, a ring when not, never colour alone', () => {
    const { container } = wrap(<StartYears result={withPanel('mostly')} />)
    const dots = container.querySelectorAll('.sy-chart circle.sy-dot')
    expect(dots).toHaveLength(4)
    expect(container.querySelectorAll('.sy-chart circle.sy-sure')).toHaveLength(2)
    expect(container.querySelectorAll('.sy-chart circle.sy-unsure')).toHaveLength(2)
    expect(container.querySelectorAll('.sy-chart .sy-zero')).toHaveLength(1)
    expect(screen.getByText('Filled dot: we are sure.')).toBeInTheDocument()
    expect(screen.getByText('Ring: not sure yet.')).toBeInTheDocument()
    expect(container.querySelectorAll('.sy-ci')).toHaveLength(0) // 95% bars are Scientific-only
  })

  it('keeps the chart behind "Tell me more"', () => {
    const { container } = wrap(<StartYears result={withPanel('holds')} />)
    const d = container.querySelector('details')!
    expect(d.open).toBe(false)
    expect(d.querySelector('summary')!.textContent).toBe('Tell me more')
  })

  it('renders nothing without a panel or with a single start year', () => {
    expect(wrap(<StartYears result={{ ...base, start_years: null }} />).container.innerHTML).toBe('')
    const one = { ...FIX.holds, points: FIX.holds.points.slice(0, 1), n_starts: 1 }
    expect(wrap(<StartYears result={{ ...base, start_years: one }} />).container.innerHTML).toBe('')
    expect(wrap(<StartYears result={{ ...base, start_years: undefined } as unknown as AnalysisResult} />).container.innerHTML).toBe('')
  })
})

describe('StartYears (Scientific)', () => {
  it('shows the counts, the classification, 95% bars, the context-only note and the Liebmann et al. 2010 reference', () => {
    const { container } = wrap(<StartYears result={withPanel('depends')} />, 'scientific')
    expect(screen.getByRole('heading', { name: 'Start-year sensitivity' })).toBeInTheDocument()
    expect(screen.getByText(/2 of 4 start years \(2003 to 2006\) have the same sign as the declared window; 2 are significant/)).toBeInTheDocument()
    expect(screen.getByText(/Classification: depends/)).toBeInTheDocument()
    expect(container.querySelectorAll('.sy-ci')).toHaveLength(4)
    expect(container.querySelector('details')!.open).toBe(true)
    expect(screen.getByText(/Context only: the verdict above stays on the declared window/)).toBeInTheDocument()
    expect(container.textContent).toContain('Liebmann, B., Dole, R.M., Jones, C., Bladé, I., Allured, D. (2010)')
    expect(container.querySelector('a[href="https://doi.org/10.1175/2010BAMS3030.1"]')).not.toBeNull()
    expect(container.querySelector('.sy-chart')!.textContent).toContain('per 10 years')
  })
})
