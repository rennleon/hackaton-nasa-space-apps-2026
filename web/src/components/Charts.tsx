import { lazy, Suspense } from 'react'
import type { AnalysisResult } from '../types/contract'
import { anomalyChart, chartSummary, rawChart, simpleChart } from '../lib/charts'
import { COPY } from '../lib/copy'
import { useView } from '../context'
import { Term } from './Term'

const PlotlyChart = lazy(() => import('./Plot'))

export function Charts({ result }: { result: AnalysisResult }) {
  const { view } = useView()
  if (!(result.series ?? []).length) return null
  const summary = chartSummary(result, view)
  const hasYearly = (result.yearly_series ?? []).length > 0
  if (view === 'simple' && hasYearly) {
    const simple = simpleChart(result)
    return (
      <div className="charts">
        <p className="chart-summary" id="chart-summary">
          {summary}
        </p>
        <figure aria-describedby="chart-summary">
          <figcaption>
            <h3>{COPY.chartTitle.simple}</h3>
            <p className="muted">{COPY.chartCaption.simple}</p>
          </figcaption>
          <Suspense fallback={<div className="chart-loading">Loading chart…</div>}>
            <PlotlyChart data={simple.data} layout={simple.layout} />
          </Suspense>
        </figure>
        <details className="more">
          <summary>{COPY.moreCharts.simple}</summary>
          <FullCharts result={result} />
        </details>
      </div>
    )
  }
  return (
    <div className="charts">
      <p className="chart-summary" id="chart-summary">
        {summary}
      </p>
      <FullCharts result={result} />
    </div>
  )
}

function FullCharts({ result }: { result: AnalysisResult }) {
  const { view } = useView()
  const raw = rawChart(result, view)
  const anom = anomalyChart(result, view)
  return (
    <>
      <figure aria-describedby="chart-summary">
        <figcaption>
          <h3>{view === 'simple' ? '1. What the satellite measured, month by month' : '1. Monthly values'}</h3>
          <p className="muted">
            {view === 'simple' ? (
              <>
                Notice the up-and-down wave: those are the <Term id="seasonal_cycle" />. Grey dots were left out of the answer.
              </>
            ) : (
              <>
                Raw monthly series; grey = outside the analysis window; shaded = excluded <Term id="orbit_drift" /> period.
              </>
            )}
          </p>
        </figcaption>
        <Suspense fallback={<div className="chart-loading">Loading chart…</div>}>
          <PlotlyChart data={raw.data} layout={raw.layout} />
        </Suspense>
      </figure>
      <figure aria-describedby="chart-summary">
        <figcaption>
          <h3>{view === 'simple' ? '2. After taking the seasons away' : '2. Anomalies and trend'}</h3>
          <p className="muted">
            {view === 'simple' ? (
              <>
                Now we only look at each month's <Term id="anomaly" />. The orange line is the <Term id="trend" />; the shade is the{' '}
                <Term id="confidence_range" />.
              </>
            ) : (
              <>
                <Term id="anomaly" /> series (<Term id="seasonal_cycle" /> removed) with the <Term id="trend" /> and the{' '}
                <Term id="confidence_range" />.
              </>
            )}
          </p>
        </figcaption>
        <Suspense fallback={<div className="chart-loading">Loading chart…</div>}>
          <PlotlyChart data={anom.data} layout={anom.layout} />
        </Suspense>
      </figure>
    </>
  )
}
