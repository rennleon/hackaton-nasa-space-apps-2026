import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataProvider, GlossaryProvider, ViewProvider } from '../context'
import type { DataClient } from '../data/client'
import fixture from '../fixtures/where_power_t2m.json'
import { WhereElse, goesBothWays, type WhereData } from './WhereElse'

const catalog = { regions: [], themes: [], variables: [] } as never

function mockFetch(body: unknown | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => (body === null ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => body })),
  )
}

function wrap(route: object, view: 'simple' | 'scientific' = 'simple', go = vi.fn(), customPlaces = true) {
  const client = { customPlaces } as unknown as DataClient
  render(
    <ViewProvider initial={view}>
      <GlossaryProvider terms={[]}>
        <DataProvider value={{ client, catalog }}>
          <WhereElse variableId="power_t2m" route={{ screen: 'variable', ...route }} go={go} />
        </DataProvider>
      </GlossaryProvider>
    </ViewProvider>,
  )
  return go
}

const data = fixture as unknown as WhereData
const withPlaces = (patch: (p: WhereData['places']) => void): WhereData => {
  const copy = structuredClone(data)
  patch(copy.places)
  return copy
}

afterEach(() => vi.unstubAllGlobals())

describe('WhereElse (Simple)', () => {
  it('shows the five places, one verdict chip each, and marks the current one', async () => {
    mockFetch(fixture)
    wrap({ region: 'wisconsin', variable: 'power_t2m' })
    expect(await screen.findByRole('heading', { name: 'Where else?' })).toBeInTheDocument()
    expect(screen.getByText('The same measurement in other places.')).toBeInTheDocument()
    for (const n of ['Cajamarca highlands', 'Wisconsin', 'Delhi, India', 'Manaus, Brazil', 'Tamanrasset, Algeria']) {
      expect(screen.getByText(n)).toBeInTheDocument()
    }
    expect(screen.getAllByText("Sure it's real")).toHaveLength(2)
    expect(screen.getByText('Maybe, not sure yet')).toBeInTheDocument()
    expect(screen.getByText('Too soon to tell')).toBeInTheDocument()
    expect(screen.getByText('No data here')).toBeInTheDocument()
    expect(screen.getAllByText('You are here')).toHaveLength(1)
    const here = screen.getByText('You are here').closest('[aria-current]')
    expect(here).toHaveTextContent('Wisconsin')
    expect(screen.getByText(/In 1985 a normal day was 24 degrees/)).toBeInTheDocument()
  })

  it('highlights an example point matched by its coordinates', async () => {
    mockFetch(fixture)
    wrap({ place: 'pt:28.61,77.21', variable: 'power_t2m' })
    await screen.findByText('Delhi, India')
    expect(screen.getByText('You are here').closest('[aria-current]')).toHaveTextContent('Delhi, India')
  })

  it('opens a region and an example point for the same variable', async () => {
    mockFetch(fixture)
    const user = userEvent.setup()
    const go = wrap({ region: 'wisconsin', variable: 'power_t2m', theme: 'heat' })
    await user.click(await screen.findByRole('button', { name: /Cajamarca highlands/ }))
    expect(go).toHaveBeenCalledWith({ screen: 'variable', region: 'cajamarca_highlands', variable: 'power_t2m', theme: 'heat' })
    await user.click(screen.getByRole('button', { name: /Delhi, India/ }))
    expect(go).toHaveBeenLastCalledWith({ screen: 'variable', place: 'pt:28.61,77.21', variable: 'power_t2m', theme: 'heat' })
  })

  it('does not say opposite when all sure places agree', async () => {
    mockFetch(fixture)
    wrap({ region: 'wisconsin', variable: 'power_t2m' })
    await screen.findByText('Delhi, India')
    expect(screen.queryByText('It goes up in some places and down in others.')).not.toBeInTheDocument()
  })

  it('shows the sentence when two sure places go opposite ways', async () => {
    mockFetch(withPlaces((p) => { p[2].direction = 'down' }))
    wrap({ region: 'wisconsin', variable: 'power_t2m' })
    expect(await screen.findByText('It goes up in some places and down in others.')).toBeInTheDocument()
  })

  it('does not say opposite when the other place is only a maybe', async () => {
    mockFetch(withPlaces((p) => { p[2].direction = 'down'; p[2].certainty = 'maybe' }))
    wrap({ region: 'wisconsin', variable: 'power_t2m' })
    await screen.findByText('Delhi, India')
    expect(screen.queryByText(/up in some places/)).not.toBeInTheDocument()
  })

  it('disables example points without the live service', async () => {
    mockFetch(fixture)
    wrap({ region: 'wisconsin', variable: 'power_t2m' }, 'simple', vi.fn(), false)
    await screen.findByText('Delhi, India')
    expect(screen.queryByRole('button', { name: /Delhi, India/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cajamarca highlands/ })).toBeInTheDocument()
  })

  it('renders nothing when the file is missing', async () => {
    mockFetch(null)
    wrap({ region: 'wisconsin', variable: 'power_t2m' })
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText('Where else?')).not.toBeInTheDocument()
  })
})

describe('WhereElse (Scientific)', () => {
  it('shows a compact table with slopes, ranges, windows and the honesty note', async () => {
    mockFetch(fixture)
    wrap({ region: 'wisconsin', variable: 'power_t2m' }, 'scientific')
    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(6)
    expect(within(table).getByText('+0.31 [+0.18, +0.44] °C')).toBeInTheDocument()
    expect(within(table).getAllByText('1984–2025').length).toBeGreaterThan(0)
    expect(within(table).getByText('no data here')).toBeInTheDocument()
    expect(screen.getByText('Each place uses its own full record; windows differ.')).toBeInTheDocument()
  })
})

describe('goesBothWays', () => {
  it('needs two sure places in opposite directions', () => {
    expect(goesBothWays(data.places)).toBe(false)
    expect(goesBothWays(withPlaces((p) => { p[2].direction = 'down' }).places)).toBe(true)
  })
})
