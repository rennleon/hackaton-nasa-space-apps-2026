import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { LiveDataUnavailable, type DataClient } from '../data/client'
import { bannedIn } from '../lib/copy.test'
import type { ScanResult } from '../types/contract'

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'))
const cat = (n: string) => read(`public/data/catalog/${n}.json`)
const scanFile = (r: string, t: string): ScanResult => read(`public/data/results/${r}/scan_${t}.json`)

/** The saved scan, upgraded to the v2 shape: dots for the sparkline, an instrument, one second opinion, a place line. */
function v2Scan(): ScanResult {
  const s = scanFile('cajamarca_west', 'water')
  const years = Array.from({ length: 12 }, (_, i) => ({ year: 2003 + i, anomaly: i * 0.5 + (i % 2), in_window: true }))
  return {
    ...s,
    place: { ar6_region_code: null, ar6_region_name: null, climate_group: null, climate_code: null, high_up: true, elevation_m_model: null, wet_months: [], dry_months: [], text: { simple: 'Your place is high up and fairly dry.', scientific: 'Highland, dry.' } },
    entries: s.entries.map((e) =>
      e.variable_id === 'airs_rh_surf_day'
        ? {
            ...e, instrument_id: 'airs', yearly_series: years,
            cross_check: { against: 'power_rh2m', slope_per_decade: 1, same_sign: true, significant: true, outcome: 'agree' as const, against_instrument: 'merra2', window_start: null, window_end: null, text: null },
          }
        : e,
    ),
  }
}

const base: DataClient = {
  regions: async () => cat('regions'),
  themes: async () => cat('themes'),
  variables: async () => cat('variables'),
  glossary: async () => cat('glossary'),
  scan: async (r, t) => scanFile(r, t),
  result: async () => { throw new Error('unused') },
  analyze: async () => { throw new Error('unused') },
  customScan: async () => v2Scan(),
  customResult: async () => { throw new Error('unused') },
}

beforeEach(() => localStorage.clear())
const open = (hash: string, client: DataClient = base) => {
  window.location.hash = hash
  return render(<App client={client} />)
}

describe('Findings screen', () => {
  it('leads with the summary, shows results as cards, collapses the rest, hides internal labels', async () => {
    const { container } = open('#/shortlist?region=cajamarca_west&theme=water', { ...base, scan: async () => v2Scan() })
    expect(await screen.findByText(/\d of \d measurements? shows? a clear change\./)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Cajamarca' })).toBeInTheDocument()
    expect(screen.getByText('Your place is high up and fairly dry.')).toBeInTheDocument()
    // results first
    const cards = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(cards[0]).toBe('Night-time humidity')
    // one verdict chip per card, and the second opinion
    expect(screen.getAllByText("Sure it's real").length).toBeGreaterThan(0)
    expect(screen.getByText('Two instruments agree')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /One dot for each year, 2003 to 2014/ })).toBeInTheDocument()
    expect(screen.getAllByText('Satellite · AIRS').length).toBeGreaterThan(0)
    // unavailable ones sit in one collapsed row
    const row = screen.getByText('Not available for this place (6)').closest('details')!
    expect(row).not.toHaveAttribute('open')
    expect(within(row).getAllByRole('listitem')).toHaveLength(6)
    expect(screen.queryByRole('button', { name: 'Open Evaporation' })).toBeNull()
    expect(container.textContent).not.toMatch(/test box|stage 1|Only variables that declare|target|driver|cross-check|v0\.1/)
    expect(bannedIn(container.textContent ?? '')).toEqual([])
  })

  it('a whole card opens the result', async () => {
    const user = userEvent.setup()
    open('#/shortlist?region=cajamarca_west&theme=water')
    await user.click(await screen.findByRole('button', { name: 'Open Afternoon humidity' }))
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/variable\?.*variable=airs_rh_surf_day/))
  })

  it('shows the loading state, then the cards', async () => {
    let release: (s: ScanResult) => void = () => {}
    const slow = { ...base, scan: () => new Promise<ScanResult>((r) => { release = r }) }
    open('#/shortlist?region=cajamarca_west&theme=water', slow)
    expect(await screen.findByText('Asking NASA for the data…')).toBeInTheDocument()
    release(v2Scan())
    await screen.findByText(/measurements? shows? a clear change/)
    expect(screen.queryByText('Asking NASA for the data…')).toBeNull()
  })

  it('says it kindly and retries when NASA cannot be reached', async () => {
    const user = userEvent.setup()
    let calls = 0
    const flaky = { ...base, customScan: async () => { if (calls++ === 0) throw new LiveDataUnavailable(); return v2Scan() } }
    open('#/shortlist?place=pt:-7.16,-78.51&theme=water', flaky)
    expect(await screen.findByText("We couldn't reach NASA right now. Try again.")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(/measurements? shows? a clear change/)).toBeInTheDocument()
    expect(calls).toBe(2)
  })

  it('empty state when nothing is available, with the reasons open', async () => {
    const user = userEvent.setup()
    open('#/shortlist?region=wisconsin&theme=air')
    expect(await screen.findByText('NASA has no data for this place and question yet.')).toBeInTheDocument()
    expect(screen.getByText(/Not available for this place \(6\)/).closest('details')).toHaveAttribute('open')
    await user.click(screen.getByRole('button', { name: 'Heat' }))
    await waitFor(() => expect(window.location.hash).toContain('theme=heat'))
  })

  it('Scientific keeps the numbers and the full source tag', async () => {
    const user = userEvent.setup()
    open('#/shortlist?region=cajamarca_west&theme=water')
    await screen.findByText(/shows? a clear change/)
    await user.click(screen.getByRole('button', { name: 'Scientific' }))
    expect(await screen.findAllByText('AIRS · Aqua satellite · since 2002')).not.toHaveLength(0)
    expect(screen.getAllByText('MERRA-2 computer model · via NASA POWER').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/adj\. p = /).length).toBeGreaterThan(0)
  })
})

describe('Where our data comes from', () => {
  it('lists every instrument with the variables that use it, linked from the header', async () => {
    const user = userEvent.setup()
    open('#/')
    const links = await screen.findAllByRole('link', { name: 'Where our data comes from' })
    expect(links).toHaveLength(2) // header and footer
    await user.click(links[0])
    expect(await screen.findByRole('heading', { level: 1, name: 'Where our data comes from' })).toBeInTheDocument()
    const airs = screen.getByRole('heading', { level: 2, name: 'AIRS' }).closest('li')!
    expect(within(airs).getByText('Afternoon humidity')).toBeInTheDocument()
    expect(within(airs).getByText(/Rides on Aqua/)).toBeInTheDocument()
    expect(within(airs).getByText('Fresh from NASA when you ask')).toBeInTheDocument()
    expect(screen.getByText(/NASA POWER is a delivery service/)).toBeInTheDocument()
    expect(bannedIn(document.querySelector('.sources')!.textContent ?? '')).toEqual([])
  })
})
