import { useId, useRef, useState } from 'react'
import { useData } from '../context'
import { getLang } from '../i18n'
import { cleanText, keywordGuide, type GuideAnswer } from '../lib/guideKeywords'
import { useStartT } from '../lib/startT'
import { ThemeIcon } from './ThemeIcon'
import './GuideBox.css'

interface Props {
  /** open the question for the place chosen in step 1 */
  onAsk: (themeId: string) => void
}

type State = { status: 'idle' } | { status: 'loading' } | { status: 'done'; answer: GuideAnswer }

/** Step 2, "Or ask in your own words": a typed sentence -> a suggested question and the variables that can answer it. */
export function GuideBox({ onAsk }: Props) {
  const { catalog, client } = useData()
  const { s, tx } = useStartT()
  const [text, setText] = useState('')
  const [state, setState] = useState<State>({ status: 'idle' })
  const latest = useRef(0)
  const inputId = useId()

  const ask = async (e: React.FormEvent) => {
    e.preventDefault()
    const typed = cleanText(text)
    if (!typed) return
    const mine = ++latest.current
    setState({ status: 'loading' })
    let answer: GuideAnswer
    try {
      answer = client.guide ? await client.guide(typed, getLang()) : keywordGuide(typed, getLang(), catalog)
    } catch {
      answer = keywordGuide(typed, getLang(), catalog)
    }
    if (mine === latest.current) setState({ status: 'done', answer })
  }

  const answer = state.status === 'done' ? state.answer : null
  const theme = answer?.theme ? catalog.themes.find((t) => t.id === answer.theme) : undefined
  const vars = (answer?.variables ?? []).flatMap((id) => catalog.variables.filter((v) => v.id === id))

  return (
    <div className="guide-box">
      <form className="guide-form" onSubmit={ask}>
        <label htmlFor={inputId} className="guide-label">
          {s('guide.label', 'Or ask in your own words', 'Or describe your question')}
        </label>
        <div className="guide-row">
          <input
            id={inputId}
            type="text"
            className="guide-input"
            maxLength={300}
            autoComplete="off"
            value={text}
            placeholder={s('guide.placeholder', 'Try: Is there more smoke here?')}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="btn" disabled={!cleanText(text) || state.status === 'loading'}>
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
                  <button type="button" className="btn btn-primary" onClick={() => onAsk(theme.id)}>
                    {s('guide.open', 'Show me this question', 'Open this question')}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
