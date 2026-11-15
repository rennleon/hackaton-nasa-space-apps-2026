import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './apiClient'
import { FallbackClient } from './fallbackClient'
import { StaticClient } from './staticClient'
import { HttpError, LiveDataUnavailable } from './client'

afterEach(() => vi.unstubAllGlobals())
const stub = (impl: (url: string) => Promise<Response>) => {
  const f = vi.fn((url: string) => impl(url))
  vi.stubGlobal('fetch', f)
  return f
}
const ok = () => Promise.resolve(new Response('{}'))

describe('ApiClient custom places', () => {
  it('builds point urls', async () => {
    const f = stub(ok)
    const api = new ApiClient('/api/')
    await api.customScan({ kind: 'point', lat: -7.16, lon: -78.51 }, 'heat')
    await api.customResult({ kind: 'point', lat: -7.16, lon: -78.51 }, 'power_t2m', { start: '2005-01', end: '2020-12' })
    expect(f.mock.calls[0][0]).toBe('/api/custom/scan?theme=heat&lat=-7.16&lon=-78.51')
    expect(f.mock.calls[1][0]).toBe('/api/custom/variables/power_t2m?lat=-7.16&lon=-78.51&start=2005-01&end=2020-12')
  })
  it('builds box urls', async () => {
    const f = stub(ok)
    const api = new ApiClient('http://x')
    await api.customScan({ kind: 'box', w: -80, s: -9, e: -75, n: -5 }, 'water')
    await api.customResult({ kind: 'box', w: -80, s: -9, e: -75, n: -5 }, 'power_precip', {})
    expect(f.mock.calls[0][0]).toBe('http://x/custom/scan?theme=water&bbox=-80,-9,-75,-5')
    expect(f.mock.calls[1][0]).toBe('http://x/custom/variables/power_precip?bbox=-80,-9,-75,-5')
  })
})

describe('live data errors', () => {
  const place = { kind: 'point', lat: 1, lon: 2 } as const
  it('FallbackClient turns a network failure into LiveDataUnavailable', async () => {
    stub(() => Promise.reject(new TypeError('network')))
    const c = new FallbackClient(new ApiClient('/api'), new StaticClient('/'))
    await expect(c.customScan(place, 'heat')).rejects.toBeInstanceOf(LiveDataUnavailable)
    await expect(c.customResult(place, 'power_t2m', {})).rejects.toBeInstanceOf(LiveDataUnavailable)
  })
  it('FallbackClient treats a server error as unavailable but passes a 422 through with its message', async () => {
    stub(() => Promise.resolve(new Response('', { status: 502 })))
    const c = new FallbackClient(new ApiClient('/api'), new StaticClient('/'))
    await expect(c.customScan(place, 'heat')).rejects.toBeInstanceOf(LiveDataUnavailable)
    stub(() => Promise.resolve(new Response(JSON.stringify({ detail: 'box too large' }), { status: 422 })))
    const err = await c.customScan(place, 'heat').catch((e) => e)
    expect(err).toBeInstanceOf(HttpError)
    expect(err.detail).toBe('box too large')
  })
  it('StaticClient cannot serve other custom places', async () => {
    await expect(new StaticClient('/').customScan(place, 'heat')).rejects.toBeInstanceOf(LiveDataUnavailable)
    await expect(new StaticClient('/').customResult(place, 'power_t2m', {})).rejects.toBeInstanceOf(LiveDataUnavailable)
  })
  const delhi = { kind: 'point', lat: 28.61, lon: 77.21 } as const
  it('StaticClient serves the ready-made example points from results/ex_<id>/', async () => {
    const f = stub(ok)
    const c = new StaticClient('/')
    expect(c.staticExamples).toBe(true)
    await c.customScan(delhi, 'air')
    await c.customResult({ kind: 'point', lat: 28.6, lon: 77.2 }, 'power_aod', {})
    const out = await c.customResult(delhi, 'power_aod', { start: '2010-01' })
    expect(f.mock.calls.map((x) => x[0])).toEqual(['/data/results/ex_delhi/scan_air.json', '/data/results/ex_delhi/power_aod.json', '/data/results/ex_delhi/power_aod.json'])
    expect(out.customPeriodUnavailable).toBe(true)
  })
  it('FallbackClient answers an example point from the static files first, and asks the API only for a custom period', async () => {
    const f = stub(ok)
    const c = new FallbackClient(new ApiClient('/api'), new StaticClient('/'))
    await c.customScan(delhi, 'air')
    await c.customResult(delhi, 'power_aod', {})
    expect(f.mock.calls.map((x) => x[0])).toEqual(['/data/results/ex_delhi/scan_air.json', '/data/results/ex_delhi/power_aod.json'])
    await c.customResult(delhi, 'power_aod', { start: '2010-01' })
    expect(f.mock.calls.at(-1)?.[0]).toContain('/api/custom/variables/power_aod')
  })
  it('FallbackClient keeps other places live-only', async () => {
    stub((url) => (url.startsWith('/api') ? Promise.reject(new TypeError('network')) : ok()))
    const c = new FallbackClient(new ApiClient('/api'), new StaticClient('/'))
    await expect(c.customScan(place, 'heat')).rejects.toBeInstanceOf(LiveDataUnavailable)
  })
})
