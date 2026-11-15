import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataProvider, GlossaryProvider, ViewProvider } from '../context'
import type { DataClient } from '../data/client'
import type { Chosen } from '../lib/places'
import { StartQuestions } from './StartQuestions'

const themes = JSON.parse(readFileSync('public/data/catalog/themes.json', 'utf8'))
const regions = JSON.parse(readFileSync('public/data/catalog/regions.json', 'utf8'))
const catalog = { regions, themes, variables: [], glossary: [] } as never

function show(onAsk = vi.fn()) {
  const chosen = { kind: 'region', region: regions[0] } as unknown as Chosen
  render(
    <ViewProvider initial="simple">
      <GlossaryProvider terms={[]}>
        <DataProvider value={{ client: {} as DataClient, catalog }}>
          <StartQuestions chosen={chosen} onAsk={onAsk} onChange={() => {}} />
        </DataProvider>
      </GlossaryProvider>
    </ViewProvider>,
  )
  return onAsk
}

describe('StartQuestions sub-topics', () => {
  it('keeps three main cards and offers each one its narrower questions as sibling buttons', async () => {
    const onAsk = show()
    expect(document.querySelectorAll('[data-demo^="question-"]')).toHaveLength(3)
    expect(document.querySelector('button button')).toBeNull() // no nested interactive elements
    const water = screen.getByTestId('subtopics-water')
    expect(within(water).getAllByRole('button').map((b) => b.textContent)).toEqual(['Rain', 'Damp air', 'Wet ground'])
    expect(within(water).getByText('Or ask about:')).toBeTruthy()

    await userEvent.click(within(water).getByRole('button', { name: 'Damp air' }))
    expect(onAsk).toHaveBeenCalledWith('damp_air')
    await userEvent.click(screen.getByRole('button', { name: /Is it getting hotter or colder/ }))
    expect(onAsk).toHaveBeenLastCalledWith('heat')
  })
})
