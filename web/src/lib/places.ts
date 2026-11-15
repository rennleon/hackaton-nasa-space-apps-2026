// The start screen's idea of "a chosen place": a pre-loaded region or a live point/box, with its real name,
// the size of its area, the ready-made examples, and the route that opens the findings.
import { formatPlace, placeBbox, type Place } from './place'
import { rememberPlaceName } from './placeNames'
import type { Route } from './route'
import type { RegionCard } from '../types/catalog'
import { numberLocale } from './startT'
import { exampleAt, exampleName } from './examples'

export type Chosen =
  | { kind: 'region'; region: RegionCard }
  /** `name` is null for a pin or box the child placed on the map ("Your place"). `viaMap` keeps the map view still. */
  | { kind: 'place'; place: Place; name: string | null; viaMap: boolean }

export { EXAMPLE_PLACES, exampleAt, exampleName, type ExamplePlace } from './examples'

/** A named live point: remembers its name so the next screens can show it. */
export function namedPoint(lat: number, lon: number, name: string): Chosen {
  const place: Place = { kind: 'point', lat, lon }
  rememberPlaceName(formatPlace(place), name)
  return { kind: 'place', place, name, viaMap: false }
}

const KM_PER_DEG = 111.32

/** Width and height in km of a [W,S,E,N] box (width shrinks with latitude). */
export function bboxSizeKm([w, s, e, n]: [number, number, number, number]): { width: number; height: number } {
  const midLat = ((s + n) / 2) * (Math.PI / 180)
  return { width: Math.abs(e - w) * KM_PER_DEG * Math.cos(midLat), height: Math.abs(n - s) * KM_PER_DEG }
}

/** Near numbers, not false precision: 55, 110, 1,200. */
export function roundKm(km: number): number {
  const step = km < 100 ? 5 : km < 1000 ? 10 : 50
  return Math.max(step, Math.round(km / step) * step)
}

/** The two numbers of a size line, formatted for the active language. */
export function sizeParts(bbox: [number, number, number, number]): { w: string; h: string } {
  const { width, height } = bboxSizeKm(bbox)
  const f = (km: number) => roundKm(km).toLocaleString(numberLocale())
  return { w: f(width), h: f(height) }
}

export function chosenBbox(c: Chosen): [number, number, number, number] {
  return c.kind === 'region' ? c.region.geometry.bbox : placeBbox(c.place)
}

/** Name to show: the region's name (passed in), a remembered real name, or the fallback ("Your place"). */
export function chosenName(c: Chosen, regionName: string, fallback: string): string {
  if (c.kind === 'region') return regionName
  // a point that is one of the ready-made examples always carries the example's own name, however it was opened
  const ex = exampleAt(c.place)
  return ex ? exampleName(ex) : (c.name ?? fallback)
}

/** Where a question leads: the existing findings route, for a region or a place. */
export function routeFor(c: Chosen, theme: string): Route {
  return c.kind === 'region'
    ? { screen: 'shortlist', region: c.region.id, theme }
    : { screen: 'shortlist', place: formatPlace(c.place), theme }
}
