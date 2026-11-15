import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataProvider, GlossaryProvider, ViewProvider } from '../context'
import type { DataClient } from '../data/client'
import { FallbackClient } from '../data/fallbackClient'
import { StaticClient } from '../data/staticClient'
import { bannedIn } from '../lib/copy.test'
import { CLIMATE_LAYERS, classOf, climateWindow, type ClimateGrid, type ClimateParam } from '../lib/climate'
import { setLang } from '../i18n'
import { PlaceChooser } from './PlaceChooser'

let sendView: ((v: [number, number, number, number]) => void) | undefined
vi.mock('./RegionMap', () => ({
  RegionMap: (p: { onViewChange?: (v: [number, number, number, number]) => void }) => {
    sendView = p.onViewChange
    return <div data-testid="map" />
  },
}))

const GRID: ClimateGrid = {
  param: 'PRECTOTCORR',
  units: 'mm/day',
  source: 'NASA POWER (MERRA-2 computer model), long-term average',
  cells: [
    [-79, -7, 0.3],
    [-78.4, -7, 6.2],
  ],
  cell_deg: [0.5, 0.625],
}

function wrap(client: DataClient, view: 'simple' | 'scientific' = 'simple') {
  const catalog = { regions: [], themes: [], variables: [] } as never
  return render(
    <ViewProvider initial={view}>
      <GlossaryProvider terms={[]}>
        <DataProvider value={{ client, catalog }}>
          <PlaceChooser regions={[]} chosen={null} onPlace={vi.fn()} />
        </DataProvider>
      </GlossaryProvider>
    </ViewProvider>,
  )
}

afterEach(() => {
  setLang('en')
  vi.restoreAllMocks()
})

