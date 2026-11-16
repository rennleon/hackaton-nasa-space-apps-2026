import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataProvider, GlossaryProvider, ViewProvider } from '../context'
import type { DataClient } from '../data/client'
import { FallbackClient } from '../data/fallbackClient'
import { StaticClient } from '../data/staticClient'
import { bannedIn } from '../lib/copy.test'
import { CLIMATE_LAYERS, classOf, climateTooFar, climateWindow, climateWindows, gridCovers, mergeGrids, type ClimateGrid, type ClimateParam } from '../lib/climate'
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

  it('covers a wide view with up to four requests at once, merged, and says the colours stop short', async () => {
    const climatology = vi.fn(async (_p: ClimateParam, b: number[]) => ({ ...GRID, cells: [[b[0] + 5, b[1] + 5, 1] as [number, number, number]] }))
    const user = userEvent.setup()
    wrap({ customPlaces: true, climatology } as unknown as DataClient)
    await user.click(screen.getByRole('button', { name: 'Show where it rains' }))
    act(() => sendView?.([-90, -8, -70, 12]))
    await waitFor(() => expect(climatology).toHaveBeenCalledTimes(4))
    expect(await screen.findByText('Colours show only near the middle of the map. Zoom in to see more.')).toBeInTheDocument()
    // panning back to the same boxes asks nothing new
    act(() => sendView?.([-95, -12, -65, 15]))
    act(() => sendView?.([-90, -8, -70, 12]))
    await new Promise((r) => setTimeout(r, 500))
    expect(climatology.mock.calls.length).toBeLessThanOrEqual(8)
  })

  it('asks to zoom in, and sends nothing, when the map shows too much of the world', async () => {
    const climatology = vi.fn(async () => GRID)
    const user = userEvent.setup()
    wrap({ customPlaces: true, climatology } as unknown as DataClient)
    await user.click(screen.getByRole('button', { name: 'Show where it rains' }))
    act(() => sendView?.([-120, -50, 20, 50]))
    expect(await screen.findByText('Zoom in to see colours.')).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 500))
    expect(climatology).not.toHaveBeenCalled()
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
    expect(await screen.findByText('No colours here without internet. Try a ready-made place.')).toBeInTheDocument()
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
  it('tiles a wide view into at most four 10-degree boxes around its centre', () => {
    expect(climateWindows([-80.3, -8.4, -76.1, -5.2])).toEqual([climateWindow([-80.3, -8.4, -76.1, -5.2])])
    const wide = climateWindows([-90, -8, -70, 12])
    expect(wide).toHaveLength(4)
    for (const [w, s, e, n] of wide) {
      expect(e - w).toBe(10)
      expect(n - s).toBe(10)
    }
    expect(Math.min(...wide.map((b) => b[0]))).toBe(-90)
    expect(Math.max(...wide.map((b) => b[2]))).toBe(-70)
    // one axis wide, the other narrow: two boxes
    expect(climateWindows([-90, -8, -70, -3])).toHaveLength(2)
    // never more than four, never past the poles or the date line
    for (const v of [[-170, 60, -150, 90], [170, -90, 190, -70], [-40, -25, 40, 25]] as [number, number, number, number][]) {
      const ws = climateWindows(v)
      expect(ws.length).toBeLessThanOrEqual(4)
      for (const [w, s, e, n] of ws) {
        expect(w).toBeGreaterThanOrEqual(-180)
        expect(e).toBeLessThanOrEqual(180)
        expect(s).toBeGreaterThanOrEqual(-90)
        expect(n).toBeLessThanOrEqual(90)
      }
    }
  })
  it('centres the boxes on the chosen pin when it is in view, and on the view when it is not', () => {
    const view: [number, number, number, number] = [-80, -9, -72, -3]
    expect(climateWindows(view, [-75, -4])).toEqual([[-80, -9, -70, 1]])
    expect(climateWindows(view, [10, 10])).toEqual(climateWindows(view))
  })
  it('says when the map is too far out, and whether the cells reach the edges of the view', () => {
    expect(climateTooFar([-10, -5, 10, 5])).toBe(false)
    expect(climateTooFar([-120, -50, 20, 50])).toBe(true)
    const g = { ...GRID, cells: [[-79, -7, 1], [-71, -1, 1]] as [number, number, number][] }
    expect(gridCovers(g, [-79.2, -7.2, -71.5, -1.2])).toBe(true)
    expect(gridCovers(g, [-90, -20, -60, 10])).toBe(false)
    expect(mergeGrids([g, g])!.cells).toHaveLength(2)
    expect(mergeGrids([])).toBeNull()
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

  it('StaticClient draws every precomputed window that overlaps the view, not only the one holding its centre', async () => {
    const two = [...index, { id: 'ex_next', bbox: [-73, -11, -63, -1], params: ['T2M', 'PRECTOTCORR', 'AOD_55'] }]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const id = url.match(/climatology\/(.+)_[A-Z0-9_]+\.json/)?.[1]
        return new Response(JSON.stringify(url.endsWith('index.json') ? two : { ...GRID, cells: [[id === 'ex_next' ? -68 : -78, -6, 1]] }))
      }),
    )
    const c = new StaticClient('/')
    // centre is inside the first window; the east end reaches into the second
    const both = await c.climatology!('T2M', [-78, -9, -66, -3])
    expect(both.cells.map((x) => x[0]).sort((a, b) => a - b)).toEqual([-78, -68])
    // touching only an edge is not an overlap
    await expect(c.climatology!('T2M', [-63, -9, -53, -3])).rejects.toThrow(/No precomputed/)
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
