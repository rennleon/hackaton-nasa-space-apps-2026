import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { LiveDataUnavailable, type DataClient } from '../data/client'
import { bannedIn } from '../lib/copy.test'

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'))
const cat = (n: string) => read(`public/data/catalog/${n}.json`)
const scanFixture = () => {
  const s = read('public/data/results/cajamarca_west/scan_water.json')
  return { ...s, region: { id: 'custom_pt_-7.16_-78.51', name: { simple: 'Your place', scientific: 'Point -7.16, -78.51' } } }
}
const base: DataClient = {
  regions: async () => cat('regions'),
  themes: async () => cat('themes'),
  variables: async () => cat('variables'),
  glossary: async () => cat('glossary'),
  scan: async () => { throw new Error('unused') },
  result: async () => { throw new Error('unused') },
  analyze: async () => { throw new Error('unused') },
  customScan: async () => scanFixture(),
  customResult: async () => { throw new Error('unused') },
}

beforeEach(() => localStorage.clear())
const open = (hash: string, client: DataClient = base) => {
  window.location.hash = hash
  return render(<App client={client} />)
}

describe('custom place', () => {
  it('shows the shortlist in Simple view with no banned words, no season controls, and the credit', async () => {
    const { container } = open('#/shortlist?place=pt:-7.16,-78.51&theme=water')
    expect(await screen.findByText('Data: NASA POWER (MERRA-2-based)')).toBeInTheDocument()
    expect(screen.getAllByText('Your place').length).toBeGreaterThan(0)
    expect(screen.queryByText('Only one time of year')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Open / }).length).toBeGreaterThan(0)
    expect(bannedIn(container.textContent ?? '')).toEqual([])
  })

  it('says so kindly when the live API is unreachable', async () => {
    const down = { ...base, customScan: async () => { throw new LiveDataUnavailable() } }
    open('#/shortlist?place=pt:-7.16,-78.51&theme=water', down)
    expect(await screen.findByText("We couldn't reach NASA right now. Try again.")).toBeInTheDocument()
  })

  it('chooser: typing a too-big box is refused, a good box goes to the theme picker', async () => {
    const user = userEvent.setup()
    open('#/')
    await user.click(await screen.findByRole('button', { name: 'Draw a box' }))
    const side = (name: string, kind: 'Number' | 'Which') => screen.getByLabelText(new RegExp(`${name} side.*: ${kind}`))
    // Kids type sizes and pick a side: -80 is 80 West, -20 is 20 South, -70 is 70 West, -5 is 5 South.
    const fill = async (name: string, size: string, option: string) => {
      await user.clear(side(name, 'Number'))
      await user.type(side(name, 'Number'), size)
      await user.selectOptions(side(name, 'Which'), option)
    }
    await fill('West', '80', 'West')
    await fill('South', '20', 'South')
    await fill('East', '70', 'West')
    await fill('North', '5', 'South')
    expect(screen.getByRole('alert')).toHaveTextContent('That area is too big. Pick a smaller one.')
    expect(screen.getByRole('button', { name: 'Use this place' })).toBeDisabled()
    await fill('South', '12', 'South')
    await user.click(screen.getByRole('button', { name: 'Use this place' }))
    await waitFor(() => expect(window.location.hash).toBe('#/theme?place=box:-80,-12,-70,-5'))
  })
})
