// "Where does it happen?": the long-term-average layers that shade the place-chooser map.
// Pure helpers: which parameter shows which question, the colour classes, and the request window.

export type Bbox = [number, number, number, number] // W, S, E, N

/** NASA POWER climatology parameters we draw. T2M and PRECTOTCORR are MERRA-2; AOD_55 is CERES SYN1deg. */
export type ClimateParam = 'T2M' | 'PRECTOTCORR' | 'AOD_55'

/** What /climatology/grid and the precomputed files return. `cell_deg` is [latitude, longitude] size of one cell. */
export interface ClimateGrid {
  param: ClimateParam
  units: string
  source: string
  /** [lon, lat, value] at each cell centre */
  cells: [number, number, number][]
  cell_deg: [number, number]
}

export type ClimateLayerId = 'heat' | 'water' | 'air'

export interface ClimateLayer {
  id: ClimateLayerId
  param: ClimateParam
  /** five sequential, colour-blind-safe classes (ColorBrewer Blues, YlOrRd, Purples), light to dark */
  colors: string[]
  /** four thresholds between the five classes, in the layer's own unit; fixed so colours mean the same everywhere */
  breaks: number[]
  decimals: number
}

export const CLIMATE_LAYERS: ClimateLayer[] = [
  { id: 'heat', param: 'T2M', colors: ['#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026'], breaks: [0, 10, 20, 27], decimals: 0 },
  { id: 'water', param: 'PRECTOTCORR', colors: ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c'], breaks: [0.5, 1.5, 3, 5], decimals: 1 },
  { id: 'air', param: 'AOD_55', colors: ['#f2f0f7', '#cbc9e2', '#9e9ac8', '#756bb1', '#54278f'], breaks: [0.1, 0.2, 0.3, 0.45], decimals: 2 },
]

export const layerById = (id: ClimateLayerId): ClimateLayer => CLIMATE_LAYERS.find((l) => l.id === id)!

/** 0..4: how many thresholds the value has reached. */
export function classOf(layer: ClimateLayer, value: number): number {
  return layer.breaks.filter((b) => value >= b).length
}

/** [lon, lat] cell centre and size -> Leaflet bounds [[S, W], [N, E]]. */
export function cellBounds(lon: number, lat: number, [dLat, dLon]: [number, number]): [[number, number], [number, number]] {
  return [
    [lat - dLat / 2, lon - dLon / 2],
    [lat + dLat / 2, lon + dLon / 2],
  ]
}

/** `half` degrees either side of `c`, on whole degrees, kept inside [min, max] without changing the width. */
function fit(c: number, half: number, min: number, max: number): [number, number] {
  let a = Math.floor(c - half)
  let b = Math.ceil(c + half)
  if (b - a > 10) {
    a = Math.round(c) - 5
    b = a + 10
  }
  if (a < min) {
    b = Math.min(max, b + (min - a))
    a = min
  }
  if (b > max) {
    a = Math.max(min, a - (b - max))
    b = max
  }
  return [a, b]
}

/**
 * The box to ask NASA POWER for when the map shows `view`: centred on the view, snapped to whole degrees (so
 * panning a little reuses the same request and the same cached file), and between 2 and 10 degrees a side.
 */
export function climateWindow(view: Bbox): Bbox {
  const [w, s, e, n] = view
  const cx = ((((w + e) / 2 + 180) % 360) + 360) % 360 - 180 // the map can be panned past the date line
  const cy = (s + n) / 2
  const half = (lo: number, hi: number) => Math.min(5, Math.max(1, (hi - lo) / 2))
  const [W, E] = fit(cx, half(w, e), -180, 180)
  const [S, N] = fit(cy, half(s, n), -90, 90)
  return [W, S, E, N]
}

export const bboxKey = (b: Bbox) => b.map((x) => x.toFixed(2)).join(',')
