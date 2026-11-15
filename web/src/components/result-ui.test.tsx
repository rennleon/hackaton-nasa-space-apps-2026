import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { ViewProvider } from '../context'
import type { AnalysisResult, Comparison } from '../types/contract'
import { VerdictGauge } from './VerdictGauge'
import { TrustPanel } from './TrustPanel'

const base = JSON.parse(readFileSync('src/fixtures/airs_rh_surf_day.json', 'utf8')) as AnalysisResult
const wrap = (ui: React.ReactNode, view: 'simple' | 'scientific' = 'simple') => render(<ViewProvider initial={view}>{ui}</ViewProvider>)

describe('VerdictGauge', () => {
  it('has one marker, icon plus word on every step, and flags only the active step', () => {
    const { container } = wrap(<VerdictGauge certainty="maybe" />)
    expect(container.querySelectorAll('.gauge-marker')).toHaveLength(1)
    expect(screen.getByRole('list', { name: 'How sure are we?' })).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['Too soon to tell', 'Maybe, not sure yet', "Sure it's real"])
    items.forEach((li) => expect(li.querySelector('svg')).not.toBeNull())
    expect(items.filter((li) => li.getAttribute('aria-current') === 'step')).toHaveLength(1)
    expect(screen.getByText('Maybe, not sure yet').closest('li')).toHaveAttribute('aria-current', 'step')
  })
  it("renders \"We can't tell here\" as a separate dashed state without the steps", () => {
    const { container } = wrap(<VerdictGauge certainty="cant_tell" />)
    expect(screen.getByText("We can't tell here")).toBeInTheDocument()
    expect(container.querySelector('.gauge-cant')).not.toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
  })
})

describe('TrustPanel', () => {
  const t = (s: string) => ({ simple: s, scientific: s })
  const cc: Comparison = { against: 'airs_rh_surf_day', slope_per_decade: 1, same_sign: true, significant: true, outcome: 'agree', against_instrument: 'airs', window_start: '2003-01', window_end: '2021-12', text: t('Two instruments agree on the direction.') }
  const full: AnalysisResult = {
    ...base,
    robustness: { ...base.robustness, cross_check: cc },
    published: { statement: t('Regional assessments expect more humid air here.'), source: 'IPCC AR6 WGI', confidence: 'medium confidence', confidence_es: null, direction: 'up', agreement: 'agrees', ar6_region: 'NWS', scope: 'mean', partial: false },
    verdict: { ...base.verdict, notes: [t('Short record, but the change is bigger than typical.')] },
  }
  it('groups the checks and shows second opinion, published science and the notes', () => {
    wrap(<TrustPanel result={full} />)
    expect(screen.getByRole('heading', { name: 'Tell me more: can we trust this?' })).toBeInTheDocument()
    expect(screen.getByText('Is the data good?')).toBeInTheDocument()
    expect(screen.getByText('Is the record long enough?')).toBeInTheDocument()
    expect(screen.getByText(/Two instruments agree on the direction/)).toBeInTheDocument()
    expect(screen.getByText('This matches what scientists found.')).toBeInTheDocument()
    expect(screen.getByText('Regional assessments expect more humid air here.')).toBeInTheDocument()
    expect(screen.getByText(/medium confidence/)).toBeInTheDocument()
    expect(screen.getByText('Short record, but the change is bigger than typical.')).toBeInTheDocument()
  })
  it('hides the published and second-opinion rows when there is nothing to show', () => {
    wrap(<TrustPanel result={{ ...base, published: null, robustness: { ...base.robustness, cross_check: null } }} />)
    expect(screen.queryByText('What scientists found here')).toBeNull()
    expect(screen.queryByText('Does another instrument agree?')).toBeNull()
  })
  it('uses the new wording instead of "Not a good fit here"', () => {
    const checks = [...base.selection!.checks.filter((q) => q.code !== 'detectability'), { code: 'detectability' as const, status: 'fail' as const, detail: t('This record can only spot big changes.') }]
    const sel = { ...base.selection!, worth_investigating: false, checks }
    const { container } = wrap(<TrustPanel result={{ ...base, selection: sel }} />)
    expect(container.textContent).toContain('Hard to spot with this record')
    expect(container.textContent).not.toMatch(/Not a good fit|stage 1/)
  })
  it('shows no "Recommended" tag, and no "Hard to spot" tag when detectability passed', () => {
    const { container } = wrap(<TrustPanel result={{ ...base, selection: { ...base.selection!, worth_investigating: true } }} />)
    expect(container.textContent).not.toMatch(/Recommended|Hard to spot/)
  })
  it('Simple: collapsed behind "Tell me more"; Scientific: open', () => {
    const a = wrap(<TrustPanel result={base} />)
    expect(a.container.querySelector('details')).not.toHaveAttribute('open')
    a.unmount()
    const b = wrap(<TrustPanel result={base} />, 'scientific')
    expect(b.container.querySelector('details')).toHaveAttribute('open')
  })
  it('Simple: a failed detectability check reads as a note, a failed gate keeps the red cross', () => {
    const checks = [...base.selection!.checks.filter((q) => q.code !== 'detectability'), { code: 'detectability' as const, status: 'fail' as const, detail: t('Detect check text.') }]
    const gates = { ...base.gates, checks: [...base.gates.checks, { code: 'custom_gate', passed: false, detail: t('Gate failed text.') }] }
    const { container } = wrap(<TrustPanel result={{ ...base, selection: { ...base.selection!, checks }, gates }} />)
    const row = (txt: string) => screen.getByText(txt).closest('li')!
    expect(row('Detect check text.')).toHaveClass('trust-info')
    expect(row('Detect check text.').textContent).toMatch(/Note:/)
    expect(row('Gate failed text.')).toHaveClass('trust-fail')
    expect(container.querySelectorAll('.trust-row svg').length).toBe(container.querySelectorAll('.trust-row').length)
  })
})

describe('Charts caption: why grey rings were left out', () => {
  // Plotly is lazy-loaded; the caption renders without it.
  const caption = () => document.querySelector('.chart-main figcaption p')?.textContent ?? ''
  it('names satellite drift for a drift cut', async () => {
    const { Charts } = await import('./Charts')
    wrap(<Charts result={base} />)
    expect(caption()).toContain('The satellite started passing over at a different time.')
  })
  it('names the shared list years when opened from the list', async () => {
    const { Charts } = await import('./Charts')
    wrap(<Charts result={{ ...base, window: { ...base.window!, reason: 'user' } }} fromList />)
    expect(caption()).toContain('The list uses the same years for every measure.')
  })
  it('names the chosen years for a user period, and says nothing when no year is left out', async () => {
    const { Charts } = await import('./Charts')
    const { unmount } = wrap(<Charts result={{ ...base, window: { ...base.window!, reason: 'user' } }} />)
    expect(caption()).toContain('Grey rings are years outside the years you chose.')
    unmount()
    const all = { ...base, yearly_series: (base.yearly_series ?? []).map((p) => ({ ...p, in_window: true })) }
    wrap(<Charts result={all} />)
    expect(caption()).not.toContain('Grey rings')
  })
})
