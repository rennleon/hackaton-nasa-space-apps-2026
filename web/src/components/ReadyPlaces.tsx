import { useStartT } from '../lib/startT'
import { EXAMPLE_PLACES, type ExamplePlace } from '../lib/places'
import type { RegionCard } from '../types/catalog'
import './ReadyPlaces.css'

interface Props {
  /** pre-loaded regions, already filtered to `listed !== false` */
  regions: RegionCard[]
  /** live example points need the live service */
  liveOff?: boolean
  selectedId?: string
  onRegion: (r: RegionCard) => void
  onExample: (e: ExamplePlace) => void
}

/** A row of ready-made places: the pre-loaded regions (every listed catalog region) plus three live example points. */
export function ReadyPlaces({ regions, liveOff, selectedId, onRegion, onExample }: Props) {
  const { s, tx, view } = useStartT()
  return (
    <section aria-labelledby="ready-h" className="ready">
      <h2 id="ready-h">{s('start.ready.title', 'Or try a ready-made place', 'Ready-made places')}</h2>
      <ul className="ready-row">
        {regions.map((r) => (
          <li key={r.id} className={selectedId === r.id ? 'ready-card is-selected' : 'ready-card'} data-demo={`ready-${r.id}`}>
            <button type="button" onClick={() => onRegion(r)} aria-pressed={selectedId === r.id}>
              <span className="ready-tag">{view === 'simple' ? s('start.ready.saved', 'Ready to go') : r.regime}</span>
              <span className="ready-name">{tx(r.name)}</span>
              <span className="ready-caption">{tx(r.description)}</span>
            </button>
          </li>
        ))}
        {EXAMPLE_PLACES.map((e) => (
          <li key={e.id} className="ready-card" data-demo={`ready-${e.id}`}>
            <button type="button" onClick={() => onExample(e)} disabled={liveOff}>
              <span className="ready-tag">{s(`start.example.${e.id}.tag`, e.tag.simple, e.tag.scientific)}</span>
              <span className="ready-name">{s(`start.example.${e.id}.name`, e.name)}</span>
              <span className="ready-caption">{s(`start.example.${e.id}.caption`, e.caption.simple, e.caption.scientific)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
