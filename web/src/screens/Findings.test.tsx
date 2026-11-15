import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { LiveDataUnavailable, type DataClient } from '../data/client'
import { bannedIn } from '../lib/copy.test'
import type { ScanResult } from '../types/contract'
import { splitEntries } from '../lib/findings'

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'))
const cat = (n: string) => read(`public/data/catalog/${n}.json`)
const scanFile = (r: string, t: string): ScanResult => read(`public/data/results/${r}/scan_${t}.json`)

/** The saved scan, upgraded to the v2 shape: dots for the sparkline, an instrument, one second opinion, a place line. */
function v2Scan(): ScanResult {
  const s = scanFile('cajamarca_west', 'water')
  const years = Array.from({ length: 12 }, (_, i) => ({ year: 2003 + i, anomaly: i * 0.5 + (i % 2), in_window: true }))
  return {
    ...s,
    place: { ar6_region_code: null, ar6_region_name: null, climate_group: null, climate_code: null, high_up: true, elevation_m_model: null, wet_months: [], dry_months: [], text: { simple: 'Your place is high up and fairly dry.', scientific: 'Highland, dry.' }, homogeneity: null },
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
    // the first card is the first entry with a result in the saved scan (the order follows the data)
    const withResult = v2Scan().entries.filter((e) => (e.availability ?? 'available') === 'available' && e.shortlist_label !== 'cant_tell').map((e) => e.name.simple)
    expect(withResult).toContain(cards[0])
    // one verdict chip per card, and the second opinion
    expect(screen.getAllByText("Sure it's real").length).toBeGreaterThan(0)
    expect(screen.getAllByText('Two instruments agree').length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: /One dot for each year, 2003 to 2014/ })).toBeInTheDocument()
    expect(screen.getAllByText(/^Measured by/).length).toBeGreaterThan(0)
    expect(container.textContent).toContain('Measured by AIRS (Aqua satellite)')
    // the legend names each instrument once, with its kind, and links to the sources page
    const legend = container.querySelector('.legend')!
    expect(legend.querySelector('.legend-label')?.textContent).toMatch(/^Instruments.* in this list:$/)
    const names = [...legend.querySelectorAll('li')].map((li) => li.textContent)
    expect(names).toContain('AIRS (satellite)')
    expect(new Set(names).size).toBe(names.length)
    legend.querySelectorAll('li a').forEach((a) => expect(a.getAttribute('href')).toMatch(/^#\/sources\?instrument=/))
    // the second opinion says it is the same thing seen by a different instrument
    expect(screen.getByText('Same thing, measured by a different instrument: MERRA-2')).toBeInTheDocument()
    // unavailable ones sit in one collapsed row
    const { unavailable } = splitEntries(v2Scan().entries)
    if (unavailable.length > 0) {
      const row = screen.getByText(`Not available for this place (${unavailable.length})`).closest('details')!
      expect(row).not.toHaveAttribute('open')
      expect(within(row).getAllByRole('listitem')).toHaveLength(unavailable.length)
      expect(screen.queryByRole('button', { name: `Open ${unavailable[0].name.simple}` })).toBeNull()
    }
    expect(container.textContent).not.toMatch(/test box|stage 1|Only variables that declare|target|driver|cross-check|v0\.1/)
    expect(bannedIn(container.textContent ?? '')).toEqual([])
  })

  it('a whole card opens the result', async () => {
    const user = userEvent.setup()
    open('#/shortlist?region=cajamarca_west&theme=water')
    await user.click(await screen.findByRole('button', { name: 'Open Afternoon humidity' }))
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/variable\?.*variable=airs_rh_surf_day/))
  })

  it('a card opens the result on the same years it used (the shared window), so both give one answer', async () => {
    const user = userEvent.setup()
    const s = scanFile('cajamarca_west', 'water')
    const shared = { ...base, scan: async () => ({ ...s, common_window: true, window_start: '2002-09', window_end: '2021-12' }) }
    open('#/shortlist?region=cajamarca_west&theme=water', shared)
    await user.click(await screen.findByRole('button', { name: 'Open Afternoon humidity' }))
    await waitFor(() => expect(window.location.hash).toMatch(/start=2002-09&end=2021-12/))
  })

  it('shows the "one kind of place?" panel under the place text, and a part opens the shortlist for that box', async () => {
    const user = userEvent.setup()
    const t = (simple: string, scientific = simple) => ({ simple, scientific })
    const mixed = (): ScanResult => {
      const s = v2Scan()
      return {
        ...s,
        place: {
          ...s.place!,
          homogeneity: {
            kind: 'mixed', n_cells: 54, climate_groups: { B: 42, C: 7 }, precip_min: 0.04, precip_max: 2.42, t2m_min: 8.4, t2m_max: 25.5, elev_min: 0, elev_max: 3843,
            reasons: [{ code: 'rain', text: t('Some parts get much more rain than others.') }],
            suggestions: [{ bbox: [-78.12, -8.25, -76.56, -6.25], name: t('the high, cool part'), n_cells: 12 }],
            text: t('This box mixes different kinds of places. Their changes can cancel out.'),
          },
        },
      }
    }
    open('#/shortlist?region=cajamarca_west&theme=water', { ...base, scan: async () => mixed() })
    expect(await screen.findByText('Mixed place')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try just the high, cool part' }))
    await waitFor(() => expect(window.location.hash).toBe('#/shortlist?place=box:-78.12,-8.25,-76.56,-6.25&theme=water'))
  })

  it('with a season picked, a card does not hand over its all-months window', async () => {
    const user = userEvent.setup()
    const s = scanFile('cajamarca_west', 'water')
    const shared = { ...base, scan: async () => ({ ...s, common_window: true, window_start: '2002-09', window_end: '2021-12' }) }
    open('#/shortlist?region=cajamarca_west&theme=water&season=dry', shared)
    await user.click(await screen.findByRole('button', { name: 'Open Afternoon humidity' }))
    await waitFor(() => expect(window.location.hash).toMatch(/season=dry/))
    expect(window.location.hash).not.toMatch(/start=/)
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
    // a scan where no variable has a usable series here: the empty state follows the data
    const none = (): ScanResult => {
      const s = scanFile('wisconsin', 'air')
      return { ...s, entries: s.entries.map((e) => ({ ...e, availability: 'no_data_here' as const, slope_per_decade: null, shortlist_label: 'cant_tell' as const, verdict_label: 'cant_tell' as const })) }
    }
    open('#/shortlist?region=wisconsin&theme=air', { ...base, scan: async () => none() })
    expect(await screen.findByText('NASA has no data for this place and question yet.')).toBeInTheDocument()
    expect(screen.getByText(`Not available for this place (${none().entries.length})`).closest('details')).toHaveAttribute('open')
    await user.click(screen.getByRole('button', { name: 'Heat' }))
    await waitFor(() => expect(window.location.hash).toContain('theme=heat'))
  })

  it('Wisconsin air follows the saved data: what is available shows as cards, the rest is collapsed', async () => {
    const { available, unavailable } = splitEntries(scanFile('wisconsin', 'air').entries)
    open('#/shortlist?region=wisconsin&theme=air')
    if (available.length === 0) {
      expect(await screen.findByText('NASA has no data for this place and question yet.')).toBeInTheDocument()
    } else {
      expect(await screen.findByRole('button', { name: `Open ${available[0].name.simple}` })).toBeInTheDocument()
      expect(screen.queryByText('NASA has no data for this place and question yet.')).toBeNull()
    }
    if (unavailable.length > 0) expect(screen.getByText(`Not available for this place (${unavailable.length})`)).toBeInTheDocument()
  })

  it('the card follows the corrected shortlist label, not the single-variable verdict, and shows its years', async () => {
    const s = v2Scan()
    const target = s.entries.find((e) => e.variable_id === 'airs_rh_surf_day')!
    // significant on its own, but not after correcting for the many variables scanned
    const scan: ScanResult = {
      ...s,
      entries: s.entries.map((e) => (e === target ? { ...e, verdict_label: 'significant' as const, shortlist_label: 'possibly_changing' as const } : { ...e, shortlist_label: 'no_detectable_change' as const, verdict_label: 'no_detectable_change' as const })),
    }
    const total = splitEntries(scan.entries).available.length
    open('#/shortlist?region=cajamarca_west&theme=water', { ...base, scan: async () => scan })
    const card = (await screen.findByRole('button', { name: 'Open Afternoon humidity' })).closest('li')!
    expect(within(card).getByText('Maybe, not sure yet')).toBeInTheDocument()
    expect(within(card).queryByText("Sure it's real")).toBeNull()
    expect(within(card).getByText('Years used here: 2003 to 2014')).toBeInTheDocument()
    expect(screen.getByText(`We can't see a clear change yet. We looked at ${total} measurements.`)).toBeInTheDocument()
  })

  it('Scientific keeps the numbers and the full source tag', async () => {
    const user = userEvent.setup()
    open('#/shortlist?region=cajamarca_west&theme=water')
    await screen.findByText(/shows? a clear change/)
    await user.click(screen.getByRole('button', { name: 'Scientific' }))
    await waitFor(() => expect(document.querySelector('.source-compact')?.textContent).toMatch(/^Instrument: \S.+\((Aqua satellite|Terra satellite|satellites?|computer model)\)$/))
    expect(screen.getAllByText(/adj\. p = /).length).toBeGreaterThan(0)
  })
})

