import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataProvider, GlossaryProvider, ViewProvider } from '../context'
import type { DataClient, SuggestAnswer } from '../data/client'
import type { Chosen } from '../lib/places'
import { SuggestedQuestions } from './SuggestedQuestions'

const read = (n: string) => JSON.parse(readFileSync(`public/data/catalog/${n}.json`, 'utf8'))
const regions = read('regions')
const catalog = { regions, themes: read('themes'), variables: read('variables'), glossary: read('glossary') } as never

const region = { kind: 'region', region: regions[0] } as unknown as Chosen
const pin = (lat: number, lon: number, name: string | null = null): Chosen => ({ kind: 'place', place: { kind: 'point', lat, lon }, name, viaMap: true }) as Chosen
const llm = (...ids: string[]): SuggestAnswer => ({ suggestions: ids.map((theme) => ({ theme, why: `Because ${theme}.` })), source: 'llm' })

function wrap(chosen: Chosen, client: Partial<DataClient>, onAsk = vi.fn()) {
  const tree = (c: Chosen) => (
    <ViewProvider initial="simple">
      <GlossaryProvider terms={[]}>
        <DataProvider value={{ client: client as DataClient, catalog }}>
          <SuggestedQuestions chosen={c} onAsk={onAsk} />
        </DataProvider>
      </GlossaryProvider>
    </ViewProvider>
  )
  const view = render(tree(chosen))
  return { onAsk, rerender: (c: Chosen) => view.rerender(tree(c)), container: view.container }
}

describe('SuggestedQuestions', () => {
  it('shows a quiet thinking line, then buttons with question, reason and the AI source line', async () => {
    const suggest = vi.fn(async () => llm('rain', 'smoke_haze'))
    wrap(region, { suggest })
    expect(screen.getByText('Thinking about your place…')).toBeTruthy()
    expect(await screen.findByText('Because rain.')).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.getByText('Because smoke_haze.')).toBeTruthy()
    expect(screen.getByText('Suggested by an AI helper (Claude)')).toBeTruthy()
    expect(screen.getByRole('heading', { name: /^Ideas for / })).toBeTruthy()
    expect(screen.queryByText('Thinking about your place…')).toBeNull()
    const [req, lang] = suggest.mock.calls[0] as unknown as [{ place: string; lat: number; lon: number }, string]
    expect(req.place).toBeTruthy()
    expect(typeof req.lat).toBe('number')
    expect(lang).toBe('en')
  })

  it('clicking a suggestion opens that question', async () => {
    const { onAsk } = wrap(region, { suggest: async () => llm('rain') })
    await userEvent.click(await screen.findByRole('button', { name: /Because rain/ }))
    expect(onAsk).toHaveBeenCalledWith('rain')
  })

  it('skips themes missing from the catalog', async () => {
    wrap(region, { suggest: async () => llm('rain', 'not_a_theme') })
    await screen.findByText('Because rain.')
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it.each([
    ['source none', { suggest: async () => ({ suggestions: [], source: 'none' as const }) }],
    ['an empty list', { suggest: async () => ({ suggestions: [], source: 'llm' as const }) }],
    ['an error', { suggest: async () => Promise.reject(new Error('down')) }],
    ['no suggest method', {}],
  ])('renders nothing for %s', async (_n, client) => {
    const { container } = wrap(region, client)
    await waitFor(() => expect(screen.queryByText('Thinking about your place…')).toBeNull())
    expect(container.innerHTML).toBe('')
  })

  it('asks with a null name for an unnamed pin, and once per place (not per render)', async () => {
    const suggest = vi.fn(async () => llm('rain'))
    const { rerender } = wrap(pin(-7.1, -78.5), { suggest })
    await screen.findByText('Because rain.')
    expect(suggest).toHaveBeenCalledTimes(1)
    expect((suggest.mock.calls[0] as unknown[])[0]).toEqual({ place: null, lat: expect.any(Number), lon: expect.any(Number) })
    expect(screen.getByRole('heading', { name: 'Ideas for this place' })).toBeTruthy()
    rerender(pin(-7.1, -78.5)) // a new object, the same place
    await Promise.resolve()
    expect(suggest).toHaveBeenCalledTimes(1)
  })

  it('names a named place in the request and the heading', async () => {
    const suggest = vi.fn(async () => llm('rain'))
    wrap(pin(-12.04, -77.03, 'Lima'), { suggest })
    expect(await screen.findByRole('heading', { name: 'Ideas for Lima' })).toBeTruthy()
    expect((suggest.mock.calls[0] as unknown[])[0]).toMatchObject({ place: 'Lima' })
  })

  it('ignores a stale answer when the place changed', async () => {
    const pending: ((a: SuggestAnswer) => void)[] = []
    const suggest = vi.fn(() => new Promise<SuggestAnswer>((res) => pending.push(res)))
    const { rerender } = wrap(pin(1, 1, 'Old town'), { suggest })
    rerender(pin(2, 2, 'New town'))
    await waitFor(() => expect(suggest).toHaveBeenCalledTimes(2))
    pending[1](llm('rain'))
    await screen.findByText('Because rain.')
    pending[0](llm('smoke_haze'))
    await Promise.resolve()
    expect(screen.queryByText('Because smoke_haze.')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Ideas for New town' })).toBeTruthy()
  })
})
