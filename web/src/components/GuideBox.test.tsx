import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataProvider, GlossaryProvider, ViewProvider } from '../context'
import type { DataClient } from '../data/client'
import type { Chosen } from '../lib/places'
import { GuideBox } from './GuideBox'

const read = (n: string) => JSON.parse(readFileSync(`public/data/catalog/${n}.json`, 'utf8'))
const regions = read('regions')
const catalog = { regions, themes: read('themes'), variables: read('variables'), glossary: read('glossary') } as never

function show(chosen: Chosen | null, client: Partial<DataClient> = {}) {
  const onAsk = vi.fn()
  render(
    <ViewProvider initial="simple">
      <GlossaryProvider terms={[]}>
        <DataProvider value={{ client: client as DataClient, catalog }}>
          <GuideBox chosen={chosen} canSearchPlace={false} onAsk={onAsk} onPlace={() => {}} />
        </DataProvider>
      </GlossaryProvider>
    </ViewProvider>,
  )
  return onAsk
}

describe('GuideBox', () => {
  it('suggests a question and variables from the keywords, hides ids, and opens the question for the chosen place', async () => {
    const chosen = { kind: 'region', region: regions[0] } as unknown as Chosen
    const onAsk = show(chosen)
    expect(screen.getByRole('heading', { name: 'Ask the detective' })).toBeTruthy()
    await userEvent.type(screen.getByLabelText('What do you want to find out?'), 'more smoke in the air')
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
    expect(await screen.findByText('Matched by keywords')).toBeTruthy()
    expect(screen.getByText('These can help:')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/omi_aod|merra2_|AIRS3STM/)
    await userEvent.click(screen.getByRole('button', { name: 'Show me this question' }))
    expect(onAsk).toHaveBeenCalledWith('smoke_haze')
  })

  it('labels an AI answer and asks to pick a place when none is chosen', async () => {
    const guide = vi.fn(async () => ({ theme: 'rain', variables: ['gpm_precip'], place_hint: 'Lima', reason: 'Rain fits your question.', source: 'llm' as const }))
    show(null, { guide })
    await userEvent.type(screen.getByLabelText('What do you want to find out?'), 'rain in Lima')
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
    expect(await screen.findByText('Suggested by an AI helper (Claude)')).toBeTruthy()
    expect(screen.getByText('Rain fits your question.')).toBeTruthy()
    expect(screen.getByText('You wrote Lima. Pick a place below, then ask this question.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show me this question' })).toBeNull()
    expect(guide).toHaveBeenCalledWith('rain in Lima', 'en')
  })

  it('falls back to keywords when the client fails', async () => {
    show(null, {
      guide: async () => {
        throw new Error('down')
      },
    })
    await userEvent.type(screen.getByLabelText('What do you want to find out?'), 'hot nights')
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
    expect(await screen.findByText('Matched by keywords')).toBeTruthy()
  })
})
