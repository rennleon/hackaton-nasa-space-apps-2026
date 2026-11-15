// The ready-made example places. Kept apart from places.ts so place.ts can name a point that matches one
// without an import cycle (this file only needs the Place type).
import type { Place } from './place'
import { t } from '../i18n'

export interface ExamplePlace {
  id: string
  name: string
  /** English defaults; screens pass them through the translation helper under `start.example.<id>.*` */
  tag: { simple: string; scientific: string }
  caption: { simple: string; scientific: string }
  lat: number
  lon: number
}

/** User-approved example points. Their results are precomputed from NASA POWER data (static files in `public/data/results/ex_<id>/`). */
export const EXAMPLE_PLACES: ExamplePlace[] = [
  {
    id: 'delhi',
    name: 'Delhi, India',
    tag: { simple: 'Big city', scientific: 'Megacity' },
    caption: { simple: 'A huge city, full of people and buildings.', scientific: 'Dense urban area, northern India.' },
    lat: 28.61,
    lon: 77.21,
  },
  {
    id: 'manaus',
    name: 'Amazon rainforest near Manaus, Brazil',
    tag: { simple: 'Rainforest', scientific: 'Tropical rainforest' },
    caption: { simple: 'Thick green forest. Warm all year, with a wetter and a drier season.', scientific: 'Equatorial rainforest, central Amazon basin.' },
    lat: -3.1,
    lon: -60.02,
  },
  {
    id: 'tamanrasset',
    name: 'Sahara desert near Tamanrasset, Algeria',
    tag: { simple: 'Desert', scientific: 'Hot desert' },
    caption: { simple: 'A huge hot desert. Very little rain, mostly in summer.', scientific: 'Hyper-arid Saharan highland, southern Algeria.' },
    lat: 22.79,
    lon: 5.52,
  },
]

/** The example's name in the active language (the same `start.example.<id>.name` key the start screen uses). */
export function exampleName(e: ExamplePlace): string {
  return t(`start.example.${e.id}.name`, e.name)
}

/** The ready-made example at (about) this point, if any: its precomputed files live under `results/ex_<id>/`. */
export function exampleAt(place: Place): ExamplePlace | undefined {
  if (place.kind !== 'point') return undefined
  return EXAMPLE_PLACES.find((e) => Math.abs(e.lat - place.lat) < 0.05 && Math.abs(e.lon - place.lon) < 0.05)
}
