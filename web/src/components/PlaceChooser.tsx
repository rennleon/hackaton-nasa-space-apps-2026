import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useData } from '../context'
import { placeBbox, placeRegion, validatePlace, wrapLon, type Place, type PlaceProblem } from '../lib/place'
import { sizeParts, type Chosen } from '../lib/places'
import { useStartT } from '../lib/startT'
import type { RegionCard } from '../types/catalog'
import { CLIMATE_LAYERS, bboxKey, climateTooFar, gridCovers, layerById, type Bbox, type ClimateLayerId } from '../lib/climate'
import { ClimateCells } from './ClimateCells'
import { ClimateLegend, useClimateWords } from './ClimateLegend'
import { useProblemText } from './CoordsForm'
import { RegionMap } from './RegionMap'
import { useClimateGrid } from './useClimateGrid'
import './PlaceChooser.css'

type Mode = 'point' | 'box'
interface Props {
  regions: RegionCard[]
  chosen: Chosen | null
  /** live places are off (no API configured) */
  disabled?: boolean
  /** a pin or a box drawn on the map */
  onPlace: (place: Place) => void
  /** shown at the end of the bar above the map (the "Use this spot" button) */
  action?: ReactNode
}

/** The map: click for a pin, or click two corners for a box. Typed numbers live in `CoordsForm`. */
export function PlaceChooser({ regions, chosen, disabled, onPlace, action }: Props) {
  const { s } = useStartT()
  const { client } = useData()
  const off = disabled ?? client.customPlaces === false
  const [mode, setMode] = useState<Mode>('point')
  const [corner, setCorner] = useState<{ lat: number; lon: number } | null>(null)
  const [mapProblem, setMapProblem] = useState<PlaceProblem | null>(null)
  // "Where does it happen?": shade the map by a long-term average so the child picks a spot inside one colour
  const [layerId, setLayerId] = useState<ClimateLayerId | null>(null)
  const [view, setView] = useState<Bbox | null>(null)
  const onViewChange = useCallback((b: Bbox) => setView((prev) => (prev && bboxKey(prev) === bboxKey(b) ? prev : b)), [])
  const layer = layerId ? layerById(layerId) : null
  const [fly, setFly] = useState<{ center: [number, number]; token: number } | null>(null)
  const { words } = useClimateWords()

  const problemText = useProblemText()

  const switchMode = (m: Mode) => {
    setMode(m)
    setCorner(null)
    setMapProblem(null)
  }

  // turning a colour on while the map shows the whole world: fly in to where the child is looking or has pointed
  const toggleLayer = (id: ClimateLayerId) => {
    setLayerId(layerId === id ? null : id)
    if (layerId !== id && view && climateTooFar(view)) setFly((f) => ({ center: focusLatLon ?? [(view[1] + view[3]) / 2, (view[0] + view[2]) / 2], token: (f?.token ?? 0) + 1 }))
  }

  const onMapClick = (latRaw: number, lonRaw: number) => {
    const lat = Math.max(-90, Math.min(90, latRaw))
    const lon = wrapLon(lonRaw)
    setMapProblem(null)
    if (mode === 'point') {
      onPlace({ kind: 'point', lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 })
    } else if (!corner) {
      setCorner({ lat, lon })
    } else {
      const box: Place = { kind: 'box', w: Math.min(lon, corner.lon), e: Math.max(lon, corner.lon), s: Math.min(lat, corner.lat), n: Math.max(lat, corner.lat) }
      setCorner(null)
      const problem = validatePlace(box)
      if (problem) {
        setMapProblem(problem)
        return
      }
      onPlace(box)
    }
  }

  // Outline of what is chosen. A pin from the map is drawn as a marker plus its square, so a pin never turns
  // into a box without being shown; other choices zoom the map to a selected rectangle instead.
  const drawn = chosen?.kind === 'place' ? chosen : null
  // the colours follow the pin or box the child chose (or the first corner of a box in the making)
  const focusLatLon: [number, number] | null = corner
    ? [corner.lat, corner.lon]
    : drawn
      ? (([w, s, e, n]) => [(s + n) / 2, (w + e) / 2] as [number, number])(placeBbox(drawn.place))
      : null
  const focus: [number, number] | null = focusLatLon ? [focusLatLon[1], focusLatLon[0]] : null
  const { grid, status } = useClimateGrid(client, layer, view, focus)
  const partial = !!(grid && view && !gridCovers(grid, view))
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
        {action && <div className="chooser-action">{action}</div>}
      </div>
      <div role="group" aria-label={s('start.clim.group', 'Colour the map', 'Map layer')} className="chooser-layers tabs">
        {CLIMATE_LAYERS.map((l) => (
          <button key={l.id} type="button" aria-pressed={layerId === l.id} onClick={() => toggleLayer(l.id)}>
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
        flyTo={fly}
      >
        {layer && grid && <ClimateCells layer={layer} grid={grid} />}
      </RegionMap>
      {layer && <ClimateLegend layer={layer} grid={grid} status={status} partial={partial} />}
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
    </div>
  )
}
