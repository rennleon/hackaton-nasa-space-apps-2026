import { useId, useRef, useState } from 'react'
import { useData } from '../context'
import { getLang, useT } from '../i18n'
import { searchPlaces, type GeoResult } from '../lib/geocode'
import { cleanText, keywordGuide, type GuideAnswer } from '../lib/guideKeywords'
import type { Chosen } from '../lib/places'
import { useStartT } from '../lib/startT'
import { PlaceIcon } from './PlaceIcons'
import { ThemeIcon } from './ThemeIcon'
import './GuideBox.css'

interface Props {
  /** the place already picked (a ready-made region or a custom place), or null */
  chosen: Chosen | null
  /** place search is available (it needs the live service) */
  canSearchPlace: boolean
  /** open the question for the chosen place */
  onAsk: (themeId: string) => void
  /** the place the user typed was found: pick it */
  onPlace: (r: GeoResult) => void
}

type State = { status: 'idle' } | { status: 'loading' } | { status: 'done'; answer: GuideAnswer }

/** "Ask the detective": a typed sentence -> a suggested question and the variables that can answer it. */
export function GuideBox({ chosen, canSearchPlace, onAsk, onPlace }: Props) {
  const { catalog, client } = useData()
  const { s, tx } = useStartT()
  const t = useT()
  const [text, setText] = useState('')
  const [state, setState] = useState<State>({ status: 'idle' })
  const [placeNote, setPlaceNote] = useState<'finding' | 'none' | null>(null)
  const latest = useRef(0)
  const inputId = useId()

  const ask = async (e: React.FormEvent) => {
    e.preventDefault()
    const typed = cleanText(text)
    if (!typed) return
    const mine = ++latest.current
    setState({ status: 'loading' })
    setPlaceNote(null)
    let answer: GuideAnswer
    try {
      answer = client.guide ? await client.guide(typed, getLang()) : keywordGuide(typed, getLang(), catalog)
    } catch {
      answer = keywordGuide(typed, getLang(), catalog)
    }
    if (mine === latest.current) setState({ status: 'done', answer })
  }

  const findPlace = async (name: string) => {
    setPlaceNote('finding')
    try {
      const found = await searchPlaces(name)
      if (found.length) {
        setPlaceNote(null)
        onPlace(found[0])
      } else setPlaceNote('none')
    } catch {
      setPlaceNote('none')
    }
  }

  const answer = state.status === 'done' ? state.answer : null
  const theme = answer?.theme ? catalog.themes.find((t) => t.id === answer.theme) : undefined
  const vars = (answer?.variables ?? []).flatMap((id) => catalog.variables.filter((v) => v.id === id))
  const hint = answer?.place_hint ?? null

  return (
    <section className="card guide-box" aria-labelledby={`${inputId}-h`}>
      <h2 id={`${inputId}-h`} className="guide-title">
        <PlaceIcon name="search" size={20} />
        {s('guide.title', 'Ask the detective', 'Describe what you want to investigate')}
      </h2>
      <form className="guide-form" onSubmit={ask}>
        <label htmlFor={inputId} className="guide-label">
          {s('guide.label', 'What do you want to find out?', 'Describe your question in a sentence')}
        </label>
        <div className="guide-row">
          <input
            id={inputId}
            type="text"
            className="guide-input"
            maxLength={300}
            autoComplete="off"
            value={text}
            placeholder={s('guide.placeholder', 'Try: Is there more smoke near my town?')}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={!cleanText(text) || state.status === 'loading'}>
            {state.status === 'loading' ? s('guide.thinking', 'Thinking…') : s('guide.ask', 'Ask')}
          </button>
        </div>
      </form>

      <div className="guide-result" aria-live="polite">
        {answer && (
          <>
            <p className="guide-reason">{answer.reason}</p>
            {theme && (
              <>
                <p className="guide-theme">
                  <span className="chip">
                    <ThemeIcon id={theme.id} parent={theme.parent} size={16} />
                    {tx(theme.name)}
                  </span>
                  <span>{tx(theme.question)}</span>
                </p>
                {vars.length > 0 && (
                  <div className="guide-vars">
                    <span className="guide-vars-label">{s('guide.vars', 'These can help:', 'Variables that can answer it:')}</span>
                    <ul>
                      {vars.map((v) => (
                        <li key={v.id} className="chip">
                          {tx(v.name)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="guide-actions">
                  {chosen ? (
                    <button type="button" className="btn btn-primary" onClick={() => onAsk(theme.id)}>
                      {s('guide.open', 'Show me this question', 'Open this question')}
                    </button>
                  ) : (
                    <>
                      {hint && canSearchPlace && (
                        <button type="button" className="btn btn-primary" disabled={placeNote === 'finding'} onClick={() => findPlace(hint)}>
                          {t('guide.usePlace', 'Use {place} as my place', { place: hint })}
                        </button>
                      )}
                      <p className="muted small">
                        {hint && !canSearchPlace
                          ? t('guide.hintOnly', 'You wrote {place}. Pick a place below, then ask this question.', { place: hint })
                          : s('guide.pickFirst', 'Pick a place below, then ask this question.')}
                      </p>
                    </>
                  )}
                  {placeNote === 'none' && <p className="error small">{s('guide.noPlace', 'We could not find that place. Pick one below.')}</p>}
                </div>
              </>
            )}
            <p className="guide-source muted small">
              {answer.source === 'llm' ? s('guide.source.llm', 'Suggested by an AI helper (Claude)') : s('guide.source.keywords', 'Matched by keywords')}
            </p>
          </>
        )}
      </div>
    </section>
  )
}
