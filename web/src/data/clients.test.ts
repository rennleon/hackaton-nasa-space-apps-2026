import { afterEach, describe, expect, it, vi } from 'vitest'
import { FallbackClient } from './fallbackClient'
import { StaticClient } from './staticClient'
import { createClient } from './index'
import type { DataClient } from './client'
import type { AnalysisResult } from '../types/contract'

const fake = (over: Partial<DataClient>): DataClient => ({
  regions: async () => [], themes: async () => [], variables: async () => [], glossary: async () => [],
  scan: async () => { throw new Error('x') }, result: async () => { throw new Error('x') }, analyze: async () => { throw new Error('x') }, ...over,
})
const res = { verdict: { label: 'significant' } } as unknown as AnalysisResult

afterEach(() => vi.restoreAllMocks())

describe('FallbackClient', () => {
  it('uses the api when it works', async () => {
    const c = new FallbackClient(fake({ analyze: async () => res }), fake({ result: async () => { throw new Error('unused') } }))
    expect(await c.analyze('r', 'v', { start: '2005-01' })).toBe(res)
  })
  it('falls back for a custom period and flags it', async () => {
    const c = new FallbackClient(fake({}), fake({ result: async () => res }))
    const out = await c.analyze('r', 'v', { start: '2005-01' })
    expect(out.customPeriodUnavailable).toBe(true)
  })
  it('falls back silently when no custom period was asked', async () => {
    const c = new FallbackClient(fake({}), fake({ result: async () => res }))
    expect((await c.analyze('r', 'v', {})).customPeriodUnavailable).toBeUndefined()
  })
  it('falls back for plain reads', async () => {
    const c = new FallbackClient(fake({ regions: async () => { throw new Error('down') } }), fake({ regions: async () => [{ id: 'a' } as never] }))
    expect(await c.regions()).toHaveLength(1)
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
  it('picked when no API url', () => {
    expect(createClient(undefined)).toBeInstanceOf(StaticClient)
    expect(createClient('http://x')).toBeInstanceOf(FallbackClient)
  })
})
