import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen, waitFor } from '@testing-library/react'
import { ViewProvider } from '../context'
import type { AnalysisResult, Comparison } from '../types/contract'
import { VerdictGauge } from './VerdictGauge'
import { SourceTag } from './SourceTag'
import { TrustPanel } from './TrustPanel'

const base = JSON.parse(readFileSync('src/fixtures/airs_rh_surf_day.json', 'utf8')) as AnalysisResult
const instruments = JSON.parse(readFileSync('public/data/catalog/instruments.json', 'utf8'))
const wrap = (ui: React.ReactNode, view: 'simple' | 'scientific' = 'simple') => render(<ViewProvider initial={view}>{ui}</ViewProvider>)

afterEach(() => vi.unstubAllGlobals())

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

describe('SourceTag', () => {
  it('names the satellite instrument', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => instruments }))
    const v = { ...base.variable, instrument_id: 'airs', platform: 'Aqua', source_type: 'observed' as const }
    wrap(<SourceTag variable={v} />, 'scientific')
    await waitFor(() => expect(screen.getByText('AIRS · Aqua satellite · since 2002')).toBeInTheDocument())
  })
  it('never calls a model a satellite, and says "Computer model estimate" in Simple', async () => {
    const v = { ...base.variable, instrument_id: 'merra2', platform: null, delivered_by: 'NASA POWER', source_type: 'model' as const }
    const { container } = wrap(<SourceTag variable={v} />)
    await waitFor(() => expect(container.textContent).toMatch(/Computer model estimate/))
    expect(container.textContent).not.toMatch(/satellite/i)
    expect(container.textContent).toContain('via NASA POWER')
  })
})

describe('TrustPanel', () => {
  const t = (s: string) => ({ simple: s, scientific: s })
  const cc: Comparison = { against: 'airs_rh_surf_day', slope_per_decade: 1, same_sign: true, significant: true, outcome: 'agree', against_instrument: 'airs', window_start: '2003-01', window_end: '2021-12', text: t('Two instruments agree on the direction.') }
  const full: AnalysisResult = {
    ...base,
    robustness: { ...base.robustness, cross_check: cc },
    published: { statement: t('Regional assessments expect more humid air here.'), source: 'IPCC AR6 WGI', confidence: 'medium confidence', direction: 'up', agreement: 'agrees' },
    verdict: { ...base.verdict, notes: [t('Short record, but the change is bigger than typical.')] },
  }
  it('groups the checks and shows second opinion, published science and the notes', () => {
    wrap(<TrustPanel result={full} />)
    expect(screen.getByRole('heading', { name: 'Can we trust this?' })).toBeInTheDocument()
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
    const sel = { ...base.selection!, worth_investigating: false }
    const { container } = wrap(<TrustPanel result={{ ...base, selection: sel }} />)
    expect(container.textContent).toContain('Hard to spot with this record')
    expect(container.textContent).not.toMatch(/Not a good fit|stage 1/)
  })
})
