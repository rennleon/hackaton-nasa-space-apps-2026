import { useEffect } from 'react'
import { CircleMarker, MapContainer, Rectangle, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { RegionCard } from '../types/catalog'
import { useView } from '../context'
import { useT } from '../i18n'

const toBounds = (r: RegionCard): [[number, number], [number, number]] => {
  const [w, s, e, n] = r.geometry.bbox
  return [
    [s, w],
    [n, e],
  ]
}

function Fit({ bounds, enabled }: { bounds: LatLngBoundsExpression; enabled: boolean }) {
  const map = useMap()
  // refit only when the bounds really change, so a click or re-render never resets the child's zoom and pan
  const key = JSON.stringify(bounds)
  useEffect(() => {
    if (enabled) map.fitBounds(JSON.parse(key) as LatLngBoundsExpression, { padding: [30, 30], maxZoom: 9 })
  }, [map, key, enabled])
  return null
}

function Clicks({ onClick }: { onClick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) })
  return null
}

interface Props {
  regions: RegionCard[]
  selectedId?: string
  onSelect?: (id: string) => void
  /** show only these ids (default all) */
  visibleIds?: string[]
  className?: string
  /** place-picking mode: map clicks are reported and regions stop reacting to clicks */
  onMapClick?: (lat: number, lon: number) => void
  /** the place being chosen: a box [W,S,E,N], or a point (center) */
  draft?: { bbox: [number, number, number, number]; isPoint: boolean; center?: [number, number] } | null
  /** first corner of a box, waiting for the second click */
  pending?: [number, number] | null
  /** false keeps the view where the child left it (default true) */
  autoFit?: boolean
}

/** Leaflet map with each region drawn as a rectangle. Region lists next to it give the keyboard route. */
export function RegionMap({ regions, selectedId, onSelect, visibleIds, className, onMapClick, draft, pending, autoFit }: Props) {
  const { t } = useView()
  const tt = useT()
  const shown = visibleIds ? regions.filter((r) => visibleIds.includes(r.id)) : regions
  const fitSet = selectedId ? shown.filter((r) => r.id === selectedId) : shown
  const all = (fitSet.length ? fitSet : shown).flatMap(toBounds)
  const bounds: LatLngBoundsExpression = all.length ? all : [[-60, -180], [80, 180]]
  return (
    <div className={className ?? 'map'}>
      <MapContainer bounds={bounds} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }} aria-label={tt('map.aria', 'Map of regions')}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Fit bounds={bounds} enabled={autoFit !== false} />
        {onMapClick && <Clicks onClick={onMapClick} />}
        {draft && !draft.isPoint && <Rectangle bounds={[[draft.bbox[1], draft.bbox[0]], [draft.bbox[3], draft.bbox[2]]]} pathOptions={{ color: '#d9480f', weight: 3, fillOpacity: 0.25 }} />}
        {draft?.center && <CircleMarker center={draft.center} radius={9} pathOptions={{ color: '#d9480f', fillColor: '#d9480f', fillOpacity: 0.8 }} />}
        {pending && <CircleMarker center={pending} radius={6} pathOptions={{ color: '#d9480f', fillOpacity: 0.8 }} />}
        {shown.map((r) => {
          const selected = r.id === selectedId
          return (
            <Rectangle
              key={r.id}
              bounds={toBounds(r)}
              pathOptions={{
                color: selected ? '#d9480f' : '#1c6ea4',
                weight: selected ? 3 : 2,
                dashArray: selectedId && !selected ? '6 6' : undefined,
                fillOpacity: selected ? 0.25 : 0.12,
              }}
              interactive={!onMapClick}
              eventHandlers={onSelect && !onMapClick ? { click: () => onSelect(r.id) } : undefined}
            >
              <Tooltip sticky>{t(r.name)}</Tooltip>
            </Rectangle>
          )
        })}
      </MapContainer>
    </div>
  )
}
