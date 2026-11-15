import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import type { DataClient } from '../data/client'
import { getLang, setLang, t, tx } from './index'
import es from './es'
import { allKeys, literalUses, placeholders } from './extractKeys'
import { formatSlope, formatYm } from '../lib/text'
import { fmt } from '../lib/resultCopy'

// Dynamic keys the extractor cannot expand by itself; every one is covered in extractKeys.dynamicUses().
const KNOWN_TEMPLATES = new Set([
  '`${key}.${sfx(view)}`',
  '`${key}.${view}`',
  '`demo.${d.id}.label`',
  '`demo.${demo.id}.step${at}`',
  '`demo.${demo.id}.title`',
  '`result.chart.dir.${dir}`',
  '`result.gauge.${s.id}`',
  '`result.live.${kind}`',
  '`result.trust.agreement.${pub.agreement}`',
  '`result.trust.cross.${ccOutcome}`',
  '`start.example.${e.id}.caption`',
  '`start.example.${e.id}.name`',
  '`start.example.${e.id}.tag`',
])

afterEach(() => {
  setLang('en')
  localStorage.clear()
})

describe('key coverage', () => {
  const keys = allKeys()

  it('finds the keys used in the source (guards the extractor itself)', () => {
    expect(keys.size).toBeGreaterThan(400)
    for (const k of ['app.title', 'result.gauge.sure.simple', 'findings.eyebrow', 'start.hero.title', 'src.label.what.simple']) expect(keys.has(k), k).toBe(true)
  })

  it('has no template keys the extractor does not know about', () => {
    const unknown = literalUses().dynamic.map((d) => d.template).filter((tpl) => !KNOWN_TEMPLATES.has(tpl))
    expect(unknown, 'add the new family to extractKeys.dynamicUses() and KNOWN_TEMPLATES').toEqual([])
  })

  it('has a Spanish string for every key', () => {
    const missing = [...keys.values()].filter((u) => !es[u.key]?.trim()).map((u) => `${u.key}  (${u.file})`)
    expect(missing).toEqual([])
  })

  it('keeps the {placeholders} of the English default', () => {
    const bad = [...keys.values()]
      .filter((u) => u.en != null && es[u.key])
      .filter((u) => placeholders(u.en!).join() !== placeholders(es[u.key]).join())
      .map((u) => `${u.key}: ${placeholders(u.en!)} vs ${placeholders(es[u.key])}`)
    expect(bad).toEqual([])
  })
})

// Spanish version of the Simple-view rules (CLAUDE.md, R5).
const BANNED_ES = [
  /valor p/i, /significativ/i, /significancia/i, /d[ée]cada/i, /anomal[ií]a/i, /autocorrelaci/i, /puntos porcentuales/i, /intervalo de confianza/i,
  /estad[ií]stic/i, /mann|kendall|hamed|\bols\b|t-test/i, /\bprueba/i, /sin cambio/i, /causad[oa] por/i, /%\s*hr\b|%RH|kg\s*m|\bK\b/,
]
// Scientific-only strings that happen to share one key for both views, and the page footer (English one is as long).
const SCIENTIFIC_ONLY = [/^where\.col\./, /^findings\.adjP$/, /^result\.trust\.(mdt|noSlope|yr)/, /^common\.footer$/]
const isScientificKey = (k: string) => /\.(sci|scientific)$/.test(k) || SCIENTIFIC_ONLY.some((re) => re.test(k))

describe('Spanish Simple copy (R5)', () => {
  const simple = Object.entries(es).filter(([k]) => !isScientificKey(k))
  // bare keys are shown in both views, so they follow the Simple rules too

  it('uses no banned technical words', () => {
    const hits = simple.flatMap(([k, v]) => BANNED_ES.filter((re) => re.test(v)).map((re) => `${k}: "${v}" ~ ${re}`))
    expect(hits).toEqual([])
  })

  it('keeps sentences short', () => {
    const long = simple.flatMap(([k, v]) =>
      v
        .replace(/\{\w+\}/g, 'x')
        .split(/[.?!¿¡]\s/)
        .filter((s) => s.trim().split(/\s+/).length > 16)
        .map((s) => `${k}: ${s}`),
    )
    expect(long).toEqual([])
  })

  it('has the three meter words, word for word', () => {
    expect(es['result.gauge.too_soon.simple']).toBe('Es muy pronto para saberlo')
    expect(es['result.gauge.maybe.simple']).toBe('Quizás, aún no estamos seguros')
    expect(es['result.gauge.sure.simple']).toBe('Seguro que es real')
    expect(es['result.gauge.cant.simple']).toBe('No podemos saberlo aquí')
  })
})

