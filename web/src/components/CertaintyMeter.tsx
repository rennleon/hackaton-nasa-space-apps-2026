import { CERTAINTY_CANT_TELL, CERTAINTY_STEPS, COPY, type Certainty } from '../lib/copy'
import { useResultCopy } from '../lib/resultCopy'
import type { Verdict } from '../types/contract'
import { Icon } from './ResultIcons'

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
 * Compact "how sure are we" meter for list cards. Every step has an icon and a word, so colour is never the only signal.
 * The active step carries aria-current="step". "cant_tell" is a separate, distinct state.
 * (The result page uses the larger VerdictGauge.)
 */
export function CertaintyMeter({ certainty, compact = false }: { certainty: Certainty; compact?: boolean }) {
  const { c } = useResultCopy()
  if (certainty === 'cant_tell') {
    return (
      <p className={`meter meter-cant${compact ? ' meter-compact' : ''}`} role="status" aria-label={c('result.gauge.label', COPY.meterLabel)}>
        <Icon name={CERTAINTY_CANT_TELL.icon} size={18} className="meter-icon" /> <strong>{c('result.gauge.cant', CERTAINTY_CANT_TELL.text)}</strong>
      </p>
    )
  }
  return (
    <ol className={`meter${compact ? ' meter-compact' : ''}`} aria-label={c('result.gauge.label', COPY.meterLabel)}>
      {CERTAINTY_STEPS.map((s) => {
        const active = s.id === certainty
        return (
          <li key={s.id} className={`meter-step meter-${s.id}${active ? ' active' : ''}`} aria-current={active ? 'step' : undefined}>
            <Icon name={s.icon} size={16} className="meter-icon" />{' '}
            <span className={compact && !active ? 'visually-hidden' : undefined}>{c(`result.gauge.${s.id}`, s.text)}</span>
          </li>
        )
      })}
    </ol>
  )
}
