import { forwardRef } from 'react'
import { useData } from '../context'
import { chosenBbox, chosenName, sizeParts, type Chosen } from '../lib/places'
import { useStartT } from '../lib/startT'
import { topLevel } from '../lib/themes'
import { GuideBox } from './GuideBox'
import { SubTopicRow } from './SubTopicRow'
import { PlaceIcon } from './PlaceIcons'
import { ThemeIcon } from './ThemeIcon'
import './StartQuestions.css'

/** Tile colour per question (never the only signal: the icon and the name come with it). */
const TONE: Record<string, string> = { heat: 'tone-warm', water: 'tone-blue', air: 'tone-gray' }

interface Props {
  chosen: Chosen
  onAsk: (themeId: string) => void
  onChange: () => void
}

/** Step 2 of the start card: the chosen place with its size, then the three main questions, each with its narrower ones. The ref goes to the place heading, which takes focus when a place is chosen. */
export const StartQuestions = forwardRef<HTMLHeadingElement, Props>(function StartQuestions({ chosen, onAsk, onChange }, ref) {
  const { catalog } = useData()
  const { s, tx } = useStartT()
  const name = chosenName(chosen, chosen.kind === 'region' ? tx(chosen.region.name) : '', s('start.place.yours', 'Your place', 'Custom place'))
  const size = sizeParts(chosenBbox(chosen))
  const sizeLine =
    chosen.kind === 'place' && chosen.place.kind === 'point'
      ? s('start.area.pinShort', 'We look at a square about {w} × {h} km around it.', 'One NASA POWER grid cell, drawn as about {w} × {h} km.', size)
      : s('start.area.size', 'This area is about {w} × {h} km.', 'Area: about {w} × {h} km.', size)
  const detail = chosen.kind === 'place' && chosen.name && chosen.place.kind === 'point' ? `${chosen.place.lat}, ${chosen.place.lon}` : null
  return (
    <div className="start-questions">
      <div className="sq-head">
        <div>
          <p className="eyebrow">{s('start.place.eyebrow', 'Your place', 'Selected place')}</p>
          <h2 ref={ref} tabIndex={-1} id="sq-h" className="sq-place">
            {name}
          </h2>
          <p className="muted small">
            {sizeLine}
            {detail && <span className="sq-coords"> {detail}</span>}
          </p>
        </div>
        <button type="button" className="btn" onClick={onChange}>
          <PlaceIcon name="back" size={16} />
          {s('start.place.change', 'Pick a different place', 'Change place')}
        </button>
      </div>
      <h3 className="sq-ask">{s('start.question.title', 'What do you want to know?', 'Choose a question')}</h3>
      <GuideBox onAsk={onAsk} />
      <ul className="sq-grid">
        {topLevel(catalog.themes).map((th) => (
          <li key={th.id}>
            <button type="button" className="sq-card" data-demo={`question-${th.id}`} onClick={() => onAsk(th.id)}>
              <span className={`tile ${TONE[th.id] ?? 'tone-gray'}`}>
                <ThemeIcon id={th.id} size={22} />
              </span>
              <span className="sq-name">{tx(th.name)}</span>
              <span className="sq-q">{tx(th.question)}</span>
            </button>
            <SubTopicRow parentId={th.id} onPick={onAsk} />
          </li>
        ))}
      </ul>
    </div>
  )
})
