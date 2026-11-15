import type { AnalysisResult, StartYearPoint } from '../types/contract'
import { fmt, useResultCopy } from '../lib/resultCopy'
import { Icon, type IconName } from './ResultIcons'
import { Term } from './Term'
import { TermText } from './TermText'
import './StartYears.css'

// Chart geometry in SVG user units (the figure scales to the card width).
const W = 360
const H = 210
const M = { l: 66, r: 14, t: 14, b: 44 }
const R = 5.5

type Class = NonNullable<AnalysisResult['start_years']>['classification']
const CLASS_ICON: Record<Class, IconName> = { holds: 'check', mostly: 'info', unclear: 'info', depends: 'caution' }
const CLASS_TONE: Record<Class, string> = { holds: 'sy-holds', mostly: 'sy-mostly', unclear: 'sy-mostly', depends: 'sy-depends' }

const yearOf = (p: StartYearPoint) => Number(p.start.slice(0, 4))

/** Roughly four evenly spread start-year labels, always including the first and the last. */
function xTicks(years: number[]): number[] {
  const first = years[0]
  const last = years[years.length - 1]
  const n = Math.min(4, years.length)
  const out = new Set<number>()
  for (let i = 0; i < n; i++) out.add(Math.round(first + ((last - first) * i) / Math.max(n - 1, 1)))
  return [...out]
}

/**
 * "What if we start in another year?" Context only: the verdict stays on the declared window.
 * Hidden when the engine sent no panel (declared seasons, no trend, record too short to move the start).
 */
