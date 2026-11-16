import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataProvider, GlossaryProvider, ViewProvider } from '../context'
import type { DataClient } from '../data/client'
import { GuideBox } from './GuideBox'

const read = (n: string) => JSON.parse(readFileSync(`public/data/catalog/${n}.json`, 'utf8'))
const regions = read('regions')
const catalog = { regions, themes: read('themes'), variables: read('variables'), glossary: read('glossary') } as never

function show(client: Partial<DataClient> = {}) {
  const onAsk = vi.fn()
  render(
    <ViewProvider initial="simple">
      <GlossaryProvider terms={[]}>
        <DataProvider value={{ client: client as DataClient, catalog }}>
          <GuideBox onAsk={onAsk} />
        </DataProvider>
      </GlossaryProvider>
    </ViewProvider>,
  )
  return onAsk
}

describe('GuideBox', () => {
  it('suggests a question and variables from the keywords, hides ids, and opens the question for the chosen place', async () => {
    const onAsk = show()
    expect(screen.getByPlaceholderText('Try: Is there more smoke here?')).toBeTruthy()
    await userEvent.type(screen.getByLabelText('Or ask in your own words'), 'more smoke in the air')
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
    expect(screen.getByText('These can help:')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/omi_aod|merra2_|AIRS3STM/)
    await userEvent.click(screen.getByRole('button', { name: 'Show me this question' }))
    expect(onAsk).toHaveBeenCalledWith('smoke_haze')
  })

  it('opens the question of a plain answer', async () => {
    const guide = vi.fn(async () => ({ theme: 'rain', variables: ['gpm_precip'], place_hint: 'Lima', reason: 'Rain fits your question.', source: 'keywords' as const }))
    const onAsk = show({ guide })
    await userEvent.type(screen.getByLabelText('Or ask in your own words'), 'rain in Lima')
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
    expect(screen.getByText('Rain fits your question.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Show me this question' }))
    expect(onAsk).toHaveBeenCalledWith('rain')
    expect(guide).toHaveBeenCalledWith('rain in Lima', 'en')
  })

  it('falls back to keywords when the client fails', async () => {
    show({
      guide: async () => {
        throw new Error('down')
      },
    })
    await userEvent.type(screen.getByLabelText('Or ask in your own words'), 'hot nights')
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
    expect(await screen.findByRole('button', { name: 'Show me this question' })).toBeTruthy()
  })
})
