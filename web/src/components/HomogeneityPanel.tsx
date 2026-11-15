import { useView } from '../context'
import { numberLocale, tx, useT } from '../i18n'
import { formatPlace } from '../lib/place'
import type { Route } from '../lib/route'
import type { Homogeneity } from '../types/contract'
import { Term } from './Term'
import './HomogeneityPanel.css'

const num = (n: number | null, d: number) => (n === null ? '–' : n.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d }))
const span = (a: number | null, b: number | null, d: number) => `${num(a, d)}–${num(b, d)}`

/** One small picture per answer; the word beside it always says the same thing (never colour alone). */
function Icon({ kind }: { kind: Homogeneity['kind'] }) {
  return (
    <svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true" focusable="false" className="homog-icon">
      {kind === 'mixed' && (
        <>
          <rect x="2" y="2" width="16" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M2 2l16 16M10 2l8 8M2 10l8 8" stroke="currentColor" strokeWidth="1.6" fill="none" />
        </>
      )}
      {kind === 'one_kind' && (
        <>
          <rect x="2" y="2" width="16" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M6 10.5l3 3 5-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {kind === 'single_spot' && <circle cx="10" cy="10" r="4" fill="currentColor" />}
    </svg>
  )
}

/**
 * "Is this one kind of place?" Computed before any trend (long-term means only). A mixed box can hide opposite
 * changes, so the panel says so and offers each part that is itself one kind of place. The rules are project heuristics.
 */
export function HomogeneityPanel({ homogeneity: h, route, go, canTry = true }: { homogeneity: Homogeneity | null | undefined; route: Route; go: (r: Route) => void; /** a suggested part is a new custom box: offer it only when the live service is on */ canTry?: boolean }) {
  const t = useT()
  const { view } = useView()
  if (!h) return null
  const simple = view === 'simple'
  const title =
    h.kind === 'mixed' ? (
      <Term id="mixed_place" cap>
        {t('homog.mixed.title', 'Mixed place')}
      </Term>
    ) : h.kind === 'one_kind' ? (
      <Term id="one_kind_place" cap>
        {t('homog.one.title', 'One kind of place')}
      </Term>
    ) : (
      t('homog.spot.title', 'One map square')
    )
  // a different box is a different question: keep the theme, drop the years and the time of year
  const tryPart = (bbox: number[]) => go({ screen: 'shortlist', theme: route.theme, place: formatPlace({ kind: 'box', w: bbox[0], s: bbox[1], e: bbox[2], n: bbox[3] }) })

  return (
    <section className={`homog homog-${h.kind}`} aria-label={t('homog.aria', 'Is this one kind of place?')} data-demo="homogeneity">
      <p className="homog-head">
        <Icon kind={h.kind} />
        <strong>{title}</strong>
        {!simple && <span className="muted small"> · {t('homog.rule.sci', 'rule: project heuristic')}</span>}
      </p>
      <p className="homog-text">{tx(h.text, view)}</p>
      {!simple && h.kind !== 'single_spot' && (
        <dl className="homog-facts">
          <dt>{t('homog.cells.sci', 'Grid cells')}</dt>
          <dd>{h.n_cells}</dd>
          <dt>{t('homog.rain.sci', 'Annual precipitation')}</dt>
          <dd>
            {span(h.precip_min, h.precip_max, 2)} {t('homog.unit.rain.sci', 'mm/day')}
          </dd>
          <dt>{t('homog.elev.sci', 'Model elevation')}</dt>
          <dd>{span(h.elev_min, h.elev_max, 0)} m</dd>
          <dt>{t('homog.t2m.sci', 'Annual T2M')}</dt>
          <dd>{span(h.t2m_min, h.t2m_max, 1)} °C</dd>
          <dt>{t('homog.groups.sci', 'Köppen main groups')}</dt>
          <dd>
            {Object.entries(h.climate_groups)
              .map(([g, n]) => `${g} ${n}`)
              .join(' · ')}
          </dd>
        </dl>
      )}
      {h.kind === 'mixed' && h.reasons.length > 0 && (
        simple ? (
          <details className="homog-why">
            <summary>{t('homog.why', 'Tell me more')}</summary>
            <ul>
              {h.reasons.map((r) => (
                <li key={r.code}>{tx(r.text, view)}</li>
              ))}
            </ul>
          </details>
        ) : (
          <ul className="homog-why">
            {h.reasons.map((r) => (
              <li key={r.code}>{tx(r.text, view)}</li>
            ))}
          </ul>
        )
      )}
      {canTry && h.kind === 'mixed' && h.suggestions.length > 0 && (
        <ul className="homog-try">
          {h.suggestions.map((s) => (
            <li key={s.bbox.join(',')}>
              <button type="button" className="btn" onClick={() => tryPart(s.bbox)}>
                {simple
                  ? t('homog.try', 'Try just {name}', { name: tx(s.name, 'simple') })
                  : t('homog.try.sci', 'Use only {name} ({n} cells)', { name: tx(s.name, 'scientific'), n: s.n_cells })}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
