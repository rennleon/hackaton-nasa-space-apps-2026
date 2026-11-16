import { useEffect, useRef, useState } from 'react'
import { useData } from '../context'
import { getLang } from '../i18n'
import { formatPlace } from '../lib/place'
import { chosenBbox, chosenName, type Chosen } from '../lib/places'
import { useStartT } from '../lib/startT'
import type { SuggestAnswer } from '../data/client'
import { ThemeIcon } from './ThemeIcon'
import './SuggestedQuestions.css'

interface Props {
  /** the place picked in step 1 */
  chosen: Chosen
  /** open this question (theme id) for the chosen place */
  onAsk: (themeId: string) => void
}

type State = { status: 'loading' } | { status: 'done'; answer: SuggestAnswer } | { status: 'none' }

/** The place's identity (not the object's), so a re-render with the same place never asks again. */
function placeKey(c: Chosen): string {
  return c.kind === 'region' ? `region:${c.region.id}` : `place:${formatPlace(c.place)}:${c.name ?? ''}`
}

/** Step 2: questions an AI helper suggests for this kind of place, as buttons. Renders nothing without suggestions. */
export function SuggestedQuestions({ chosen, onAsk }: Props) {
  const { catalog, client } = useData()
  const { s, tx } = useStartT()
  const [state, setState] = useState<State>({ status: 'loading' })
  const latest = useRef(0)

  // the display name the question is asked with: the region's name, a real place name, or null for an unnamed pin
  const name = chosenName(chosen, chosen.kind === 'region' ? tx(chosen.region.name) : '', '') || null
  const nameRef = useRef(name)
  nameRef.current = name
  const chosenRef = useRef(chosen)
  chosenRef.current = chosen
  const lang = getLang()
  const key = `${placeKey(chosen)}|${lang}`

  useEffect(() => {
    const mine = ++latest.current
    const suggest = client.suggest?.bind(client)
    if (!suggest) {
      setState({ status: 'none' })
      return
    }
    setState({ status: 'loading' })
    const [w, so, e, n] = chosenBbox(chosenRef.current)
    const round = (x: number) => Math.round(x * 1e4) / 1e4
    suggest({ place: nameRef.current, lat: round((so + n) / 2), lon: round((w + e) / 2) }, lang)
      .then((answer) => {
        if (mine === latest.current) setState({ status: 'done', answer })
      })
      .catch(() => {
        if (mine === latest.current) setState({ status: 'none' })
      })
    return () => {
      // a newer place (or unmount) makes this answer stale
      latest.current++ // eslint-disable-line react-hooks/exhaustive-deps -- a counter, not a DOM node
    }
    // `key` stands for the place and language; the client is stable for the session
  }, [key, client]) // eslint-disable-line react-hooks/exhaustive-deps

  if (state.status === 'loading') {
    return (
      <p className="suggest-thinking muted small" aria-live="polite">
        {s('suggest.thinking', 'Thinking about your place…')}
      </p>
    )
  }
  if (state.status === 'none' || state.answer.source !== 'llm') return null
  const items = state.answer.suggestions.flatMap((sg) => {
    const theme = catalog.themes.find((th) => th.id === sg.theme)
    return theme ? [{ theme, why: sg.why?.trim() || null }] : []
  })
  if (!items.length) return null

  return (
    <section className="suggest" aria-labelledby="suggest-h">
      <h3 id="suggest-h" className="suggest-title">
        {name
          ? s('suggest.title', 'Ideas for {place}', 'Suggested questions for {place}', { place: name })
          : s('suggest.titleHere', 'Ideas for this place', 'Suggested questions for this place')}
      </h3>
      <ul className="suggest-list">
        {items.map(({ theme, why }) => (
          <li key={theme.id}>
            <button type="button" className="suggest-btn" data-demo={`suggest-${theme.id}`} onClick={() => onAsk(theme.id)}>
              <span className="suggest-icon">
                <ThemeIcon id={theme.id} parent={theme.parent} size={20} />
              </span>
              <span className="suggest-text">
                <span className="suggest-q">{tx(theme.question)}</span>
                {why && <span className="suggest-why muted small">{why}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="suggest-source muted small">{s('guide.source.llm', 'Suggested by an AI helper (Claude)')}</p>
    </section>
  )
}
