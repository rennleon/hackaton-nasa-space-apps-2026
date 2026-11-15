import type { AnalysisResult } from '../types/contract'
import { VERDICT_META } from '../lib/labels'
import { formatP } from '../lib/text'
import { Badge } from './Badge'
import { VerdictGauge } from './VerdictGauge'
import { COPY } from '../lib/copy'
import { cleanInternal, fmt, useResultCopy } from '../lib/resultCopy'
import { Term } from './Term'
import './VariableView.css'

const TEST_NAMES: Record<string, { name: string; term: string }> = {
  mk_hamed_rao: { name: 'Mann–Kendall (Hamed–Rao corrected)', term: 'mann_kendall' },
  ols_neff: { name: 'OLS slope, effective sample size', term: 'ols_neff' },
  seasonal_mk: { name: 'Seasonal Mann–Kendall', term: 'mann_kendall' },
}

/**
 * Answer first, then the gauge, then "then vs now" in whole numbers.
 * The slope and its 95% range live in the Scientific view, and behind "Tell me more" in Simple.
 */
export function VerdictCard({ result }: { result: AnalysisResult }) {
  const { c, bx, view } = useResultCopy()
  const v = result.verdict
  const simple = view === 'simple'
  const clean = (x: string) => cleanInternal(x, view)
  return (
    <section className="card verdict" aria-labelledby="verdict-h" data-demo="verdict">
      {!simple && (
        <div className="verdict-top">
          <Badge meta={VERDICT_META[v.label]} />
        </div>
      )}
      <h2 id="verdict-h" className={simple ? 'answer' : undefined}>
        {clean(bx(v.answer))}
      </h2>
      <VerdictGauge certainty={v.certainty} />
      <p className={simple ? 'how-much' : 'lead'} data-demo="how-much">{clean(bx(v.how_much))}</p>
      {simple ? (
        <details className="more">
          <summary>{c('result.card.more', COPY.tellMeMore)}</summary>
          <p>{clean(bx(v.sentence))}</p>
          <Details result={result} />
        </details>
      ) : (
        <>
          <p className="lead">{bx(v.sentence)}</p>
          <Details result={result} />
        </>
      )}
    </section>
  )
}

function Details({ result }: { result: AnalysisResult }) {
  const { view, bx, s, c } = useResultCopy()
  const { trend, tests = [], persistence: pers } = result
  if (!trend) {
    const failed = result.gates.checks.filter((g) => !g.passed)
    return failed.length ? (
      <ul className="muted">
        {failed.map((g) => (
          <li key={g.code}>{bx(g.detail)}</li>
        ))}
      </ul>
    ) : null
  }
  const units = result.variable.units
  const dec = units.decimals + 1
  const num = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n), Math.max(units.decimals, 1))}`
  const slope = s('result.slope', '{n} {unit} every 10 years', '{n} {unit} per decade', {
    n: num(trend.slope_per_decade),
    unit: view === 'simple' ? units.simple : units.display,
  })
  if (view === 'simple') {
    const decisive = tests.filter((x) => x.decisive)
    const agree = decisive.length > 0 && decisive.every((x) => x.p < 0.05)
    const years = Math.round(result.detectability?.years_available ?? result.window?.years ?? 0)
    return (
      <ul>
        <li>{s('result.details.years', 'We looked at {n} years of data.', '', { n: years })}</li>
        <li>{s('result.details.trendLine', 'The trend line: {slope}.', '', { slope })}</li>
        <li>
          {s('result.details.range', 'It could be anywhere between {lo} and {hi} {unit} every 10 years.', '', {
            lo: fmt(trend.ci_low, dec),
            hi: fmt(trend.ci_high, dec),
            unit: units.simple,
          })}
        </li>
        <li>{c(agree ? 'result.details.agree' : 'result.details.disagree', agree ? COPY.checksAgree : COPY.checksDisagree)}</li>
      </ul>
    )
  }
  return (
    <div className="details">
      <h3>{s('result.details.title', '', 'Test details')}</h3>
      <table>
        <caption className="visually-hidden">{s('result.details.caption', '', 'Significance tests')}</caption>
        <thead>
          <tr>
            <th scope="col">{s('result.details.role', '', 'Role')}</th>
            <th scope="col">{s('result.details.test', '', 'Test')}</th>
            <th scope="col">{s('result.details.stat', '', 'Statistic')}</th>
            <th scope="col">
              <Term id="p_value" />
            </th>
          </tr>
        </thead>
        <tbody>
          {tests.map((x, i) => (
            <tr key={x.name}>
              <td>{x.decisive ? s('result.details.decisive', '', '{id} (decisive)', { id: 'AB'[i] ?? 'A' }) : s('result.details.context', '', 'C (context)')}</td>
              <td>
                <Term id={TEST_NAMES[x.name]?.term ?? 'p_value'}>{TEST_NAMES[x.name]?.name ?? x.name}</Term>
              </td>
              <td>{fmt(x.statistic, 2)}</td>
              <td>{formatP(x.p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="facts">
        <dt>
          <Term id="sens_slope">{s('result.details.slope', '', 'Slope')}</Term>
        </dt>
        <dd>{slope}</dd>
        <dt>
          <Term id="confidence_range">{s('result.details.ci', '', '95% range')}</Term>
        </dt>
        <dd>{s('result.details.ciValue', '', '[{lo}, {hi}] {unit}/decade', { lo: fmt(trend.ci_low, dec), hi: fmt(trend.ci_high, dec), unit: units.display })}</dd>
        {pers && (
          <>
            <dt>
              <Term id="persistence">{s('result.details.r1', '', 'Lag-1 autocorrelation r₁')}</Term>
            </dt>
            <dd>{fmt(pers.r1, 2)}</dd>
            <dt>n / n_eff</dt>
            <dd>
              {pers.n} / {fmt(pers.n_eff, 1)}
            </dd>
          </>
        )}
        {result.seasonal_share != null && (
          <>
            <dt>{s('result.details.seasonalShare', '', 'Seasonal share of variance')}</dt>
            <dd>{fmt(result.seasonal_share * 100, 1)}%</dd>
          </>
        )}
        {result.robustness?.leave_one_year_out && (
          <>
            <dt>{s('result.details.loyo', '', 'Leave-one-year-out')}</dt>
            <dd>
              {s('result.details.loyoValue', '', 'Slope {lo} to {hi}; worst p = {p}', {
                lo: fmt(result.robustness.leave_one_year_out.slope_min, dec),
                hi: fmt(result.robustness.leave_one_year_out.slope_max, dec),
                p: formatP(result.robustness.leave_one_year_out.worst_p),
              })}
            </dd>
          </>
        )}
      </dl>
    </div>
  )
}
