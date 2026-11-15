import { CERTAINTY_CANT_TELL, CERTAINTY_STEPS, COPY, type Certainty } from '../lib/copy'
import { useResultCopy } from '../lib/resultCopy'
import { Icon } from './ResultIcons'
import './VariableView.css'

/**
 * "How sure are we?" as one 3-step gauge with a single marker (Too soon, Maybe, Sure).
 * Each step has an icon and a word, so colour is never the only signal. "We can't tell here" is a separate dashed state.
 */
export function VerdictGauge({ certainty }: { certainty: Certainty }) {
  const { c } = useResultCopy()
  const label = c('result.gauge.label', COPY.meterLabel)
  if (certainty === 'cant_tell') {
    return (
      <p className="gauge-cant" role="status" aria-label={label}>
        <Icon name={CERTAINTY_CANT_TELL.icon} size={28} />
        <strong>{c('result.gauge.cant', CERTAINTY_CANT_TELL.text)}</strong>
      </p>
    )
  }
  const at = CERTAINTY_STEPS.findIndex((s) => s.id === certainty)
  return (
    <div className="gauge" data-step={certainty} data-demo="gauge">
      <div className="gauge-track" aria-hidden="true">
        {CERTAINTY_STEPS.map((s, i) => (
          <span key={s.id} className={`gauge-seg gauge-${s.id}${i === at ? ' on' : ''}`} />
        ))}
        <span className="gauge-marker" style={{ left: `${((at * 2 + 1) / 6) * 100}%` }} />
      </div>
      <ol className="gauge-steps" aria-label={label}>
        {CERTAINTY_STEPS.map((s, i) => (
          <li key={s.id} className={`gauge-step gauge-${s.id}${i === at ? ' on' : ''}`} aria-current={i === at ? 'step' : undefined}>
            <Icon name={s.icon} size={i === at ? 26 : 20} />
            <span>{c(`result.gauge.${s.id}`, s.text)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
