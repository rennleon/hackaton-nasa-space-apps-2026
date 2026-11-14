import { demoById } from '../lib/demos'
import { useView } from '../context'

export function DemoOverlay({ demoId, step, onStep, onExit }: { demoId: string; step: number; onStep: (i: number) => void; onExit: () => void }) {
  const { t } = useView()
  const demo = demoById(demoId)
  if (!demo) return null
  const s = demo.steps[Math.min(step, demo.steps.length - 1)]
  const last = step >= demo.steps.length - 1
  return (
    <aside className="demo" role="region" aria-label="Demo walkthrough" aria-live="polite">
      <p className="demo-title">{t(demo.title)}</p>
      <p>{t(s.caption)}</p>
      <div className="row">
        <button type="button" className="btn" disabled={step <= 0} onClick={() => onStep(step - 1)}>
          Back
        </button>
        <span className="muted small">
          {step + 1} / {demo.steps.length}
        </span>
        {last ? (
          <button type="button" className="btn btn-primary" onClick={onExit}>
            Finish
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => onStep(step + 1)}>
            Next
          </button>
        )}
        <button type="button" className="link" onClick={onExit}>
          Exit demo
        </button>
      </div>
    </aside>
  )
}
