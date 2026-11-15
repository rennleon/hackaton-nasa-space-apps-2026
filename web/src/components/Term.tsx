import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useGlossary, useView } from '../context'
import { tx } from '../i18n'
import { capFirst } from '../lib/text'

/**
 * A glossary word: underlined, with its definition (for the active view) on hover, focus or tap.
 * The definition is always in the DOM and linked with aria-describedby; CSS shows or hides it.
 * `cap` capitalises the shown word when it starts a sentence. Unknown ids render the plain text so a missing glossary entry never breaks a sentence.
 */
export function Term({ id, children, cap = false }: { id: string; children?: ReactNode; cap?: boolean }) {
  const glossary = useGlossary()
  const { view } = useView()
  const tipId = useId()
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const [tapped, setTapped] = useState(false)
  const entry = glossary.get(id)
  const open = hover || focus || tapped
  const tipRef = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)
  // keep the note inside the screen: slide it left (or right) by the amount it would stick out
  useLayoutEffect(() => {
    const el = tipRef.current
    if (!open || !el) return
    const r = el.getBoundingClientRect()
    if (r.width === 0) return
    const vw = document.documentElement.clientWidth
    const edge = 8
    const base = r.left - shift
    let next = 0
    if (base + r.width > vw - edge) next = vw - edge - (base + r.width)
    if (base + next < edge) next = edge - base
    if (Math.abs(next - shift) > 0.5) setShift(next)
  }, [open, shift])
  if (!entry) return <>{children ?? id}</>
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
        {children ?? (cap ? capFirst(tx(entry.term, view)) : tx(entry.term, view))}
      </button>
      <span ref={tipRef} role="tooltip" id={tipId} className="term-tip" data-open={open} style={shift ? { marginLeft: shift } : undefined}>
        <strong>{tx(entry.term, view)}</strong>: {tx(entry.definition, view)}
      </span>
    </span>
  )
}
