import { useEffect } from 'react'
import { MapContainer, Rectangle, TileLayer, Tooltip, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { RegionCard } from '../types/catalog'
import { useView } from '../context'

const toBounds = (r: RegionCard): [[number, number], [number, number]] => {
  const [w, s, e, n] = r.geometry.bbox
  return [
    [s, w],
    [n, e],
  ]
}

function Fit({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 9 })
  }, [map, bounds])
  return null
}

interface Props {
  regions: RegionCard[]
  selectedId?: string
  onSelect?: (id: string) => void
  /** show only these ids (default all) */
  visibleIds?: string[]
  className?: string
}

/** Leaflet map with each region drawn as a rectangle. Region lists next to it give the keyboard route. */
export function RegionMap({ regions, selectedId, onSelect, visibleIds, className }: Props) {
  const { t } = useView()
  const shown = visibleIds ? regions.filter((r) => visibleIds.includes(r.id)) : regions
  const fitSet = selectedId ? shown.filter((r) => r.id === selectedId) : shown
  const all = (fitSet.length ? fitSet : shown).flatMap(toBounds)
  const bounds: LatLngBoundsExpression = all.length ? all : [[-60, -180], [80, 180]]
  return (
    <div className={className ?? 'map'}>
      <MapContainer bounds={bounds} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }} aria-label="Map of regions">
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Fit bounds={bounds} />
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
              eventHandlers={onSelect ? { click: () => onSelect(r.id) } : undefined}
            >
              <Tooltip sticky>{t(r.name)}</Tooltip>
            </Rectangle>
          )
        })}
      </MapContainer>
    </div>
  )
}
