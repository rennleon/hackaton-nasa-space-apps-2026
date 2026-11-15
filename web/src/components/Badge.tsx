import { useResultCopy } from '../lib/resultCopy'
import type { LabelMeta } from '../lib/labels'

/** Label badge: colour + icon + text, so colour is never the only signal. */
export function Badge({ meta }: { meta: LabelMeta }) {
  const { c } = useResultCopy()
  return (
    <span className={`badge badge-${meta.tone}`}>
      <span aria-hidden="true" className="badge-icon">
        {meta.icon}
      </span>
      {c(meta.key, meta.text)}
    </span>
  )
}
