import { useL, type FKey } from '../lib/findingsCopy'
import type { Certainty } from '../lib/findings'
import './VerdictChip.css'

const ICON: Record<Certainty, React.ReactNode> = {
  // check mark
  sure: <path d="M4.5 8.5l2.4 2.4 4.6-5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  // half-filled circle
  maybe: <path d="M8 3.2a4.8 4.8 0 0 1 0 9.6z" fill="currentColor" />,
  // clock hands
  too_soon: <path d="M8 4.6V8l2.3 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  // question mark
  cant_tell: <path d="M6.2 6.3a1.9 1.9 0 1 1 2.7 1.7c-.6.3-.9.7-.9 1.4M8 11.6v.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
}

/** The small round icon of a verdict (decorative: the word always sits next to it). */
export function CertaintyIcon({ certainty, size = 16 }: { certainty: Certainty; size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeDasharray={certainty === 'cant_tell' ? '2.2 2' : undefined} />
      {ICON[certainty]}
    </svg>
  )
}

/** One verdict per card: icon + word, never colour alone. Grey too soon, amber maybe, teal sure, dashed can't tell. */
export function VerdictChip({ certainty }: { certainty: Certainty }) {
  const l = useL()
  return (
    <span className={`vchip vchip-${certainty}`}>
      <CertaintyIcon certainty={certainty} />
      {l(`findings.chip.${certainty}` as FKey)}
    </span>
  )
}
