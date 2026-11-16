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
  { id: 'water', param: 'PRECTOTCORR', colors: ['#dde8f8', '#b4d0e6', '#6baed6', '#3182bd', '#08519c'], breaks: [0.5, 1.5, 3, 5], decimals: 1 },
  { id: 'air', param: 'AOD_55', colors: ['#e6e0f2', '#c3bfde', '#9e9ac8', '#756bb1', '#54278f'], breaks: [0.1, 0.2, 0.3, 0.45], decimals: 2 },
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
 * Kept for views up to 10 degrees across; wider views use `climateWindows`.
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

/** NASA POWER answers at most 10 degrees a side per request. */
export const CLIMATE_WINDOW_DEG = 10
/** Wider than this (either way) and the map is too far out to colour: we ask the child to zoom in. */
export const CLIMATE_MAX_SPAN = 25

export const climateTooFar = ([w, s, e, n]: Bbox) => Math.max(e - w, n - s) > CLIMATE_MAX_SPAN

/**
 * The 1 to 4 boxes (10 degrees a side at most) to ask for when the map shows `view`. A view up to 10 degrees
 * across gets one box (centred on `focus` when the pin or box the child chose is in view, else on the view); a
 * wider view gets two adjacent boxes on that axis, so at most 2 x 2. Tiled edges sit on multiples of 5 degrees,
 * so small pans ask for the same boxes again (and the cache answers).
 * `focus` is [lon, lat].
 */
export function climateWindows(view: Bbox, focus?: [number, number] | null): Bbox[] {
  const [w, s, e, n] = view
  const inView = !!focus && focus[0] >= w && focus[0] <= e && focus[1] >= s && focus[1] <= n
  const wrap = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180 // the map can be panned past the date line
  const cx = wrap(inView ? focus![0] : (w + e) / 2)
  const cy = inView ? focus![1] : (s + n) / 2
  const axis = (c: number, lo: number, hi: number, min: number, max: number): [number, number][] => {
    const span = hi - lo
    if (span <= CLIMATE_WINDOW_DEG) return [fit(c, inView ? CLIMATE_WINDOW_DEG / 2 : Math.min(5, Math.max(1, span / 2)), min, max)]
    const m = Math.min(max - CLIMATE_WINDOW_DEG, Math.max(min + CLIMATE_WINDOW_DEG, Math.round(c / 5) * 5))
    return [
      [m - CLIMATE_WINDOW_DEG, m],
      [m, m + CLIMATE_WINDOW_DEG],
    ]
  }
  const out: Bbox[] = []
  for (const [W, E] of axis(cx, w, e, -180, 180)) for (const [S, N] of axis(cy, s, n, -90, 90)) out.push([W, S, E, N])
  return out
}

/** Merge grids of one layer (cells de-duplicated by position). Null when there is nothing to merge. */
export function mergeGrids(grids: ClimateGrid[]): ClimateGrid | null {
  if (!grids.length) return null
  const seen = new Set<string>()
  const cells: ClimateGrid['cells'] = []
  for (const g of grids)
    for (const c of g.cells) {
      const k = `${c[0]},${c[1]}`
      if (!seen.has(k)) {
        seen.add(k)
        cells.push(c)
      }
    }
  return { ...grids[0], cells }
}

/** Do the cells reach (within `tol` degrees) every edge of what the map shows, as far as the world goes? */
export function gridCovers(grid: ClimateGrid, [vw, vs, ve, vn]: Bbox, tol = 1): boolean {
  if (!grid.cells.length) return false
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  for (const [lon, lat] of grid.cells) {
    const [[a, b], [c, d]] = cellBounds(lon, lat, grid.cell_deg)
    s = Math.min(s, a)
    w = Math.min(w, b)
    n = Math.max(n, c)
    e = Math.max(e, d)
  }
  return w <= Math.max(vw, -180) + tol && e >= Math.min(ve, 180) - tol && s <= Math.max(vs, -90) + tol && n >= Math.min(vn, 90) - tol
}

export const bboxKey = (b: Bbox) => b.map((x) => x.toFixed(2)).join(',')