describe('translation helpers', () => {
  it('falls back to English and fills placeholders', () => {
    expect(t('unknown.key', 'Hello {name}', { name: 'Ana' })).toBe('Hello Ana')
    setLang('es')
    expect(t('unknown.key', 'Hello {name}', { name: 'Ana' })).toBe('Hello Ana')
    expect(t('findings.open', 'Open {name}', { name: 'Humedad' })).toBe('Abrir Humedad')
  })

  it('tx picks the Spanish variant when the backend sent one', () => {
    const text = { simple: 'moist', scientific: 'humid', simple_es: 'húmedo', scientific_es: null }
    expect(tx(text, 'simple')).toBe('moist')
    setLang('es')
    expect(tx(text, 'simple')).toBe('húmedo')
    expect(tx(text, 'scientific')).toBe('humid') // no Spanish yet: English, never blank
  })

  it('formats numbers, slopes and months in the active language', () => {
    const units = { display: '°C', simple: 'degrees', decimals: 2 } as Parameters<typeof formatSlope>[1]
    expect(fmt(1234.5, 1)).toBe('1,234.5')
    expect(formatYm('2002-09')).toBe('Sep 2002')
    expect(formatSlope(0.5, units, 'simple')).toBe('+0.50 degrees every 10 years')
    setLang('es')
    expect(formatYm('2002-09')).toBe('sep 2002')
    expect(formatSlope(0.5, units, 'simple')).toBe('+0.50 degrees cada 10 años')
    expect(formatSlope(-0.5, units, 'scientific')).toBe('−0.50 °C por década')
  })
})

const cat = (n: string) => JSON.parse(readFileSync(`public/data/catalog/${n}.json`, 'utf8'))
const client: DataClient = {
  regions: async () => cat('regions'),
  themes: async () => cat('themes'),
  variables: async () => cat('variables'),
  glossary: async () => cat('glossary'),
  scan: async () => { throw new Error('unused') },
  result: async () => { throw new Error('unused') },
  analyze: async () => { throw new Error('unused') },
  customScan: async () => { throw new Error('unused') },
  customResult: async () => { throw new Error('unused') },
}

describe('language toggle', () => {
  beforeEach(() => {
    window.location.hash = ''
    localStorage.clear()
    setLang('en')
  })

  it('switches the page to Spanish, sets lang, and remembers the choice', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App client={client} />)
    const group = screen.getByRole('group', { name: 'Language' })
    const en = within(group).getByRole('button', { name: /English/ })
    const esBtn = within(group).getByRole('button', { name: /Español/ })
    expect(en).toHaveAttribute('aria-pressed', 'true')
    expect(esBtn).toHaveAttribute('aria-pressed', 'false')
    expect(esBtn).toHaveAttribute('lang', 'es')
    expect(await screen.findByRole('heading', { name: /Is the Earth changing where you live\?/ })).toBeInTheDocument()

    await user.click(esBtn)
    expect(getLang()).toBe('es')
    expect(document.documentElement.lang).toBe('es')
    expect(localStorage.getItem('td.lang')).toBe('es')
    expect(esBtn).toHaveAttribute('aria-pressed', 'true')
    // one whole screen, in Spanish
    expect(await screen.findByRole('heading', { name: '¿La Tierra está cambiando donde vives?' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Idioma' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Nivel de lectura' })).toBeInTheDocument()
    expect(screen.getByText('Detective de Tendencias del Sistema Tierra')).toBeInTheDocument()
    expect(screen.getByText('Saltar al contenido')).toBeInTheDocument()
    expect(screen.queryByText('Skip to content')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Lugares ya preparados' }))
    expect(screen.getAllByText(/Delhi, India/).length).toBeGreaterThan(0)
    expect(screen.getByRole('tab', { name: 'En el mapa' })).toBeInTheDocument()
    unmount()

    // a new visit starts in Spanish: the choice lives in the browser
    expect(localStorage.getItem('td.lang')).toBe('es')
    await act(async () => setLang('en'))
    expect(document.documentElement.lang).toBe('en')
  })
})
