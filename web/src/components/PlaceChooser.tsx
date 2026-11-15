import { useCallback, useMemo, useState } from 'react'
import { useData } from '../context'
import { fromSigned, placeBbox, placeRegion, toSigned, validatePlace, wrapLon, type Place, type PlaceProblem } from '../lib/place'
import { sizeParts, type Chosen } from '../lib/places'
import { useStartT } from '../lib/startT'
import type { RegionCard } from '../types/catalog'
import { CLIMATE_LAYERS, bboxKey, layerById, type Bbox, type ClimateLayerId } from '../lib/climate'
import { ClimateCells } from './ClimateCells'
import { ClimateLegend, useClimateWords } from './ClimateLegend'
import { RegionMap } from './RegionMap'
import { useClimateGrid } from './useClimateGrid'
import './PlaceChooser.css'

type Mode = 'point' | 'box'
type Axis = 'lat' | 'lon'
const FIELDS: Record<Mode, [key: string, axis: Axis][]> = {
  point: [['lat', 'lat'], ['lon', 'lon']],
  box: [['w', 'lon'], ['s', 'lat'], ['e', 'lon'], ['n', 'lat']],
}
const AXIS_MAX = { lat: 90, lon: 180 } as const

/** What the child fills in: a size per field plus which side (south and west are the negative sides). */
type Fields = { size: Record<string, string>; neg: Record<string, boolean> }
const EMPTY: Fields = { size: {}, neg: {} }

const fromSignedMap = (v: Record<string, number>): Fields => {
  const f: Fields = { size: {}, neg: {} }
  for (const [k, x] of Object.entries(v)) {
    const s = fromSigned(x)
    f.size[k] = s.size
    f.neg[k] = s.negative
  }
  return f
}

function toPlace(mode: Mode, f: Fields): Place {
  const n = (k: string) => toSigned(f.size[k] ?? '', f.neg[k] ?? false)
  return mode === 'point' ? { kind: 'point', lat: n('lat'), lon: n('lon') } : { kind: 'box', w: n('w'), s: n('s'), e: n('e'), n: n('n') }
}

interface Props {
  regions: RegionCard[]
  chosen: Chosen | null
  /** live places are off (no API configured) */
  disabled?: boolean
  /** a pin, a box, or typed coordinates; `viaMap` is true for map clicks */
  onPlace: (place: Place, viaMap: boolean) => void
}

