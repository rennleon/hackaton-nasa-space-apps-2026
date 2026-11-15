import { Rectangle, Tooltip } from 'react-leaflet'
import { cellBounds, classOf, type ClimateGrid, type ClimateLayer } from '../lib/climate'
import { useClimateWords } from './ClimateLegend'

/**
 * The long-term average drawn as one semi-transparent rectangle per NASA POWER grid cell, inside a RegionMap.
 * Pointing at (or tapping) a cell says what it is: a word in the Simple view, the number in the Scientific view.
 */
export function ClimateCells({ layer, grid }: { layer: ClimateLayer; grid: ClimateGrid }) {
  const { cellText } = useClimateWords()
  return (
    <>
      {grid.cells.map(([lon, lat, v]) => (
        <Rectangle
          key={`${lon},${lat}`}
          bounds={cellBounds(lon, lat, grid.cell_deg)}
          pathOptions={{ stroke: false, fillColor: layer.colors[classOf(layer, v)], fillOpacity: 0.62 }}
        >
          <Tooltip sticky>{cellText(layer, v)}</Tooltip>
        </Rectangle>
      ))}
    </>
  )
}
