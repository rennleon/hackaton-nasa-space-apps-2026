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
              <CardBody
                icon={regionIcon(r.id)}
                tone="blue"
                tag={view === 'simple' ? s('start.ready.saved', 'Ready to go') : r.regime}
                name={tx(r.name)}
                caption={tx(r.description)}
                source={s('start.ready.src.saved', 'Saved NASA data', 'Pre-loaded · works offline')}
              />
            </button>
          </li>
        ))}
        {EXAMPLE_PLACES.map((e) => (
          <li key={e.id} className="ready-card" data-demo={`ready-${e.id}`}>
            <button type="button" onClick={() => onExample(e)} disabled={liveOff}>
              <CardBody
                icon={EXAMPLE_LOOK[e.id]?.icon ?? 'pin'}
                tone={EXAMPLE_LOOK[e.id]?.tone ?? 'gray'}
                tag={s(`start.example.${e.id}.tag`, e.tag.simple, e.tag.scientific)}
                name={s(`start.example.${e.id}.name`, e.name)}
                caption={s(`start.example.${e.id}.caption`, e.caption.simple, e.caption.scientific)}
                source={s('start.ready.src.live', 'Live NASA data', 'NASA POWER · live')}
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One card: icon tile with the category beside it, the name, a short caption (long ones are clamped; the full
 *  text stays in the page and shows on hover), and a footer with where the data comes from. */
function CardBody({ icon, tone, tag, name, caption, source }: { icon: PlaceIconName; tone: Tone; tag: string; name: string; caption: string; source: string }) {
  return (
    <>
      <span className="ready-top">
        <span className={`tile tone-${tone}`}>
          <PlaceIcon name={icon} />
        </span>
        <span className={`ready-tag tone-${tone}`}>{tag}</span>
      </span>
      <span className="ready-name">{name}</span>
      <span className="ready-caption" title={caption}>
        {caption}
      </span>
      <span className="ready-foot">
        <span className="ready-src">{source}</span>
        <svg className="ready-go" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </>
  )
}
