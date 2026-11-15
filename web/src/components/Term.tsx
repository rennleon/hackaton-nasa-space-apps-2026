import { useId, useState, type ReactNode } from 'react'
import { useGlossary, useView } from '../context'
import { tx } from '../i18n'

/**
 * A glossary word: underlined, with its definition (for the active view) on hover, focus or tap.
 * The definition is always in the DOM and linked with aria-describedby; CSS shows or hides it.
 * Unknown ids render the plain text so a missing glossary entry never breaks a sentence.
 */
export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const glossary = useGlossary()
  const { view } = useView()
  const tipId = useId()
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const [tapped, setTapped] = useState(false)
  const entry = glossary.get(id)
  if (!entry) return <>{children ?? id}</>
  const open = hover || focus || tapped
  return (
    <span className="term-wrap" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        className="term"
        aria-describedby={tipId}
        aria-expanded={open}
        onFocus={() => setFocus(true)}
        onBlur={() => {
          setFocus(false)
          setTapped(false)
        }}
        onClick={() => setTapped((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setTapped(false)
            setHover(false)
          }
        }}
      >
        {children ?? tx(entry.term, view)}
      </button>
      <span role="tooltip" id={tipId} className="term-tip" data-open={open}>
        <strong>{tx(entry.term, view)}</strong>: {tx(entry.definition, view)}
      </span>
    </span>
  )
}