describe('climate layer on the place chooser', () => {
  it('fetches the grid for the view through the client and shows a legend with words and the source', async () => {
    const climatology = vi.fn(async () => GRID)
    const user = userEvent.setup()
    wrap({ customPlaces: true, climatology } as unknown as DataClient)
    expect(screen.queryByText(/Darker blue/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Show where it rains' }))
    act(() => sendView?.([-80.3, -8.4, -76.1, -5.2]))
    await waitFor(() => expect(climatology).toHaveBeenCalledTimes(1))
    // the request is whole degrees, between 2 and 10 a side
    expect(climatology).toHaveBeenCalledWith('PRECTOTCORR', [-81, -9, -76, -5])
    expect(screen.getByRole('button', { name: 'Show where it rains' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Darker blue means more rain. Pick a spot inside one colour.')).toBeInTheDocument()
    for (const word of ['Very dry', 'Dry', 'Some rain', 'Rainy', 'Very rainy']) expect(await screen.findByText(word)).toBeInTheDocument()
    expect(await screen.findByText('On this map: very dry to very rainy.')).toBeInTheDocument()
    expect(screen.getByText(/NASA POWER \(MERRA-2 computer model\)/)).toHaveTextContent('long-term average')
  })

  it('shows numbers and units only in the Scientific view', async () => {
    const climatology = vi.fn(async () => GRID)
    const user = userEvent.setup()
    wrap({ customPlaces: true, climatology } as unknown as DataClient, 'scientific')
    await user.click(screen.getByRole('button', { name: 'Mean precipitation' }))
    act(() => sendView?.([-80, -8, -76, -5]))
    expect(await screen.findByText('Unit: mm/day')).toBeInTheDocument()
    expect(await screen.findByText('Values in this view: 0.3 to 6.2 mm/day.')).toBeInTheDocument()
    expect(screen.getByText('< 0.5')).toBeInTheDocument()
  })

  it('says so when no colours can be had, and turns off again', async () => {
    const climatology = vi.fn(async () => {
      throw new Error('offline')
    })
    const user = userEvent.setup()
    wrap({ customPlaces: false, climatology } as unknown as DataClient)
    await user.click(screen.getByRole('button', { name: 'Show where it is hot' }))
    act(() => sendView?.([-80, -8, -76, -5]))
    expect(await screen.findByText('We have no colours for this spot right now.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show where it is hot' }))
    expect(screen.queryByText(/Darker red/)).toBeNull()
  })

  it('speaks Spanish', async () => {
    setLang('es')
    const user = userEvent.setup()
    wrap({ customPlaces: true, climatology: async () => GRID } as unknown as DataClient)
    await user.click(screen.getByRole('button', { name: 'Mostrar dónde llueve' }))
    act(() => sendView?.([-80, -8, -76, -5]))
    expect(await screen.findByText(/Más azul oscuro quiere decir más lluvia/)).toBeInTheDocument()
    expect(await screen.findByText('Muy lluvioso')).toBeInTheDocument()
  })

  it('keeps the Simple view free of banned words, short, and without numbers or raw units', async () => {
    for (const layer of CLIMATE_LAYERS) {
      const user = userEvent.setup()
      const { container, unmount } = wrap({ customPlaces: true, climatology: async (p: ClimateParam) => ({ ...GRID, param: p }) } as unknown as DataClient)
      const toggle = container.querySelectorAll('.chooser-layers button')[CLIMATE_LAYERS.indexOf(layer)] as HTMLElement
      await user.click(toggle)
      act(() => sendView?.([-80, -8, -76, -5]))
      await screen.findByText(/^(On this map|All of this map)/)
      const parts = [...container.querySelectorAll('.clim-legend p, .clim-legend li')]
      for (const el of parts) {
        const text = el.textContent!
        expect(bannedIn(text), text).toEqual([])
        for (const sentence of text.split(/[.?!]\s/)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(12)
        if (!el.classList.contains('clim-source')) expect(text).not.toMatch(/°C|mm\/day|\d/)
      }
      unmount()
    }
  })
})

describe('climate helpers', () => {
  it('snaps the request window to whole degrees, 2 to 10 degrees a side, inside the globe', () => {
    expect(climateWindow([-80.3, -8.4, -76.1, -5.2])).toEqual([-81, -9, -76, -5])
    const big = climateWindow([-100, -50, 100, 50])
    expect(big[2] - big[0]).toBe(10)
    expect(big[3] - big[1]).toBe(10)
    const tiny = climateWindow([10.1, 10.1, 10.2, 10.2])
    expect(tiny[2] - tiny[0]).toBeGreaterThanOrEqual(2)
    expect(tiny[3] - tiny[1]).toBeGreaterThanOrEqual(2)
    const pole = climateWindow([-10, 80, 10, 90])
    expect(pole[3]).toBeLessThanOrEqual(90)
    expect(pole[3] - pole[1]).toBeLessThanOrEqual(10)
  })
  it('puts a value in one of five classes', () => {
    const water = CLIMATE_LAYERS.find((l) => l.id === 'water')!
    expect([0.1, 0.5, 2, 4, 9].map((v) => classOf(water, v))).toEqual([0, 1, 2, 3, 4])
  })
})

describe('climatology clients', () => {
  const index = [
    { id: 'cajamarca_highlands', bbox: [-83, -11, -73, -1], params: ['T2M', 'PRECTOTCORR', 'AOD_55'] },
    { id: 'wisconsin', bbox: [-95, 40, -85, 50], params: ['T2M', 'PRECTOTCORR', 'AOD_55'] },
  ]
  const stubFetch = () => {
    const f = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('index.json') ? index : { ...GRID, url })))
    vi.stubGlobal('fetch', f)
    return f
  }
  afterEach(() => vi.unstubAllGlobals())

  it('StaticClient serves the precomputed window around a ready-made place and rejects elsewhere', async () => {
    const f = stubFetch()
    const c = new StaticClient('/')
    const grid = await c.climatology!('PRECTOTCORR', [-81, -9, -76, -5])
    expect((grid as unknown as { url: string }).url).toBe('/data/climatology/cajamarca_highlands_PRECTOTCORR.json')
    await expect(c.climatology!('T2M', [100, 10, 105, 15])).rejects.toThrow(/No precomputed/)
    expect(f.mock.calls.filter(([u]) => String(u).endsWith('index.json'))).toHaveLength(1) // the index is read once
  })

  it('FallbackClient asks the API first and then the static files', async () => {
    stubFetch()
    const api = { climatology: vi.fn(async () => GRID) } as unknown as DataClient
    const down = { climatology: vi.fn(async () => Promise.reject(new Error('down'))) } as unknown as DataClient
    expect(await new FallbackClient(api, new StaticClient('/')).climatology('PRECTOTCORR', [-81, -9, -76, -5])).toBe(GRID)
    const viaStatic = await new FallbackClient(down, new StaticClient('/')).climatology('T2M', [-95, 40, -90, 45])
    expect((viaStatic as unknown as { url: string }).url).toBe('/data/climatology/wisconsin_T2M.json')
  })
})
