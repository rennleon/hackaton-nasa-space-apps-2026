import { forwardRef } from 'react'
import { useData } from '../context'
import { chosenBbox, chosenName, sizeParts, type Chosen } from '../lib/places'
import { useStartT } from '../lib/startT'
import { ThemeIcon } from './ThemeIcon'
import './StartQuestions.css'

interface Props {
  chosen: Chosen
  onAsk: (themeId: string) => void
  onChange: () => void
}

/** Step 2 on the start page: the chosen place with its size, then the three questions. */
export const StartQuestions = forwardRef<HTMLElement, Props>(function StartQuestions({ chosen, onAsk, onChange }, ref) {
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
    <section ref={ref} tabIndex={-1} className="start-questions card" aria-labelledby="sq-h" aria-live="polite">
      <div className="sq-head">
        <div>
          <p className="sq-eyebrow">{s('start.place.eyebrow', 'Your place', 'Selected place')}</p>
          <h2 id="sq-h">{name}</h2>
          <p className="muted small">
            {sizeLine}
            {detail && <span className="sq-coords"> {detail}</span>}
          </p>
        </div>
        <button type="button" className="link" onClick={onChange}>
          {s('start.place.change', 'Pick a different place', 'Change place')}
        </button>
      </div>
      <h3 className="sq-ask">{s('start.question.title', 'What do you want to know?', 'Choose a question')}</h3>
      <ul className="sq-grid">
        {catalog.themes.map((th) => (
          <li key={th.id} data-demo={`question-${th.id}`}>
            <button type="button" className="sq-card" onClick={() => onAsk(th.id)}>
              <span className="sq-icon">
                <ThemeIcon id={th.id} />
              </span>
              <span className="sq-name">{tx(th.name)}</span>
              <span className="sq-q">{tx(th.question)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
})
