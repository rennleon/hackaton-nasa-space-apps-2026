import type { AnalysisResult } from '../types/contract'
import { useResultCopy } from '../lib/resultCopy'
import { VerdictChip } from './VerdictChip'
import './YourYears.css'

const yrs = (r: AnalysisResult) => (r.window ? { from: r.window.start.slice(0, 4), to: r.window.end.slice(0, 4) } : null)

/**
 * Typed-in years are the user's own choice. Choosing a window after looking at the data is the classic way to
 * find a trend that is not there (start/end-point sensitivity, Liebmann et al. 2010), so the page labels the
 * result as "your years" and shows the declared default window's answer right beside it. The declared window
 * stays the reference; this box never changes either verdict.
 */
export function YourYears({ mine, declared }: { mine: AnalysisResult; declared: AnalysisResult | null | undefined }) {
  const { s } = useResultCopy()
  const a = yrs(mine)
  const b = declared ? yrs(declared) : null
  if (!a) return null
  const same = declared ? declared.verdict.certainty === mine.verdict.certainty : false
  return (
    <section className="your-years" aria-label={s('result.yours.aria', 'Your years and all the years')} data-testid="your-years">
      <p className="your-years-title">
        <strong>{s('result.yours.title', 'You picked these years.', 'User-chosen window')}</strong>
      </p>
      <ul className="your-years-rows">
        <li>
          <span>{s('result.yours.mine', 'Your years ({from} to {to}):', 'Your window ({from} to {to}):', a)}</span>
          <VerdictChip certainty={mine.verdict.certainty} />
        </li>
        {declared && b && (
          <li>
            <span>{s('result.yours.all', 'All the years we have ({from} to {to}):', 'Declared default window ({from} to {to}):', b)}</span>
            <VerdictChip certainty={declared.verdict.certainty} />
          </li>
        )}
      </ul>
      {declared && b && (
        <p className="small">
          {same
            ? s('result.yours.same', 'Both answers agree.', 'Both windows give the same certainty.')
            : s('result.yours.differ', 'The answers are not the same.', 'The two windows give different certainty.')}{' '}
          {s(
            'result.yours.warn',
            'Picking years after looking can fool us. Trust all the years more.',
            'Choosing a window after seeing the data inflates false positives (start/end-point sensitivity; Liebmann et al. 2010, doi:10.1175/2010BAMS3030.1). The declared window is the reference; see the start-year panel for every start year.',
          )}
        </p>
      )}
    </section>
  )
}
