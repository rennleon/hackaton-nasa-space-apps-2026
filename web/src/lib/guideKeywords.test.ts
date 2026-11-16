import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cleanPlace, keywordGuide, NO_MATCH, placeFromText } from './guideKeywords'

const read = (n: string) => JSON.parse(readFileSync(`public/data/catalog/${n}.json`, 'utf8'))
const cat = { themes: read('themes'), variables: read('variables'), glossary: read('glossary') }

describe('keywordGuide', () => {
  it.each([
    ['Is there more smoke from wildfires?', 'en', 'smoke_haze'],
    ['the air is hazy and smoky', 'en', 'smoke_haze'],
    ['are my nights getting warmer', 'en', 'warm_nights'],
    ['hot afternoons', 'en', 'hot_afternoons'],
    ['is it getting hotter', 'en', 'heat'],
    ['will there be drought? less rain', 'en', 'rain'],
    ['humid and damp', 'en', 'damp_air'],
    ['my family farm and crops', 'en', 'soil'],
    ['cars and burning fuel', 'en', 'burning_fuel'],
    ['hay más humo en el aire', 'es', 'smoke_haze'],
    ['¿Hay más calor?', 'es', 'heat'],
    ['la sequía y la lluvia', 'es', 'rain'],
    ['las noches', 'es', 'warm_nights'],
    ['las tardes calurosas', 'es', 'hot_afternoons'],
    ['el suelo de mi chacra', 'es', 'soil'],
    ['what about NO2', 'en', 'burning_fuel'],
  ])('%s (%s) -> %s', (text, lang, theme) => {
    const out = keywordGuide(text, lang, cat)
    expect(out.theme).toBe(theme)
    expect(out.source).toBe('keywords')
    expect(out.variables.length).toBeGreaterThanOrEqual(1)
    expect(out.variables.length).toBeLessThanOrEqual(4)
    for (const id of out.variables) expect(cat.variables.find((v: { id: string }) => v.id === id)?.themes[theme]).toBeTruthy()
  })

  it('says so when nothing matches, in the right language', () => {
    expect(keywordGuide('zzz qqq', 'en', cat)).toMatchObject({ theme: null, variables: [], reason: NO_MATCH.en })
    expect(keywordGuide('zzz qqq', 'es', cat).reason).toBe(NO_MATCH.es)
  })

  it('writes the reason in Spanish for es', () => {
    expect(keywordGuide('más humo', 'es', cat).reason).toContain('Elige un lugar')
    expect(keywordGuide('more smoke', 'en', cat).reason).toContain('Pick a place')
  })

  it('finds a typed place name, never coordinates', () => {
    expect(keywordGuide('more smoke in Cajamarca', 'en', cat).place_hint).toBe('Cajamarca')
    expect(keywordGuide('más humo en Lima Norte', 'es', cat).place_hint).toBe('Lima Norte')
    expect(placeFromText('smoke in the summer')).toBeNull()
    expect(cleanPlace('12.5, -77')).toBeNull()
  })
})
