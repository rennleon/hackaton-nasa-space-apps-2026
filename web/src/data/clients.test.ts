import { afterEach, describe, expect, it, vi } from 'vitest'
import { FallbackClient } from './fallbackClient'
import { StaticClient } from './staticClient'
import { createClient } from './index'
import type { DataClient } from './client'
import type { AnalysisResult } from '../types/contract'

const fake = (over: Partial<DataClient>): DataClient => ({
  regions: async () => [], themes: async () => [], variables: async () => [], glossary: async () => [],
  scan: async () => { throw new Error('x') }, result: async () => { throw new Error('x') }, analyze: async () => { throw new Error('x') },
  customScan: async () => { throw new Error('x') }, customResult: async () => { throw new Error('x') }, ...over,
})
const res = { verdict: { label: 'significant' } } as unknown as AnalysisResult

afterEach(() => vi.restoreAllMocks())

describe('FallbackClient', () => {
  it('uses the api when it works', async () => {
    const c = new FallbackClient(fake({ analyze: async () => res }), fake({ result: async () => { throw new Error('unused') } }))
    expect(await c.analyze('r', 'v', { start: '2005-01' })).toBe(res)
  })
  it('falls back to the static twin, which holds the shared windows', async () => {
    const twin = vi.fn(async () => res)
    const c = new FallbackClient(fake({}), fake({ analyze: twin }))
    expect(await c.analyze('r', 'v', { start: '2002-09', end: '2021-12' })).toBe(res)
    expect(twin).toHaveBeenCalledWith('r', 'v', { start: '2002-09', end: '2021-12' })
  })
  it('falls back for plain reads', async () => {
    const c = new FallbackClient(fake({ regions: async () => { throw new Error('down') } }), fake({ regions: async () => [{ id: 'a' } as never] }))
    expect(await c.regions()).toHaveLength(1)
  })
})

describe('FallbackClient example points', () => {
  const delhi = { kind: 'point' as const, lat: 28.61, lon: 77.21 }
  it('a card window at an example point reads the precomputed file and never calls the API', async () => {
    const api = vi.fn(async () => res)
    const c = new FallbackClient(fake({ customResult: api }), fake({ customResult: async () => res }))
    expect(await c.customResult(delhi, 'power_aod', { start: '2004-10', end: '2025-12' })).toBe(res)
    expect(api).not.toHaveBeenCalled()
  })
  it('a period with no precomputed file at an example point asks the API', async () => {
    const api = vi.fn(async () => res)
    const c = new FallbackClient(fake({ customResult: api }), fake({ customResult: async () => ({ ...res, customPeriodUnavailable: true }) }))
    expect(await c.customResult(delhi, 'power_aod', { start: '2010-01', end: '2020-12' })).toBe(res)
    expect(api).toHaveBeenCalled()
  })
  it('API down too: the flagged default is shown, with its notice', async () => {
    const flagged = { ...res, customPeriodUnavailable: true }
    const c = new FallbackClient(fake({}), fake({ customResult: async () => flagged }))
    expect(((await c.customResult(delhi, 'power_aod', { start: '2010-01', end: '2020-12' })) as { customPeriodUnavailable?: boolean }).customPeriodUnavailable).toBe(true)
  })
})

describe('StaticClient', () => {
  it('builds season file urls', async () => {
    const f = vi.fn((...args: [string]) => Promise.resolve(new Response(JSON.stringify(res), { headers: { "x-url": args[0] } })))
    vi.stubGlobal('fetch', f)
    await new StaticClient('/').result('r', 'v', 'wet')
    expect(f.mock.calls[0][0]).toBe('/data/results/r/v__wet.json')
    vi.unstubAllGlobals()
  })
  it('flags custom periods', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(res)))
    const out = await new StaticClient('/').analyze('r', 'v', { end: '2010-12' })
    expect(out.customPeriodUnavailable).toBe(true)
    vi.unstubAllGlobals()
  })
  it('serves a shortlist card\'s shared window from its precomputed file', async () => {
    const f = vi.fn(async (...args: [string]) => new Response(JSON.stringify({ ...res, url: args[0] })))
    vi.stubGlobal('fetch', f)
    const out = await new StaticClient('/').analyze('r', 'v', { start: '2002-09', end: '2021-12' })
    expect(f.mock.calls[0][0]).toBe('/data/results/r/v__win_2002-09_2021-12.json')
    expect(out.customPeriodUnavailable).toBeUndefined()
    vi.unstubAllGlobals()
  })
  it('falls back to the default with a flag when no shared-window file exists', async () => {
    vi.stubGlobal('fetch', async (u: string) => (u.includes('__win_') ? new Response('nope', { status: 404 }) : new Response(JSON.stringify(res))))
    const out = await new StaticClient('/').analyze('r', 'v', { start: '2002-09', end: '2021-12' })
    expect(out.customPeriodUnavailable).toBe(true)
    vi.unstubAllGlobals()
  })
  it('picked when no API url', () => {
    expect(createClient(undefined)).toBeInstanceOf(StaticClient)
    expect(createClient('http://x')).toBeInstanceOf(FallbackClient)
  })
})
