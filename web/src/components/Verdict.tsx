import type { AnalysisResult } from '../types/contract'
import { useView } from '../context'
import { VERDICT_META } from '../lib/labels'
import { formatP, formatSlope } from '../lib/text'
import { Badge } from './Badge'
import { CertaintyMeter } from './CertaintyMeter'
import { COPY } from '../lib/copy'
import type { Text } from '../types/contract'
import { Term } from './Term'

const TEST_NAMES: Record<string, { name: string; term: string }> = {
  mk_hamed_rao: { name: 'Mann–Kendall (Hamed–Rao corrected)', term: 'mann_kendall' },
  ols_neff: { name: 'OLS slope, effective sample size', term: 'ols_neff' },
  seasonal_mk: { name: 'Seasonal Mann–Kendall', term: 'mann_kendall' },
}

export function VerdictCard({ result }: { result: AnalysisResult }) {
  const { t, view } = useView()
  const v = result.verdict
  const chips = result.chips ?? []
  const simple = view === 'simple'
  const isModel = result.variable.source_type === 'model'
  return (
    <section className="card verdict" aria-labelledby="verdict-h">
      <div className="verdict-top">
        {!simple && <Badge meta={VERDICT_META[v.label]} />}
        <span className="tag">
          {isModel ? <Term id="model">{t(COPY.modelTag)}</Term> : <Term id="observed">{t(COPY.observedTag)}</Term>}
        </span>
      </div>
      <h2 id="verdict-h" className={simple ? 'answer' : undefined}>
        {t(v.answer)}
      </h2>
      <CertaintyMeter certainty={v.certainty} />
      <p className={simple ? 'how-much' : 'lead'}>{t(v.how_much)}</p>
      {chips.length > 0 && (
        <ul className="chips" aria-label={simple ? 'Good to know' : 'Warnings and notes'}>
          {chips.map((c) => (
            <li key={c.code} className={`chip chip-${c.severity}`}>
              <span aria-hidden="true">{c.severity === 'warning' ? '⚠' : 'ℹ'}</span>{' '}
              <span className="visually-hidden">{c.severity === 'warning' ? 'Warning: ' : 'Note: '}</span>
              {t(c.text)}
            </li>
          ))}
        </ul>
      )}
      {simple ? (
        <details className="more">
          <summary>{t(COPY.tellMeMore)}</summary>
          <p>{t(v.sentence)}</p>
          {(v.notes ?? []).map((n, i) => (
            <p key={i} className="muted">
              {t(n)}
            </p>
          ))}
          <Details result={result} />
        </details>
      ) : (
        <>
          <p className="lead">{t(v.sentence)}</p>
          {(v.notes ?? []).map((n, i) => (
            <p key={i} className="muted">
              {t(n)}
            </p>
          ))}
          <Detectability result={result} />
          <Details result={result} />
        </>
      )}
    </section>
  )
}

/** Stage-1 "worth investigating" checks, decided before the trend was computed. */
export function SelectionPanel({ result }: { result: AnalysisResult }) {
  const { t, view } = useView()
  const sel = result.selection
  if (!sel) return null
  const status: Record<string, { icon: string; text: Text }> = {
    pass: { icon: '✓', text: COPY.checkPass },
    caution: { icon: '⚠', text: COPY.checkCaution },
    fail: { icon: '✗', text: COPY.checkFail },
  }
  return (
    <section className="card why-card" aria-labelledby="why-h">
      <h3 id="why-h">{t(COPY.whyLooked)}</h3>
      <p>
        <strong>{t(sel.worth_investigating ? COPY.worthYes : COPY.worthNo)}</strong>
      </p>
      <ul className="check-list">
        {sel.checks.map((c) => (
          <li key={c.code} className={`check-${c.status}`}>
            <span className="check-status">
              <span aria-hidden="true">{status[c.status].icon}</span> {t(status[c.status].text)}
            </span>
            {': '}
            {t(c.detail)}
          </li>
        ))}
      </ul>
      {view === 'scientific' && (
        <p className="muted small">
          MDT {sel.mdt_per_decade == null ? 'n/a' : `${sel.mdt_per_decade.toFixed(result.variable.units.decimals)} ${result.variable.units.display}/decade`}
          {' · '}expected {sel.expected_per_decade == null ? 'n/a' : `${sel.expected_per_decade} ${result.variable.units.display}/decade`}
        </p>
      )}
    </section>
  )
}