/** The map (click for a pin, click two corners for a box) plus an "Enter coordinates" disclosure. */
export function PlaceChooser({ regions, chosen, disabled, onPlace }: Props) {
  const { s } = useStartT()
  const { client } = useData()
  const off = disabled ?? client.customPlaces === false
  const [mode, setMode] = useState<Mode>('point')
  const [vals, setVals] = useState<Fields>(EMPTY)
  const [corner, setCorner] = useState<{ lat: number; lon: number } | null>(null)
  const [mapProblem, setMapProblem] = useState<PlaceProblem | null>(null)
  // "Where does it happen?": shade the map by a long-term average so the child picks a spot inside one colour
  const [layerId, setLayerId] = useState<ClimateLayerId | null>(null)
  const [view, setView] = useState<Bbox | null>(null)
  const onViewChange = useCallback((b: Bbox) => setView((prev) => (prev && bboxKey(prev) === bboxKey(b) ? prev : b)), [])
  const layer = layerId ? layerById(layerId) : null
  const { grid, status } = useClimateGrid(client, layer, view)
  const { words } = useClimateWords()

  const touched = FIELDS[mode].some(([k]) => vals.size[k]?.trim())
  const typed = toPlace(mode, vals)
  const typedProblem: PlaceProblem | null = touched ? validatePlace(typed) : 'not_numbers'
  const problemText = (p: PlaceProblem) =>
    ({
      not_numbers: s('start.coords.badNumbers', 'Please type a number in every box.', 'Enter a number in every field.'),
      out_of_range: s('start.coords.outOfRange', 'Those numbers are not on Earth. Check them.', 'Out of range: latitude −90…90, longitude −180…180.'),
      corners_mixed_up: s('start.coords.corners', 'The corners are mixed up. West must be left of east.', 'Requires W < E and S < N.'),
      too_big: s('start.coords.tooBig', 'That area is too big. Pick a smaller one.', 'Box exceeds 10° × 10° (NASA POWER regional limit).'),
    })[p]

  const switchMode = (m: Mode) => {
    setMode(m)
    setVals(EMPTY)
    setCorner(null)
    setMapProblem(null)
  }

  const onMapClick = (latRaw: number, lonRaw: number) => {
    const lat = Math.max(-90, Math.min(90, latRaw))
    const lon = wrapLon(lonRaw)
    setMapProblem(null)
    if (mode === 'point') {
      setVals(fromSignedMap({ lat, lon }))
      onPlace({ kind: 'point', lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 }, true)
    } else if (!corner) {
      setCorner({ lat, lon })
      setVals(EMPTY)
    } else {
      const box: Place = { kind: 'box', w: Math.min(lon, corner.lon), e: Math.max(lon, corner.lon), s: Math.min(lat, corner.lat), n: Math.max(lat, corner.lat) }
      setCorner(null)
      const problem = validatePlace(box)
      if (problem) {
        setMapProblem(problem)
        return
      }
      setVals(fromSignedMap({ w: box.w, s: box.s, e: box.e, n: box.n }))
      onPlace(box, true)
    }
  }

  // Outline of what is chosen. A pin from the map is drawn as a marker plus its square, so a pin never turns
  // into a box without being shown; other choices zoom the map to a selected rectangle instead.
  const drawn = chosen?.kind === 'place' ? chosen : null
  const synthetic = useMemo(() => (drawn && !drawn.viaMap ? placeRegion(drawn.place) : null), [drawn])
  const mapRegions = synthetic ? [...regions, synthetic] : regions
  const selectedId = chosen?.kind === 'region' ? chosen.region.id : synthetic?.id
  const draft = drawn
    ? {
        bbox: placeBbox(drawn.place),
        isPoint: !drawn.viaMap && drawn.place.kind === 'point',
        center: drawn.place.kind === 'point' ? ([drawn.place.lat, drawn.place.lon] as [number, number]) : undefined,
      }
    : null
  const help = mode === 'point' ? s('start.map.helpPoint', 'Tap the map to drop a pin.', 'Click the map to set a point.') : corner ? s('start.map.helpBox2', 'Now tap the opposite corner.', 'Click the opposite corner.') : s('start.map.helpBox1', 'Tap one corner of your box.', 'Click the first corner of the box.')
  const size = drawn ? sizeParts(placeBbox(drawn.place)) : null

  return (
    <div className="chooser">
      <div className="chooser-bar">
        <div role="group" aria-label={s('start.map.mode', 'How to pick', 'Selection mode')} className="tabs">
          {(['point', 'box'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => switchMode(m)} disabled={off}>
              {m === 'point' ? s('start.map.pin', 'Drop a pin', 'Point') : s('start.map.box', 'Draw a box', 'Box')}
            </button>
          ))}
        </div>
        <p className="muted chooser-help" aria-live="polite">
          {off ? s('start.map.off', 'Choosing any place needs our live service. Try a ready-made place.', 'Custom places require the API (VITE_API_URL not set).') : help}
        </p>
      </div>
      <div role="group" aria-label={s('start.clim.group', 'Colour the map', 'Map layer')} className="chooser-layers tabs">
        {CLIMATE_LAYERS.map((l) => (
          <button key={l.id} type="button" aria-pressed={layerId === l.id} onClick={() => setLayerId(layerId === l.id ? null : l.id)}>
            {words[l.id].toggle}
          </button>
        ))}
      </div>
      <RegionMap
        regions={mapRegions}
        selectedId={selectedId}
        className="map map-home"
        autoFit={!drawn?.viaMap}
        onMapClick={off ? undefined : onMapClick}
        draft={draft}
        pending={corner ? [corner.lat, corner.lon] : null}
        onViewChange={onViewChange}
      >
        {layer && grid && <ClimateCells layer={layer} grid={grid} />}
      </RegionMap>
      {layer && <ClimateLegend layer={layer} grid={grid} status={status} />}
      {mapProblem && (
        <p role="alert" className="error">
          {problemText(mapProblem)}
        </p>
      )}
      {drawn && size && (
        <p className="area-note">
          {drawn.place.kind === 'point'
            ? s('start.area.pin', 'Your pin covers a square about {w} × {h} km. That is the smallest area our data can see.', 'Point: the drawn square (about {w} × {h} km) is one NASA POWER grid cell.', size)
            : s('start.area.box', 'Your box is about {w} × {h} km.', 'Box: about {w} × {h} km.', size)}
        </p>
      )}

      <details className="coords">
        <summary>{s('start.coords.summary', 'Enter coordinates', 'Enter coordinates')}</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!typedProblem && !off) onPlace(typed, false)
          }}
        >
          <div className="coords-grid">
            {FIELDS[mode].map(([k, axis]) => {
              const label = {
                lat: mode === 'point' ? s('start.coords.lat', 'Latitude (north–south)', 'Latitude') : '',
                lon: mode === 'point' ? s('start.coords.lon', 'Longitude (east–west)', 'Longitude') : '',
                w: s('start.coords.w', 'West edge (east–west)', 'West longitude'),
                s: s('start.coords.s', 'South edge (north–south)', 'South latitude'),
                e: s('start.coords.e', 'East edge (east–west)', 'East longitude'),
                n: s('start.coords.n', 'North edge (north–south)', 'North latitude'),
              }[k]
              const plus = axis === 'lat' ? s('start.coords.north', 'North', 'N') : s('start.coords.east', 'East', 'E')
              const minus = axis === 'lat' ? s('start.coords.south', 'South', 'S') : s('start.coords.west', 'West', 'W')
              return (
                <div key={k} className="coords-field">
                  <span className="coords-label">{label}</span>
                  <div className="coords-inputs">
                    <input
                      type="number"
                      min={0}
                      max={AXIS_MAX[axis]}
                      step="any"
                      inputMode="decimal"
                      disabled={off}
                      aria-label={`${label}: ${s('start.coords.number', 'Number', 'Degrees')}`}
                      value={vals.size[k] ?? ''}
                      onChange={(e) => setVals({ ...vals, size: { ...vals.size, [k]: e.target.value } })}
                    />
                    <select
                      disabled={off}
                      aria-label={`${label}: ${s('start.coords.side', 'Which side', 'Hemisphere')}`}
                      value={vals.neg[k] ? 'minus' : 'plus'}
                      onChange={(e) => setVals({ ...vals, neg: { ...vals.neg, [k]: e.target.value === 'minus' } })}
                    >
                      <option value="plus">{plus}</option>
                      <option value="minus">{minus}</option>
                    </select>
                  </div>
                </div>
              )
            })}
          </div>
          {!off && touched && typedProblem && (
            <p role="alert" className="error">
              {problemText(typedProblem)}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={!!typedProblem || off}>
            {s('start.coords.use', 'Use these numbers', 'Use these coordinates')}
          </button>
        </form>
      </details>
    </div>
  )
}
