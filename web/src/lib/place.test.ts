import { afterEach, describe, expect, it } from 'vitest'
import { formatPlace, parsePlace, placeRegion, validatePlace, wrapLon, type Place } from './place'
import { parseHash, toHash } from './route'
import { setLang } from '../i18n'
import { rememberPlaceName } from './placeNames'
import { chosenName } from './places'

describe('place encoding', () => {
  it('round-trips a point and a box', () => {
    const pt: Place = { kind: 'point', lat: -7.16, lon: -78.51 }
    const box: Place = { kind: 'box', w: -80, s: -8.5, e: -75, n: -5 }
    expect(formatPlace(pt)).toBe('pt:-7.16,-78.51')
    expect(formatPlace(box)).toBe('box:-80,-8.5,-75,-5')
    expect(parsePlace(formatPlace(pt))).toEqual(pt)
    expect(parsePlace(formatPlace(box))).toEqual(box)
  })
  it('rejects garbage and invalid places', () => {
    for (const bad of [null, '', 'pt:1', 'pt:a,b', 'box:1,2,3', 'pt:95,0', 'box:0,0,20,5', 'box:5,0,1,5']) expect(parsePlace(bad)).toBeNull()
  })
  it('survives the hash route unescaped', () => {
    const hash = toHash({ screen: 'shortlist', place: 'pt:-7.16,-78.51', theme: 'heat' })
    expect(hash).toBe('#/shortlist?place=pt:-7.16,-78.51&theme=heat')
    expect(parseHash(hash)).toEqual({ screen: 'shortlist', place: 'pt:-7.16,-78.51', theme: 'heat' })
    expect(parseHash('#/shortlist?place=box%3A-80%2C-9%2C-75%2C-5').place).toBe('box:-80,-9,-75,-5')
  })
  it('makes a custom region card', () => {
    const r = placeRegion({ kind: 'point', lat: 1, lon: 2 })
    expect(r.id.startsWith('custom_')).toBe(true)
    expect(r.name).toEqual({ simple: 'Your place', simple_es: 'Tu lugar', scientific: 'Point 1, 2' })
  })
})

describe('ready-made examples keep their own name', () => {
  const delhi: Place = { kind: 'point', lat: 28.61, lon: 77.21 }
  afterEach(() => setLang('en'))
  it('names an example point without any remembered name (shared link, demo, "Where else?")', () => {
    expect(placeRegion(delhi).name.simple).toBe('Delhi, India')
    expect(placeRegion(delhi).name.scientific).toContain('Delhi, India (Point 28.61, 77.21)')
    expect(placeRegion({ kind: 'point', lat: -3.1, lon: -60.02 }).name.simple).toBe('Amazon rainforest near Manaus, Brazil')
  })
  it('uses the Spanish name in Spanish, and ignores a stale remembered name', () => {
    rememberPlaceName(formatPlace(delhi), 'Your place')
    setLang('es')
    expect(placeRegion({ kind: 'point', lat: -3.1, lon: -60.02 }).name.simple).toBe('Selva amazónica cerca de Manaos, Brasil')
    expect(placeRegion(delhi).name.simple).toBe('Delhi, India')
  })
  it('chosenName gives the example name for a nameless point, but keeps a map pin as "Your place"', () => {
    expect(chosenName({ kind: 'place', place: delhi, name: null, viaMap: false }, '', 'Your place')).toBe('Delhi, India')
    expect(chosenName({ kind: 'place', place: { kind: 'point', lat: 1, lon: 2 }, name: null, viaMap: true }, '', 'Your place')).toBe('Your place')
  })
})

describe('validatePlace', () => {
  it('allows a box up to 10 x 10 degrees', () => {
    expect(validatePlace({ kind: 'box', w: 0, s: 0, e: 10, n: 10 })).toBeNull()
    expect(validatePlace({ kind: 'box', w: 0, s: 0, e: 10.01, n: 10 })).toBe('too_big')
    expect(validatePlace({ kind: 'box', w: 0, s: 0, e: 5, n: 10.5 })).toBe('too_big')
  })
  it('flags other problems', () => {
    expect(validatePlace({ kind: 'point', lat: NaN, lon: 0 })).toBe('not_numbers')
    expect(validatePlace({ kind: 'point', lat: 0, lon: 181 })).toBe('out_of_range')
    expect(validatePlace({ kind: 'box', w: 5, s: 0, e: 1, n: 1 })).toBe('corners_mixed_up')
  })
  it('wraps longitudes', () => {
    expect(wrapLon(190)).toBe(-170)
    expect(wrapLon(-190)).toBe(170)
    expect(wrapLon(45)).toBe(45)
  })
})
