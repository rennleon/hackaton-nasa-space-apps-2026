import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import type { DataClient } from '../data/client'
import { geocodeUrl, searchPlaces, useGeocodeSearch, type GeoResult } from '../lib/geocode'
import { recallPlaceName } from '../lib/placeNames'
import { parsePlace, placeRegion } from '../lib/place'
import { bannedIn } from '../lib/copy.test'
import { DEMOS, demoStart } from '../lib/demos'
import { toHash } from '../lib/route'

const cat = (n: string) => JSON.parse(readFileSync(`public/data/catalog/${n}.json`, 'utf8'))
const client: DataClient = {
  regions: async () => cat('regions'),
  themes: async () => cat('themes'),
  variables: async () => cat('variables'),
  glossary: async () => cat('glossary'),
  scan: async () => { throw new Error('unused') },
  result: async () => { throw new Error('unused') },
  analyze: async () => { throw new Error('unused') },
  customScan: async () => { throw new Error('unused') },
  customResult: async () => { throw new Error('unused') },
}

const CAJAMARCA = { id: 3698, name: 'Cajamarca', latitude: -7.1638, longitude: -78.5003, country: 'Peru', admin1: 'Cajamarca', population: 226031 }
const reply = (results?: unknown[]) => ({ ok: true, json: async () => (results ? { results } : { generationtime_ms: 1 }) })

