import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { ViewProvider } from '../context'
import type { AnalysisResult } from '../types/contract'
import { VerdictCard } from './Verdict'

const base = JSON.parse(readFileSync('src/fixtures/airs_rh_surf_day.json', 'utf8')) as AnalysisResult
const haze: AnalysisResult = {
  ...base,
  variable: { ...base.variable, units: { ...base.variable.units, display: 'AOD', simple: 'points on the haze scale', decimals: 3, kid_scale: 100, kid_label: 'on the haze scale', kid_label_es: null } },
  trend: { ...base.trend!, slope_per_decade: -0.011, ci_low: -0.0153, ci_high: -0.0047 },
}
const wrap = (r: AnalysisResult, view: 'simple' | 'scientific') =>
  render(
    <ViewProvider initial={view}>
      <VerdictCard result={r} />
    </ViewProvider>,
  )

describe('VerdictCard details', () => {
  it('Simple list says "points on the haze scale" for the trend line and the range', () => {
    const { container } = wrap(haze, 'simple')
    const text = container.textContent ?? ''
    expect(text).toContain('The trend line: −1.1 points on the haze scale every 10 years.')
    expect(text).toContain('Every 10 years it could change −1.5 to −0.5 points on the haze scale.')
  })
  it('Scientific 95% range keeps decimals + 1 in display units', () => {
    wrap(haze, 'scientific')
    expect(screen.getByText('[-0.0153, -0.0047] AOD/decade')).toBeInTheDocument()
  })
})

describe('VerdictCard fragile label', () => {
  const fragile: AnalysisResult = { ...base, verdict: { ...base.verdict, label: 'significant_fragile' } }
  it('Simple details do not claim "real" when a robustness check lowers the label', () => {
    const { container } = wrap(fragile, 'simple')
    const text = container.textContent ?? ''
    expect(text).toContain('Both checks found a change. But something below makes us careful.')
    expect(text).not.toContain('Both say this is real')
  })
  it('Scientific keeps the accurate line', () => {
    const { container } = wrap(fragile, 'scientific')
    expect(container.textContent).not.toContain('Both say this is real')
  })
})