describe('Where our data comes from', () => {
  it('shows each instrument with its variables, linked from the header', async () => {
    const user = userEvent.setup()
    open('#/')
    const links = await screen.findAllByRole('link', { name: 'Where our data comes from' })
    expect(links).toHaveLength(2) // header and footer
    await user.click(links[0])
    expect(await screen.findByRole('heading', { level: 1, name: 'Where our data comes from' })).toBeInTheDocument()
    const airs = screen.getByRole('heading', { level: 2, name: 'Instrument: AIRS' }).closest('li')!
    expect(within(airs).getByText('Satellite: Aqua')).toBeInTheDocument()
    expect(within(airs).getByText('Variables from this instrument:')).toBeInTheDocument()
    expect(within(airs).getByRole('link', { name: 'Afternoon humidity' })).toHaveAttribute('href', expect.stringMatching(/^#\/variable\?.*variable=airs_rh_surf_day/))
    expect(within(airs).getByText(/Rides on Aqua|Since 2002/)).toBeInTheDocument()
    expect(within(airs).getByText('Fresh from NASA when you ask')).toBeInTheDocument()
    expect(screen.getByText(/NASA POWER is a delivery service/)).toBeInTheDocument()
    expect(screen.getByText(/is a tool that measures/)).toBeInTheDocument()
    expect(bannedIn(document.querySelector('.sources')!.textContent ?? '')).toEqual([])
  })

  it('puts every listed variable under exactly one instrument, and offline instruments under "Not used yet"', async () => {
    open('#/sources')
    await screen.findByRole('heading', { level: 1, name: 'Where our data comes from' })
    const variables = cat('variables') as { id: string; name: { simple: string }; listed?: boolean; source: { instrument_id: string } }[]
    const sections = [...document.querySelectorAll<HTMLElement>('.src-card')]
    for (const v of variables.filter((x) => x.listed !== false)) {
      const owners = sections.filter((sec) => sec.querySelector(`a[href*="variable=${v.id}"]`))
      expect(owners.map((o) => o.id), v.id).toEqual([`inst-${v.source.instrument_id}`])
    }
    // an instrument is a section heading, never a variable link
    expect(screen.getByRole('heading', { level: 2, name: 'Not used yet' })).toBeInTheDocument()
    for (const name of ['Instrument: MODIS', 'Instrument: MOPITT']) {
      const card = screen.getByRole('heading', { level: 3, name }).closest('li')!
      expect(card.querySelector('.src-vars')).toBeNull()
      expect(within(card).getByText(/cannot fetch it live/)).toBeInTheDocument()
    }
    expect(screen.getByRole('heading', { level: 2, name: 'Instrument: MERRA-2' }).closest('li')).toHaveTextContent('Computer model')
  })

  it('Scientific keeps the hierarchy', async () => {
    const user = userEvent.setup()
    open('#/sources')
    await screen.findByRole('heading', { level: 1, name: 'Where our data comes from' })
    await user.click(screen.getByRole('button', { name: 'Scientific' }))
    const airs = screen.getByRole('heading', { level: 2, name: 'Instrument: AIRS' }).closest('li')!
    expect(within(airs).getByRole('link', { name: /Surface relative humidity \(daytime/ })).toBeInTheDocument()
  })
})