beforeEach(() => {
  window.location.hash = ''
  localStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('geocoding client', () => {
  it('sends only the typed text, with the approved parameters', async () => {
    const fetchMock = vi.fn(async () => reply([CAJAMARCA]))
    vi.stubGlobal('fetch', fetchMock)
    const out = await searchPlaces('Cajamarca')
    expect(fetchMock).toHaveBeenCalledWith('https://geocoding-api.open-meteo.com/v1/search?name=Cajamarca&count=8&language=en&format=json', { signal: undefined })
    expect(out).toEqual([expect.objectContaining({ label: 'Cajamarca, Peru', detail: 'Peru', lat: -7.1638, lon: -78.5003 })])
  })
  it('escapes the text, and an empty answer (no results key) is an empty list', async () => {
    expect(geocodeUrl('São Paulo & co')).toContain('name=S%C3%A3o+Paulo+%26+co')
    vi.stubGlobal('fetch', vi.fn(async () => reply()))
    expect(await searchPlaces('zzzzzz')).toEqual([])
  })
  it('throws on a server error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))
    await expect(searchPlaces('abc')).rejects.toThrow()
  })
})

describe('useGeocodeSearch', () => {
  const result: GeoResult = { id: '1', name: 'X', label: 'X, Y', detail: 'Y', lat: 1, lon: 2 }

  it('waits 400 ms after the last key, needs 3 characters, and aborts the stale request', async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    const search = vi.fn((_: string, signal: AbortSignal) => {
      signals.push(signal)
      return Promise.resolve([result])
    })
    const { result: hook, rerender } = renderHook(({ q }) => useGeocodeSearch(q, { search }), { initialProps: { q: 'ca' } })
    expect(hook.current).toMatchObject({ status: 'idle', tooShort: true })
    rerender({ q: 'caj' })
    expect(hook.current.status).toBe('searching')
    await act(async () => { await vi.advanceTimersByTimeAsync(399) })
    expect(search).not.toHaveBeenCalled()
    rerender({ q: 'caja' }) // another key: the wait starts over
    await act(async () => { await vi.advanceTimersByTimeAsync(399) })
    expect(search).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(search).toHaveBeenCalledTimes(1)
    expect(search.mock.calls[0][0]).toBe('caja')
    expect(hook.current).toMatchObject({ status: 'done', results: [result] })
  })

  it('aborts a request in flight when the text changes, and ignores its late answer', async () => {
    vi.useFakeTimers()
    const resolvers: ((r: GeoResult[]) => void)[] = []
    const signals: AbortSignal[] = []
    const search = vi.fn((_: string, signal: AbortSignal) => {
      signals.push(signal)
      return new Promise<GeoResult[]>((resolve) => resolvers.push(resolve))
    })
    const { result: hook, rerender } = renderHook(({ q }) => useGeocodeSearch(q, { search }), { initialProps: { q: 'lima' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(search).toHaveBeenCalledTimes(1)
    rerender({ q: 'limas' })
    expect(signals[0].aborted).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(search).toHaveBeenCalledTimes(2)
    await act(async () => { resolvers[0]([{ ...result, label: 'old' }]) }) // stale answer arrives late
    expect(hook.current.status).toBe('searching')
    await act(async () => { resolvers[1]([result]) })
    expect(hook.current).toMatchObject({ status: 'done', results: [result] })
  })

  it('reports an error, and does nothing when switched off', async () => {
    vi.useFakeTimers()
    const search = vi.fn(() => Promise.reject(new Error('down')))
    const { result: hook } = renderHook(() => useGeocodeSearch('cajamarca', { search }))
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(hook.current.status).toBe('error')
    const off = renderHook(() => useGeocodeSearch('cajamarca', { search, enabled: false }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(search).toHaveBeenCalledTimes(1)
    expect(off.result.current.status).toBe('idle')
  })
})

describe('start screen', () => {
  const open = () => render(<App client={client} />)
  /** the ready-made cards live in their own tab */
  const ready = async () => {
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Ready-made places' }))
    return within(screen.getByRole('tabpanel'))
  }

  it('searches by name, keeps the real name, shows the questions, and opens the findings', async () => {
    const fetchMock = vi.fn(async () => reply([CAJAMARCA]))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    open()
    await user.type(await screen.findByRole('combobox', { name: /Type the name/ }), 'Cajamarca')
    expect(await screen.findByRole('option', { name: /Cajamarca/ }, { timeout: 3000 })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1) // one request for the whole word, not one per key
    expect(screen.getByText('Place search uses Open-Meteo.')).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: /Cajamarca/ }))
    expect(await screen.findByRole('heading', { name: 'Cajamarca, Peru' })).toBeInTheDocument()
    expect(screen.getByText('What do you want to know?')).toBeInTheDocument()
    for (const q of ['Heat', 'Water', 'Air']) expect(screen.getByRole('button', { name: new RegExp(q) })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Water/ }))
    await waitFor(() => expect(window.location.hash).toBe('#/shortlist?place=pt:-7.16,-78.5&theme=water'))
    expect(recallPlaceName('pt:-7.16,-78.5')).toBe('Cajamarca, Peru')
    expect(placeRegion(parsePlace('pt:-7.16,-78.5')!).name.simple).toBe('Cajamarca, Peru')
  })

  it('says "Searching…" and "No place found"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply()))
    const user = userEvent.setup()
    open()
    const box = await screen.findByRole('combobox', { name: /Type the name/ })
    await user.type(box, 'ab')
    expect(screen.getByText('Type at least 3 letters.')).toBeInTheDocument()
    await user.type(box, 'cdef')
    expect(screen.getByText('Searching…')).toBeInTheDocument()
    expect(await screen.findByText('No place found', undefined, { timeout: 3000 })).toBeInTheDocument()
  })

  it('shows six ready-made places and never the hidden test box', async () => {
    const user = userEvent.setup()
    open()
    await ready()
    expect(screen.queryByText(/test box/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Cajamarca \((?!high mountains only)/)).not.toBeInTheDocument() // the twin is listed; the test box is not
    for (const n of ['Cajamarca highlands', 'Cajamarca, high mountains only', 'Wisconsin', 'Delhi, India', 'Amazon rainforest near Manaus, Brazil', 'Sahara desert near Tamanrasset, Algeria']) {
      expect(within(screen.getByRole('tabpanel')).getByRole('button', { name: new RegExp(n) })).toBeInTheDocument()
    }
    await user.click((await ready()).getByRole('button', { name: /Delhi, India/ }))
    await user.click(await screen.findByRole('button', { name: /Heat/ }))
    await waitFor(() => expect(window.location.hash).toBe('#/shortlist?place=pt:28.61,77.21&theme=heat'))
  })

  it('a ready-made region opens its findings by region id', async () => {
    const user = userEvent.setup()
    open()
    await user.click((await ready()).getByRole('button', { name: /Wisconsin/ }))
    await user.click(await screen.findByRole('button', { name: /Air/ }))
    await waitFor(() => expect(window.location.hash).toBe('#/shortlist?region=wisconsin&theme=air'))
  })

  it('"Use my location" uses the browser only on click, and takes a refusal kindly', async () => {
    const getCurrentPosition = vi.fn((_ok: PositionCallback, fail: PositionErrorCallback) => fail({ code: 1 } as GeolocationPositionError))
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })
    const user = userEvent.setup()
    open()
    await screen.findByRole('combobox', { name: /Type the name/ })
    expect(getCurrentPosition).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Use my location' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No problem. You can type a place or tap the map instead.')
    expect(screen.queryByText('What do you want to know?')).not.toBeInTheDocument()
    getCurrentPosition.mockImplementation((ok: PositionCallback) => ok({ coords: { latitude: -12.0464, longitude: -77.0428 } } as GeolocationPosition))
    await user.click(screen.getByRole('button', { name: 'Use my location' }))
    expect(await screen.findByRole('heading', { name: 'Where you are' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Water/ }))
    await waitFor(() => expect(window.location.hash).toBe('#/shortlist?place=pt:-12.05,-77.04&theme=water'))
  })

  it('is a wizard: tabs in step 1, then the questions in step 2, and back to the tab we came from', async () => {
    const user = userEvent.setup()
    open()
    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Search', 'On the map', 'Coordinates', 'Ready-made places'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Pick a place').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1, -1]) // roving tabindex
    tabs[0].focus()
    await user.keyboard('{ArrowLeft}') // wraps from the first tab to the last one, Ready-made places
    expect(tabs[3]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[3]).toHaveFocus()
    await user.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: /Wisconsin/ }))
    const heading = await screen.findByRole('heading', { name: 'Wisconsin' })
    expect(heading).toHaveFocus()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.getByText('Ask a question').closest('li')).toHaveAttribute('aria-current', 'step')
    await user.click(screen.getByRole('button', { name: 'Pick a different place' }))
    expect(await screen.findByRole('tab', { name: 'Ready-made places', selected: true })).toHaveFocus()
    expect(screen.queryByText('What do you want to know?')).not.toBeInTheDocument()
  })

  it('shows "Watch a demo" in the hero on first load, and a demo button opens its first step', async () => {
    const user = userEvent.setup()
    open()
    const hero = within(await screen.findByRole('group', { name: 'Watch a demo' }))
    expect(hero.getAllByRole('button').map((b) => b.textContent)).toEqual(DEMOS.map((d) => d.label.simple))
    await user.click(hero.getByRole('button', { name: DEMOS[1].label.simple }))
    await waitFor(() => expect(window.location.hash).toBe(toHash(demoStart(DEMOS[1]))))
  })

  it('keeps the demo buttons after a place is picked', async () => {
    const user = userEvent.setup()
    open()
    await user.click((await ready()).getByRole('button', { name: /Wisconsin/ }))
    await screen.findByText('What do you want to know?')
    const hero = within(screen.getByRole('group', { name: 'Watch a demo' }))
    await user.click(hero.getByRole('button', { name: DEMOS[0].label.simple }))
    await waitFor(() => expect(window.location.hash).toBe(toHash(demoStart(DEMOS[0]))))
  })

  it('uses no banned words in the Simple view, before and after choosing a place', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await user.click((await ready()).getByRole('button', { name: /Wisconsin/ }))
    await screen.findByText('What do you want to know?')
    const text = container.querySelector('.start')?.textContent ?? ''
    expect(text.length).toBeGreaterThan(100)
    expect(bannedIn(text)).toEqual([])
    expect(text).not.toMatch(/v0\.\d|stage 1|cross-check|test box/)
  })
})
