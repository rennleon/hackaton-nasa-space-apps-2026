import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { DataClient } from './data/client'

const read = (p: string) => JSON.parse(readFileSync(`public/data/${p}`, 'utf8'))
const client: DataClient = {
  regions: async () => read('catalog/regions.json'),
  themes: async () => read('catalog/themes.json'),
  variables: async () => read('catalog/variables.json'),
  glossary: async () => read('catalog/glossary.json'),
  scan: async (r, t) => read(`results/${r}/scan_${t}.json`),
  result: async (r, v, s) => read(`results/${r}/${s ? `${v}__${s}` : v}.json`),
  analyze: async (r, v) => read(`results/${r}/${v}.json`),
}

beforeEach(() => {
  window.location.hash = ''
  localStorage.clear()
})

describe('App smoke', () => {
  it('goes from the theme picker to a shortlist, in both registers', async () => {
    window.location.hash = '#/theme?region=cajamarca_west'
    const user = userEvent.setup()
    render(<App client={client} />)
    await user.click(await screen.findByRole('button', { name: /Water/ }))
    expect((await screen.findAllByText('Afternoon humidity')).length).toBeGreaterThan(0)
    expect(screen.getAllByText("Sure it's real").length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Scientific' }))
    await waitFor(() => expect(screen.getAllByText(/%RH\/decade|%RH per decade/).length).toBeGreaterThan(0))
  })
})