function Detectability({ result }: { result: AnalysisResult }) {
  const d = result.detectability
  if (!d) return null
  // A significant result is already detected; "years needed" (90% power) can exceed the record
  // without contradiction, so we say so instead of showing two numbers that look inconsistent.
  const detected = result.verdict.label === 'significant' || result.verdict.label === 'significant_fragile'
  return (
    <p className="detect">
      <Term id="years_to_detect" />:{' '}
      <strong>{d.years_needed == null ? 'n/a (slope ≈ 0)' : `${d.years_needed.toFixed(1)} yr`}</strong> needed vs{' '}
      <strong>{d.years_available.toFixed(1)} yr</strong> available
      {detected ? ' (90% power design target; this trend is already significant at α = 0.05).' : '.'}
    </p>
  )
}

function Details({ result }: { result: AnalysisResult }) {
  const { view, t } = useView()
  const { trend, tests = [], persistence: pers } = result
  if (!trend) {
    const failed = result.gates.checks.filter((c) => !c.passed)
    return failed.length ? (
      <ul className="muted">
        {failed.map((c) => (
          <li key={c.code}>{view === 'simple' ? c.detail.simple : c.detail.scientific}</li>
        ))}
      </ul>
    ) : null
  }
  const units = result.variable.units
  const dec = units.decimals + 1
  if (view === 'simple') {
    const decisive = tests.filter((x) => x.decisive)
    const agree = decisive.length > 0 && decisive.every((x) => x.p < 0.05)
    return (
      <ul>
        <li>{t(COPY.yearsOfData(Math.round(result.detectability?.years_available ?? result.window?.years ?? 0)))}</li>
        <li>
          {t(COPY.trendLine)}: <strong>{formatSlope(trend.slope_per_decade, units, view)}</strong>.
        </li>
        <li>
          {t(COPY.range)} {trend.ci_low.toFixed(dec)} and {trend.ci_high.toFixed(dec)} {units.simple} every 10 years.
        </li>
        <li>{t(agree ? COPY.checksAgree : COPY.checksDisagree)}</li>
      </ul>
    )
  }
  return (
    <div className="details">
      <h3>Test details</h3>
      <table>
        <caption className="visually-hidden">Significance tests</caption>
        <thead>
          <tr>
            <th scope="col">Role</th>
            <th scope="col">Test</th>
            <th scope="col">Statistic</th>
            <th scope="col">
              <Term id="p_value" />
            </th>
          </tr>
        </thead>
        <tbody>
          {tests.map((x, i) => (
            <tr key={x.name}>
              <td>{x.decisive ? `${'AB'[i] ?? 'A'} (decisive)` : 'C (context)'}</td>
              <td>
                <Term id={TEST_NAMES[x.name]?.term ?? 'p_value'}>{TEST_NAMES[x.name]?.name ?? x.name}</Term>
              </td>
              <td>{x.statistic.toFixed(2)}</td>
              <td>{formatP(x.p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="facts">
        <dt>
          <Term id="sens_slope">Slope</Term>
        </dt>
        <dd>
          {formatSlope(trend.slope_per_decade, units, view)}
        </dd>
        <dt>
          <Term id="confidence_range">95% CI</Term>
        </dt>
        <dd>
          [{trend.ci_low.toFixed(dec)}, {trend.ci_high.toFixed(dec)}] {units.display}/decade
        </dd>
        {pers && (
          <>
            <dt>
              <Term id="persistence">Lag-1 autocorrelation r₁</Term>
            </dt>
            <dd>{pers.r1.toFixed(2)}</dd>
            <dt>n / n_eff</dt>
            <dd>
              {pers.n} / {pers.n_eff.toFixed(1)}
            </dd>
          </>
        )}
        {result.seasonal_share != null && (
          <>
            <dt>Seasonal share of variance</dt>
            <dd>{(result.seasonal_share * 100).toFixed(1)}%</dd>
          </>
        )}
        {result.robustness?.leave_one_year_out && (
          <>
            <dt>Leave-one-year-out</dt>
            <dd>
              slope {result.robustness.leave_one_year_out.slope_min.toFixed(dec)} to {result.robustness.leave_one_year_out.slope_max.toFixed(dec)}; worst p ={' '}
              {formatP(result.robustness.leave_one_year_out.worst_p)}
            </dd>
          </>
        )}
      </dl>
    </div>
  )
}
