// A user-chosen place (NASA POWER point or box): parsing, formatting, validation, and a synthetic region card
// so the existing screens can treat it like a pre-loaded region.
import type { RegionCard } from '../types/catalog'
import { recallPlaceName } from './placeNames'
import { exampleAt, exampleName } from './examples'

export type Place = { kind: 'point'; lat: number; lon: number } | { kind: 'box'; w: number; s: number; e: number; n: number }

/** NASA POWER regional limit, in degrees per side. */
export const MAX_BOX_DEG = 10

export type PlaceProblem = 'not_numbers' | 'out_of_range' | 'corners_mixed_up' | 'too_big'

const num = (x: number) => String(Number(x.toFixed(4)))

/** `pt:lat,lon` or `box:W,S,E,N`, used in the hash route. */
export function formatPlace(p: Place): string {
  return p.kind === 'point' ? `pt:${num(p.lat)},${num(p.lon)}` : `box:${[p.w, p.s, p.e, p.n].map(num).join(',')}`
}

/** Inverse of formatPlace. Returns null for anything malformed or invalid. */
export function parsePlace(text: string | null | undefined): Place | null {
  if (!text) return null
  const m = /^(pt|box):(.+)$/.exec(text)
  if (!m) return null
  const parts = m[2].split(',')
  if (parts.length !== (m[1] === 'pt' ? 2 : 4)) return null
  if (!parts.every((s) => /^-?\d+(\.\d+)?$/.test(s.trim()))) return null
  const v = parts.map(Number)
  const place: Place = m[1] === 'pt' ? { kind: 'point', lat: v[0], lon: v[1] } : { kind: 'box', w: v[0], s: v[1], e: v[2], n: v[3] }
  return validatePlace(place) ? null : place
}

/** Returns the problem, or null when the place is fine (box at most 10° x 10°). */
export function validatePlace(p: Place): PlaceProblem | null {
  const vals = p.kind === 'point' ? [p.lat, p.lon] : [p.w, p.s, p.e, p.n]
  if (!vals.every(Number.isFinite)) return 'not_numbers'
  const latOk = (v: number) => v >= -90 && v <= 90
  const lonOk = (v: number) => v >= -180 && v <= 180
  if (p.kind === 'point') return latOk(p.lat) && lonOk(p.lon) ? null : 'out_of_range'
  if (!latOk(p.s) || !latOk(p.n) || !lonOk(p.w) || !lonOk(p.e)) return 'out_of_range'
  if (!(p.w < p.e) || !(p.s < p.n)) return 'corners_mixed_up'
  if (p.e - p.w > MAX_BOX_DEG || p.n - p.s > MAX_BOX_DEG) return 'too_big'
  return null
}

/** Bounding box [W,S,E,N] for drawing a place; a point gets a small square. */
export function placeBbox(p: Place): [number, number, number, number] {
  return p.kind === 'box' ? [p.w, p.s, p.e, p.n] : [p.lon - 0.25, p.lat - 0.25, p.lon + 0.25, p.lat + 0.25]
}

export function placeScientificName(p: Place): string {
  return p.kind === 'point' ? `Point ${num(p.lat)}, ${num(p.lon)}` : `Custom box ${num(p.w)}–${num(p.e)}, ${num(p.s)}–${num(p.n)}`
}

/** A RegionCard for a custom place, so screens can reuse their region code paths. */
export function placeRegion(p: Place): RegionCard {
  const sci = placeScientificName(p)
  const key = formatPlace(p)
  // a ready-made example always has its own name (EN/ES); a searched place keeps the name it was remembered under
  const ex = exampleAt(p)
  const named = ex ? exampleName(ex) : recallPlaceName(key)
  return {
    id: `custom_${key.replace(/[^0-9a-z.-]+/gi, '_')}`,
    name: { simple: named ?? 'Your place', scientific: named ? `${named} (${sci})` : sci },
    description: { simple: 'The place you picked.', scientific: `${sci} (NASA POWER).` },
    regime: '',
    geometry: { kind: 'bbox', bbox: placeBbox(p) },
    comparison_region: null,
    listed: false,
    declared_seasons: [],
  }
}

/** Wraps a longitude that Leaflet reports after the map was dragged around the world. */
export const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180

/** Size and side (as the child sees them) to a signed number. Empty or negative sizes give NaN. */
export function toSigned(size: string, negative: boolean): number {
  if (!size.trim()) return NaN
  const n = Number(size)
  if (!Number.isFinite(n) || n < 0) return NaN
  return negative ? -n : n
}

/** Signed number to a size string and a side (south and west are negative). */
export function fromSigned(v: number): { size: string; negative: boolean } {
  return { size: String(Math.round(Math.abs(v) * 100) / 100), negative: v < 0 }
}