export function StartYears({ result }: { result: AnalysisResult }) {
  const { s, view } = useResultCopy()
  const sy = result.start_years
  if (!sy || sy.points.length < 2 || !result.window) return null
  const simple = view === 'simple'
  const cls = sy.classification
  const pts = sy.points
  const years = pts.map(yearOf)
  const unit = result.variable.units.display
  const dec = Math.max(result.variable.units.decimals, 1)

  // Simple and Scientific say the same thing: the DIRECTION (sign) per start year. Only a start year that is sure in
  // the opposite direction raises the alarm; signs flipping around a near-zero trend are noise ("unclear").
  const headline =
    cls === 'holds'
      ? s('startyears.holds', 'We tried other start years. The change always points the same way.', 'Every start year keeps the sign of the declared-window trend.')
      : cls === 'mostly'
        ? s('startyears.mostly', 'We tried other start years. The change mostly points the same way.', 'Most start years keep the sign of the declared-window trend; none is significant with the opposite sign.')
        : cls === 'unclear'
          ? s('startyears.unclear', 'Other start years point different ways. None of them is sure.', 'The sign varies with the start year, but no start year is significant with the opposite sign.')
          : s('startyears.depends', 'Some start years surely point the other way. Be careful.', 'At least one start year is significant with the opposite sign. Read the trend with caution.')
  const classWord =
    cls === 'holds'
      ? s('startyears.cl.holds', '', 'holds (all start years share the sign)')
      : cls === 'mostly'
        ? s('startyears.cl.mostly', '', 'mostly (at least 75% share the sign, none significant opposite)')
        : cls === 'unclear'
          ? s('startyears.cl.unclear', '', 'unclear (signs vary, none significant opposite)')
          : s('startyears.cl.depends', '', 'depends (a start year is significant with the opposite sign)')

  // y range: slopes (and their 95% ranges in the Scientific view); always contains zero
  const vals = pts.flatMap((p) => (simple ? [p.slope_per_decade] : [p.slope_per_decade, p.ci_low, p.ci_high]))
  let lo = Math.min(0, ...vals)
  let hi = Math.max(0, ...vals)
  if (hi === lo) {
    lo -= 1
    hi += 1
  }
  const pad = (hi - lo) * 0.08
  lo -= pad
  hi += pad
  const x0 = years[0]
  const x1 = years[years.length - 1]
  const X = (yr: number) => M.l + ((yr - x0) / (x1 - x0 || 1)) * (W - M.l - M.r)
  const Y = (v: number) => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b)
  const yTicks = [0, hi - pad, lo + pad].filter((v, i) => i === 0 || Math.abs(Y(v) - Y(0)) > 22)
  const tip = (p: StartYearPoint) => {
    const v = { year: yearOf(p), slope: fmt(p.slope_per_decade, dec), unit, lo: fmt(p.ci_low, dec), hi: fmt(p.ci_high, dec) }
    return p.significant
      ? s('startyears.tipSure', '{year}: we are sure', '{year}: {slope} {unit} per 10 years, 95% range {lo} to {hi}, significant', v)
      : s('startyears.tipUnsure', '{year}: not sure yet', '{year}: {slope} {unit} per 10 years, 95% range {lo} to {hi}, not significant', v)
  }

  const label = simple
    ? s('startyears.chartLabel', 'One dot for each start year. Filled dots are the sure ones.', '')
    : s('startyears.chartLabel', '', 'Trend for each start year, with its 95% range. Filled means significant.')

  return (
    <section className="card start-years" aria-labelledby="sy-h" data-demo="start-years">
      <h3 id="sy-h">{s('startyears.title', 'What if we start in another year?', 'Start-year sensitivity')}</h3>
      <p className={`sy-answer ${CLASS_TONE[cls]}`}>
        <Icon name={CLASS_ICON[cls]} size={22} />
        <span>
          {headline}
          {!simple && <> {s('startyears.classLabel', '', 'Classification: {label}.', { label: classWord })}</>}
        </span>
      </p>
      <p className="muted sy-count">
        {simple
          ? // "We are sure in 0" read as nonsense: zero sure tries gets its own sentence
            sy.n_significant === 0
            ? cls === 'unclear'
              ? // the headline already says "None of them is sure."
                s('startyears.countOnly', 'In {same} of {n} tries, the change points the same way.', '', { same: sy.n_same_sign, n: sy.n_starts })
              : s('startyears.countNone', 'In {same} of {n} tries, the change points the same way. None of them is sure yet.', '', {
                same: sy.n_same_sign,
                n: sy.n_starts,
              })
            : s('startyears.count', 'In {same} of {n} tries, the change points the same way. We are sure in {sure} of them.', '', {
                same: sy.n_same_sign,
                n: sy.n_starts,
                sure: sy.n_significant,
              })
          : s('startyears.count', '', '{same} of {n} start years ({first} to {last}) have the same sign as the declared window; {sig} are significant (both tests agree, α = 0.05).', {
              same: sy.n_same_sign,
              n: sy.n_starts,
              first: years[0],
              last: x1,
              sig: sy.n_significant,
            })}
      </p>
      <details key={view} className="sy-details" open={!simple}>
        <summary>{s('startyears.more', 'Tell me more', 'Chart and details')}</summary>
        <figure className="sy-figure">
          <svg className="sy-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
            {/* zero line: the change is flat here */}
            <line className="sy-zero" x1={M.l} x2={W - M.r} y1={Y(0)} y2={Y(0)} />
            {simple ? (
              <>
                <text className="sy-tick" x={M.l - 8} y={Y(0) + 4} textAnchor="end">
                  {s('startyears.flat', 'flat', '')}
                </text>
                <text className="sy-tick" x={M.l - 8} y={M.t + 10} textAnchor="end">
                  {s('startyears.up', 'going up', '')}
                </text>
                <text className="sy-tick" x={M.l - 8} y={H - M.b - 2} textAnchor="end">
                  {s('startyears.down', 'going down', '')}
                </text>
              </>
            ) : (
              yTicks.map((v) => (
                <text key={v} className="sy-tick" x={M.l - 8} y={Y(v) + 4} textAnchor="end">
                  {fmt(Math.abs(v) < 1e-9 ? 0 : v, dec)}
                </text>
              ))
            )}
            {xTicks(years).map((yr) => (
              <text key={yr} className="sy-tick" x={X(yr)} y={H - M.b + 18} textAnchor="middle">
                {yr}
              </text>
            ))}
            <text className="sy-axis" x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle">
              {s('startyears.x', 'Year we start from', 'First year of the window')}
            </text>
            {!simple && (
              <text className="sy-axis" transform={`translate(12 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle">
                {s('startyears.yTitle', '', '{unit} per 10 years', { unit })}
              </text>
            )}
            {!simple &&
              pts.map((p) => (
                <line key={`ci-${p.start}`} className="sy-ci" x1={X(yearOf(p))} x2={X(yearOf(p))} y1={Y(p.ci_high)} y2={Y(p.ci_low)} />
              ))}
            {pts.map((p) => (
              <circle key={p.start} className={p.significant ? 'sy-dot sy-sure' : 'sy-dot sy-unsure'} cx={X(yearOf(p))} cy={Y(p.slope_per_decade)} r={R}>
                <title>{tip(p)}</title>
              </circle>
            ))}
          </svg>
          <figcaption className="sy-legend">
            <span className="sy-key">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <circle className="sy-dot sy-sure" cx="7" cy="7" r="5" />
              </svg>
              {simple ? s('startyears.legendSure', 'Filled dot: we are sure.', '') : s('startyears.legendSure', '', 'Filled: significant (both tests agree).')}
            </span>
            <span className="sy-key">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <circle className="sy-dot sy-unsure" cx="7" cy="7" r="5" />
              </svg>
              {simple ? s('startyears.legendUnsure', 'Ring: not sure yet.', '') : s('startyears.legendUnsure', '', 'Open: not significant.')}
            </span>
            {!simple && <span className="sy-key">{s('startyears.legendBar', '', 'Thin bar: 95% range.')}</span>}
          </figcaption>
        </figure>
        <p className="muted small">
          {simple ? (
            <>
              {s('startyears.side', 'This is a side check. Our main answer does not change.', '')}{' '}
              <TermText text={s('startyears.termLine', 'The {start_year} is the first year we count.', '')} terms={{ start_year: <Term id="start_year" /> }} />
            </>
          ) : (
            s('startyears.side', '', 'Context only: the verdict above stays on the declared window ({from} to {to}). Each start year reruns the same tests with the end month fixed; anomalies use the climatology of the full declared window. The 75% threshold for "mostly" is a project choice.', {
              from: result.window.start,
              to: result.window.end,
            })
          )}
        </p>
        {!simple && (
          <p className="muted small sy-ref">
            {s('startyears.refNote', '', 'Trends over a few decades can change sign with the start or end year:')}{' '}
            Liebmann, B., Dole, R.M., Jones, C., Bladé, I., Allured, D. (2010). Influence of Choice of Time Period on Global Surface Temperature Trend Estimates.{' '}
            <i>Bull. Amer. Meteor. Soc.</i> 91(11), 1485–1491.{' '}
            <a href="https://doi.org/10.1175/2010BAMS3030.1" target="_blank" rel="noreferrer">
              doi:10.1175/2010BAMS3030.1
            </a>
          </p>
        )}
      </details>
    </section>
  )
}
