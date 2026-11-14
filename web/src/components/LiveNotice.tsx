import { useData, useView } from '../context'
import { HttpError, LiveDataUnavailable } from '../data/client'
import { COPY } from '../lib/copy'
import type { Route } from '../lib/route'

export type LiveErrorKind = 'down' | 'place' | 'placeOther' | 'period'

/** Network failure and 5xx mean the service is down; a 4xx is sorted by what the server's detail talks about. */
export function classifyLiveError(error: Error): LiveErrorKind {
  if (!(error instanceof HttpError) || error instanceof LiveDataUnavailable) return 'down'
  if (error.status < 400 || error.status >= 500) return 'down'
  const d = (error.detail ?? '').toLowerCase()
  if (/box|\blat|\blon|degree|coordinate/.test(d)) return 'place'
  if (/\b(start|end|period|year)/.test(d)) return 'period'
  return 'placeOther'
}

/** Shown when a custom place could not be loaded: API down, or the API rejected the place. */
export function LiveNotice({ error, go }: { error: Error; go: (r: Route) => void }) {
  const { catalog } = useData()
  const { t, view } = useView()
  const kind = classifyLiveError(error)
  const text = { down: COPY.liveDown, place: COPY.placeRejected, placeOther: COPY.placeRejectedOther, period: COPY.periodRejected }[kind]
  const detail = error instanceof HttpError && kind !== 'down' ? error.detail : undefined
  return (
    <div role="alert" className="error live-notice">
      <p>{t(text)}</p>
      {view === 'scientific' && detail && <p className="small">{detail}</p>}
      <p className="small">{t(COPY.readyMade)}:</p>
      <ul className="inline-list">
        {catalog.regions
          .filter((r) => r.listed !== false)
          .map((r) => (
            <li key={r.id}>
              <button type="button" className="link" onClick={() => go({ screen: 'theme', region: r.id })}>
                {t(r.name)}
              </button>
            </li>
          ))}
      </ul>
    </div>
  )
}
