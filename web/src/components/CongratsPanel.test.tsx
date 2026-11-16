import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import type { DataClient } from '../data/client'
import { bannedIn } from '../lib/copy.test'
import { allKeys } from '../i18n/extractKeys'
import { loadFinds } from '../lib/myFinds'
import { setLang } from '../i18n'

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'))
const cat = (n: string) => read(`public/data/catalog/${n}.json`)
const fixture = (n: string) => read(`src/fixtures/${n}.json`)
const client: DataClient = {
  regions: async () => cat('regions'),
  themes: async () => cat('themes'),
  variables: async () => cat('variables'),
  glossary: async () => cat('glossary'),
  scan: async (r, t) => read(`public/data/results/${r}/scan_${t}.json`),
  result: async (_r, v, s) => fixture(s ? `${v}__${s}` : v === 'gpm_precip' ? 'gpm_precip_cant_tell' : v),
  analyze: async (_r, v) => fixture(v),
  customScan: async () => { throw new Error('unused') },
  customResult: async () => { throw new Error('unused') },
}

beforeEach(() => {
  localStorage.clear()
  setLang('en')
})

const open = (hash: string) => {
  window.location.hash = hash
  return render(<App client={client} />)
}
const SURE = '#/variable?region=cajamarca_west&theme=water&variable=airs_rh_surf_day'

describe('CongratsPanel', () => {
  it('shows for "Sure it\'s real" only, with Simple words and no banned terms', async () => {
    const { container } = open(SURE)
    const panel = await screen.findByTestId('congrats')
    expect(within(panel).getByRole('heading', { name: 'You found a real change!' })).toBeInTheDocument()
    expect(panel).toHaveTextContent('Detectives check twice. Two checks agree.')
    expect(within(panel).getByRole('button', { name: 'Save to my detective notebook' })).toBeInTheDocument()
    expect(within(panel).getByText('Finds saved: 0')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'NASA Earthdata Forum' })).toHaveAttribute('href', 'https://forum.earthdata.nasa.gov/')
    expect(bannedIn(panel.textContent ?? '')).toEqual([])
    expect(bannedIn(container.textContent ?? '')).toEqual([])
  })

  it('does not show for Too soon to tell', async () => {
    open(`${SURE}&season=dry`)
    await screen.findByText('Too soon to tell')
    expect(screen.queryByTestId('congrats')).toBeNull()
  })

  it('does not show when we cannot tell', async () => {
    open('#/variable?region=cajamarca_west&theme=water&variable=gpm_precip')
    await screen.findByText("We can't tell here")
    expect(screen.queryByTestId('congrats')).toBeNull()
  })

  it('saves to the notebook, lists it there, and removes it', async () => {
    const user = userEvent.setup()
    open(SURE)
    const panel = await screen.findByTestId('congrats')
    await user.click(within(panel).getByRole('button', { name: 'Save to my detective notebook' }))
    expect(within(panel).getByRole('button', { name: 'Saved' })).toBeInTheDocument()
    expect(within(panel).getByText('Finds saved: 1')).toBeInTheDocument()
    expect(loadFinds()).toHaveLength(1)

    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: /My notebook/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'My detective notebook' })).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'My detective notebook' })
    expect(within(list).getByText('Afternoon humidity')).toBeInTheDocument()
    expect(within(list).getByRole('link', { name: 'Open this find' })).toHaveAttribute('href', '#/variable?region=cajamarca_west&theme=water&variable=airs_rh_surf_day')
    expect(bannedIn(list.textContent ?? '')).toEqual([])
    await user.click(within(list).getByRole('button', { name: /^Remove/ }))
    expect(await screen.findByText(/Nothing here yet/)).toBeInTheDocument()
    expect(loadFinds()).toHaveLength(0)
  })

  it('copies the report text', async () => {
    const user = userEvent.setup()
    let copied = ''
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (s: string) => { copied = s } } })
    open(SURE)
    await user.click(await screen.findByRole('button', { name: 'Copy report' }))
    await waitFor(() => expect(screen.getByText('Copied!')).toBeInTheDocument())
    expect(copied).toContain('What: Afternoon humidity')
    expect(copied).toContain('Dataset: AIRS3STM v7.0 · RelHumSurf_A')
    expect(copied).toContain('#/variable?region=cajamarca_west&theme=water&variable=airs_rh_surf_day')
  })

  it('Scientific view says what the two checks were', async () => {
    const user = userEvent.setup()
    open(SURE)
    await screen.findByTestId('congrats')
    await user.click(screen.getByRole('button', { name: 'Scientific' }))
    const panel = await screen.findByTestId('congrats')
    expect(panel).toHaveTextContent('Trend detected')
    expect(panel).toHaveTextContent('Both persistence-aware tests agree at the 95% level.')
    expect(within(panel).getByRole('button', { name: 'Save to my detective notebook' })).toBeInTheDocument()
  })
})

describe('Sources: AI use', () => {
  it('discloses AI use and says NASA does not endorse it, in English and Spanish', async () => {
    open('#/sources')
    expect(await screen.findByRole('heading', { name: 'How we used AI' })).toBeInTheDocument()
    expect(screen.getByText(/Claude Code by Anthropic/)).toBeInTheDocument()
    expect(screen.getByText(/uses the Claude API/)).toBeInTheDocument()
    expect(screen.getByText('This is a NASA Space Apps Challenge project. It is not endorsed by NASA.')).toBeInTheDocument()
    await act(async () => setLang('es'))
    expect(await screen.findByRole('heading', { name: 'Cómo usamos la IA' })).toBeInTheDocument()
    expect(screen.getByText(/La NASA no lo respalda/)).toBeInTheDocument()
  })
})

describe('finds copy', () => {
  it('has no banned words in the English Simple strings', () => {
    const uses = [...allKeys().values()].filter((u) => /^(finds|sources\.ai)\./.test(u.key) && !/\.(sci|scientific)$/.test(u.key) && !u.key.startsWith('finds.report.') && u.en)
    expect(uses.length).toBeGreaterThan(20)
    const hits = uses.flatMap((u) => bannedIn(u.en!).map((b) => `${u.key}: ${b}`))
    expect(hits).toEqual([])
  })
})
