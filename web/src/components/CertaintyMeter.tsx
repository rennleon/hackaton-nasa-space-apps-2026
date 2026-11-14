import { useView } from '../context'
import { CERTAINTY_CANT_TELL, CERTAINTY_STEPS, COPY, type Certainty } from '../lib/copy'
import type { Verdict } from '../types/contract'

/** Verdict label -> meter step (used on shortlist cards, which carry verdict_label). */
export function certaintyOf(label: Verdict['label']): Certainty {
  switch (label) {
    case 'significant':
      return 'sure'
    case 'significant_fragile':
    case 'borderline':
      return 'maybe'
    case 'cant_tell':
      return 'cant_tell'
    default:
      return 'too_soon'
  }
}

/**
 * Three-step "how sure are we" meter. Every step has an icon and a word, so colour is never the only signal.
 * The active step carries aria-current="step". "cant_tell" is a separate, distinct state.
 */
export function CertaintyMeter({ certainty, compact = false }: { certainty: Certainty; compact?: boolean }) {
  const { t } = useView()
  if (certainty === 'cant_tell') {
    return (
      <p className={`meter meter-cant${compact ? ' meter-compact' : ''}`} role="status" aria-label={t(COPY.meterLabel)}>
        <span aria-hidden="true" className="meter-icon">
          {CERTAINTY_CANT_TELL.icon}
        </span>{' '}
        <strong>{t(CERTAINTY_CANT_TELL.text)}</strong>
      </p>
    )
  }
  return (
    <ol className={`meter${compact ? ' meter-compact' : ''}`} aria-label={t(COPY.meterLabel)}>
      {CERTAINTY_STEPS.map((s) => {
        const active = s.id === certainty
        return (
          <li key={s.id} className={`meter-step meter-${s.id}${active ? ' active' : ''}`} aria-current={active ? 'step' : undefined}>
            <span aria-hidden="true" className="meter-icon">
              {s.icon}
            </span>{' '}
            <span className={compact && !active ? 'visually-hidden' : undefined}>{t(s.text)}</span>
          </li>
        )
      })}
    </ol>
  )
}
