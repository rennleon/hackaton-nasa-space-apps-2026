import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import type { DataClient } from '../data/client'
import { bannedIn } from '../lib/copy.test'

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
})

const open = (hash: string) => {
  window.location.hash = hash
  return render(<App client={client} />)
}

describe('Variable view, Simple', () => {
  it('leads with the answer, shows the meter, no banned words anywhere', async () => {
    const { container } = open('#/variable?region=cajamarca_west&theme=water&variable=airs_rh_surf_day')
    const h = await screen.findByRole('heading', { level: 2, name: /afternoons are getting more humid/i })
    expect(h).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'How sure are we?' })).toBeInTheDocument()
    expect(screen.getByText("Sure it's real").closest('li')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText(/In 2002: about 65/)).toBeInTheDocument()
    expect(screen.getByText('Tell me more: can we trust this?')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/test box|stage 1/i)
    const text = container.textContent ?? ''
    expect(bannedIn(text)).toEqual([])
  })

  it('too soon: shows the years-to-watch sentence', async () => {
    const { container } = open('#/variable?region=cajamarca_west&theme=water&variable=airs_rh_surf_day&season=dry')
    expect(await screen.findByText('We need to watch for about 30 more years.')).toBeInTheDocument()
    expect(screen.getByText('Too soon to tell').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(bannedIn(container.textContent ?? '')).toEqual([])
  })

  it('cannot tell: distinct state', async () => {
    open('#/variable?region=cajamarca_west&theme=water&variable=gpm_precip')
    expect(await screen.findByText("We can't tell here")).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'How sure are we?' })).toBeNull()
  })

  it('Scientific view keeps the numbers', async () => {
    const user = userEvent.setup()
    open('#/variable?region=cajamarca_west&theme=water&variable=airs_rh_surf_day')
    await screen.findByRole('heading', { level: 2 })
    await user.click(screen.getByRole('button', { name: 'Scientific' }))
    await waitFor(() => expect(screen.getAllByText(/Sen's slope \+1\.48 %RH per decade/).length).toBeGreaterThan(0))
    expect(screen.getByText('Can we trust this? Evidence checks')).toBeInTheDocument()
    expect(screen.getByText(/Lag-1 autocorrelation/)).toBeInTheDocument()
    expect(screen.getAllByText(/MDT/).length).toBeGreaterThan(0)
  })
})

describe('Shortlist, Simple', () => {
  it('shows definition, why line, compact meter and the common window', async () => {
    const { container } = open('#/shortlist?region=cajamarca_west&theme=water')
    expect(await screen.findByText('We compare every measurement over the same years: 2002 to 2021.')).toBeInTheDocument()
    expect(screen.queryByText('Recommended')).toBeNull()
    expect(container.textContent).not.toMatch(/test box|stage 1|Worth a closer look|Not a good fit/)
    expect(container.textContent).not.toMatch(/AIRS3STM|p = /)
  })
})
