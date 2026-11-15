import { useStartT } from '../lib/startT'
import { EXAMPLE_PLACES, type ExamplePlace } from '../lib/places'
import type { RegionCard } from '../types/catalog'
import { PlaceIcon, type PlaceIconName } from './PlaceIcons'
import './ReadyPlaces.css'

type Tone = 'blue' | 'gray' | 'green' | 'warm'
/** Icon tile per kind of place: pre-loaded region (blue), city (grey), rainforest (green), desert (warm). */
const EXAMPLE_LOOK: Record<string, { icon: PlaceIconName; tone: Tone }> = {
  delhi: { icon: 'city', tone: 'gray' },
  manaus: { icon: 'forest', tone: 'green' },
  tamanrasset: { icon: 'sun', tone: 'warm' },
}
const regionIcon = (id: string): PlaceIconName => (id === 'wisconsin' ? 'leaf' : 'mountain')

interface Props {
  /** pre-loaded regions, already filtered to `listed !== false` */
  regions: RegionCard[]
  /** live example points need the live service */
  liveOff?: boolean
  selectedId?: string
  onRegion: (r: RegionCard) => void
  onExample: (e: ExamplePlace) => void
}

/** The ready-made places as a grid of cards: the pre-loaded regions (every listed catalog region) plus three live example points. */
export function ReadyPlaces({ regions, liveOff, selectedId, onRegion, onExample }: Props) {
  const { s, tx, view } = useStartT()
  return (
    <div className="ready">
      <p className="ready-intro">{s('start.ready.intro', 'Places we already checked. Pick one to start right away.', 'Pre-loaded regions work offline. The three examples come from NASA POWER.')}</p>
      <ul className="ready-row">
        {regions.map((r) => (
          <li key={r.id} className={selectedId === r.id ? 'ready-card is-selected' : 'ready-card'} data-demo={`ready-${r.id}`}>
            <button type="button" onClick={() => onRegion(r)} aria-pressed={selectedId === r.id}>
              <span className="tile tone-blue">
                <PlaceIcon name={regionIcon(r.id)} />
              </span>
              <span className="ready-tag">{view === 'simple' ? s('start.ready.saved', 'Ready to go') : r.regime}</span>
              <span className="ready-name">{tx(r.name)}</span>
              <span className="ready-caption">{tx(r.description)}</span>
            </button>
          </li>
        ))}
        {EXAMPLE_PLACES.map((e) => (
          <li key={e.id} className="ready-card" data-demo={`ready-${e.id}`}>
            <button type="button" onClick={() => onExample(e)} disabled={liveOff}>
              <span className={`tile tone-${EXAMPLE_LOOK[e.id]?.tone ?? 'gray'}`}>
                <PlaceIcon name={EXAMPLE_LOOK[e.id]?.icon ?? 'pin'} />
              </span>
              <span className="ready-tag">{s(`start.example.${e.id}.tag`, e.tag.simple, e.tag.scientific)}</span>
              <span className="ready-name">{s(`start.example.${e.id}.name`, e.name)}</span>
              <span className="ready-caption">{s(`start.example.${e.id}.caption`, e.caption.simple, e.caption.scientific)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
