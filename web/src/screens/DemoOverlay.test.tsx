import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import type { DataClient } from '../data/client'
import { DEMOS, demoStart } from '../lib/demos'
import { exampleAt } from '../lib/places'
import { toHash, parseHash } from '../lib/route'
import es from '../i18n/es'
import { readingMs } from './DemoOverlay'

const read = (p: string) => JSON.parse(readFileSync(`public/data/${p}`, 'utf8'))
/** Reads the precomputed files like the static client does, including the ready-made example points. */
const client: DataClient = {
  staticExamples: true,
  regions: async () => read('catalog/regions.json'),
  themes: async () => read('catalog/themes.json'),
  variables: async () => read('catalog/variables.json'),
  glossary: async () => read('catalog/glossary.json'),
  scan: async (r, t) => read(`results/${r}/scan_${t}.json`),
  result: async (r, v, s) => read(`results/${r}/${s ? `${v}__${s}` : v}.json`),
  analyze: async (r, v) => read(`results/${r}/${v}.json`),
  customScan: async (p, t) => read(`results/ex_${exampleAt(p)!.id}/scan_${t}.json`),
  customResult: async (p, v) => read(`results/ex_${exampleAt(p)!.id}/${v}.json`),
}

beforeEach(() => {
  window.location.hash = ''
  localStorage.clear()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  // the "Where else?" strip loads its summary with fetch
  vi.stubGlobal('fetch', async (url: string) => ({ ok: true, json: async () => JSON.parse(readFileSync(`public${url}`, 'utf8')) }))
})
afterEach(() => vi.unstubAllGlobals())

describe('demo script', () => {
  it('has 5 to 7 short steps per demo, each pointing at something', () => {
    expect(DEMOS.map((d) => d.id)).toEqual(['cajamarca_water', 'delhi_air'])
    for (const d of DEMOS) {
      expect(d.steps.length).toBeGreaterThanOrEqual(5)
      expect(d.steps.length).toBeLessThanOrEqual(7)
      for (const st of d.steps) {
        expect(st.target).toBeTruthy()
        expect(st.caption.simple.split(/(?<=[.?!])\s+/).length).toBeLessThanOrEqual(3)
      }
    }
  })

  it('has Spanish for every title, label and step, in both registers', () => {
    for (const d of DEMOS) {
      for (const k of [`demo.${d.id}.label.simple`, `demo.${d.id}.label.scientific`, `demo.${d.id}.title.simple`, `demo.${d.id}.title.sci`]) expect(es[k], k).toBeTruthy()
      d.steps.forEach((_, i) => {
        expect(es[`demo.${d.id}.step${i}.simple`], `${d.id} step ${i}`).toBeTruthy()
        expect(es[`demo.${d.id}.step${i}.sci`], `${d.id} step ${i}`).toBeTruthy()
      })
    }
  })

  it('the Simple narration has no banned words', () => {
    const banned = /p-value|significant|decade|anomaly|autocorrelation|confidence interval|statistically|caused by|proves|no change|\bK\b|%/i
    for (const d of DEMOS) for (const st of d.steps) expect(st.caption.simple).not.toMatch(banned)
  })

  it('every step has a hash route that survives a round trip', () => {
    for (const d of DEMOS) d.steps.forEach((st, i) => expect(parseHash(toHash({ ...st.route, demo: d.id, step: i }))).toEqual({ ...st.route, demo: d.id, step: i }))
  })

  it('auto-play waits longer for longer sentences', () => {
    expect(readingMs('one two three')).toBeLessThan(readingMs('one two three four five six seven eight nine ten'))
  })
})

describe('demo on the real screens', () => {
  for (const d of DEMOS) {
    for (const [i, st] of d.steps.entries()) {
      it(`${d.id} step ${i + 1}: "${st.target}" is on the screen`, async () => {
        window.location.hash = toHash({ ...st.route, demo: d.id, step: i })
        const { container } = render(<App client={client} />)
        await waitFor(() => expect(container.querySelector(`[data-demo="${st.target}"]`), `${st.target} on ${window.location.hash}`).not.toBeNull(), { timeout: 4000 })
        expect(await screen.findByRole('dialog')).toBeInTheDocument()
        expect(screen.getByText(st.caption.simple)).toBeInTheDocument()
      })
    }
  }

  it('Escape leaves the demo and goes to the start page', async () => {
    const user = userEvent.setup()
    window.location.hash = toHash(demoStart(DEMOS[1]))
    render(<App client={client} />)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(window.location.hash).toBe('#/home')
  })

  it('arrow keys and the buttons move between steps; the last step offers Finish', async () => {
    const user = userEvent.setup()
    window.location.hash = toHash(demoStart(DEMOS[0]))
    render(<App client={client} />)
    expect(await screen.findByText(DEMOS[0].steps[0].caption.simple)).toBeInTheDocument()
    await user.keyboard('{ArrowRight}')
    expect(await screen.findByText(DEMOS[0].steps[1].caption.simple)).toBeInTheDocument()
    await user.keyboard('{ArrowLeft}')
    expect(await screen.findByText(DEMOS[0].steps[0].caption.simple)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    window.location.hash = toHash({ ...DEMOS[0].steps.at(-1)!.route, demo: DEMOS[0].id, step: DEMOS[0].steps.length - 1 })
    await user.click(await screen.findByRole('button', { name: 'Finish' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('the start page offers both demos', async () => {
    render(<App client={client} />)
    const entry = await screen.findByText('Watch a demo', { exact: false })
    expect(entry).toBeInTheDocument()
    for (const d of DEMOS) expect(screen.getByRole('button', { name: d.label.simple })).toBeInTheDocument()
  })
})
