import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './apiClient'
import { FallbackClient } from './fallbackClient'
import { StaticClient } from './staticClient'
import type { DataClient, SuggestAnswer } from './client'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const req = { place: 'Cajamarca', lat: -7.1, lon: -78.5 }
const answer: SuggestAnswer = { suggestions: [{ theme: 'rain', why: 'Mountains catch rain.' }], source: 'llm' }
const none: SuggestAnswer = { suggestions: [], source: 'none' }

describe('suggest client methods', () => {
  it('ApiClient posts the place and language to /guide/suggest', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(answer), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await new ApiClient('http://api.test/').suggest(req, 'es')).toEqual(answer)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://api.test/guide/suggest')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ ...req, lang: 'es' })
  })
  it('StaticClient has no AI: none', async () => {
    expect(await new StaticClient('/data').suggest()).toEqual(none)
  })
  it('FallbackClient uses the api, then falls back to the static twin', async () => {
    const base = {} as DataClient
    const ok = new FallbackClient({ ...base, suggest: async () => answer }, { ...base, suggest: async () => none })
    expect(await ok.suggest(req, 'en')).toEqual(answer)
    const down = new FallbackClient({ ...base, suggest: async () => Promise.reject(new Error('down')) }, { ...base, suggest: async () => none })
    expect(await down.suggest(req, 'en')).toEqual(none)
    await expect(new FallbackClient(base, base).suggest(req, 'en')).rejects.toThrow()
  })
})
