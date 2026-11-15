import { demoById } from '../lib/demos'
import { useResultCopy } from '../lib/resultCopy'

export function DemoOverlay({ demoId, step, onStep, onExit }: { demoId: string; step: number; onStep: (i: number) => void; onExit: () => void }) {
  const { s, c } = useResultCopy()
  const demo = demoById(demoId)
  if (!demo) return null
  const at = Math.min(step, demo.steps.length - 1)
  const current = demo.steps[at]
  const last = step >= demo.steps.length - 1
  return (
    <aside className="demo" role="region" aria-label={s('demo.aria', 'Demo walkthrough')} aria-live="polite">
      <p className="demo-title">{c(`demo.${demo.id}.title`, demo.title)}</p>
      <p>{c(`demo.${demo.id}.step${at}`, current.caption)}</p>
      <div className="row">
        <button type="button" className="btn" disabled={step <= 0} onClick={() => onStep(step - 1)}>
          {s('demo.back', 'Back')}
        </button>
        <span className="muted small">
          {step + 1} / {demo.steps.length}
        </span>
        {last ? (
          <button type="button" className="btn btn-primary" onClick={onExit}>
            {s('demo.finish', 'Finish')}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => onStep(step + 1)}>
            {s('demo.next', 'Next')}
          </button>
        )}
        <button type="button" className="link" onClick={onExit}>
          {s('demo.exit', 'Exit demo')}
        </button>
      </div>
    </aside>
  )
}
