import { lazy, Suspense } from 'react'
import type { AnalysisResult } from '../types/contract'
import { anomalyChart, chartSummary, rawChart, yearlyChart, yearlyPoints } from '../lib/charts'
import { COPY } from '../lib/copy'
import { useResultCopy } from '../lib/resultCopy'
import { Term } from './Term'
import { TermText } from './TermText'
import './VariableView.css'

const PlotlyChart = lazy(() => import('./Plot'))

/** Why some years are grey rings (Simple view): every left-out year gets a reason a child can follow. */
function outWhy(result: AnalysisResult, fromList: boolean, s: ReturnType<typeof useResultCopy>['s']): string | null {
  if (!yearlyPoints(result).some((p) => !p.in_window)) return null
  if (result.window?.reason === 'drift_cut') return s('result.chart.outWhy.drift', 'Grey rings are years we left out. The satellite started passing over at a different time.')
  if (fromList || result.window?.reason === 'common') return s('result.chart.outWhy.list', 'Grey rings are years we left out. The list uses the same years for every measure.')
  if (result.window?.reason === 'user') return s('result.chart.outWhy.picked', 'Grey rings are years outside the years you chose.')
  return s('result.chart.outWhy.other', 'Grey rings were left out.')
}

export function Charts({ result, fromList = false }: { result: AnalysisResult; fromList?: boolean }) {
  const { c, s, view } = useResultCopy()
  if (!(result.series ?? []).length) return null
  const summary = chartSummary(result, view)
  const hasYearly = yearlyPoints(result).length > 0
  const season = result.season ? (view === 'simple' ? result.season.name.simple : result.season.name.scientific) : null
  const loading = <div className="chart-loading">{s('result.chart.loading', 'Loading chart…')}</div>
  const main = hasYearly ? yearlyChart(result, view) : null
  return (
    <div className="charts">
      <p className="chart-summary" id="chart-summary">
        {summary}
      </p>
      {main && (
        <figure aria-describedby="chart-summary" className="chart-main">
          <figcaption>
            <h3>{season ? s('result.chart.titleSeason', 'One dot for every {season}', 'Yearly means, {season}', { season }) : c('result.chart.title', COPY.chartTitle)}</h3>
            <p className="muted">
              {view === 'simple'
                ? [c('result.chart.caption', COPY.chartCaption), outWhy(result, fromList, s)].filter(Boolean).join(' ')
                : s('result.chart.captionYearly', '', 'Yearly means of the de-seasonalised values with the Sen trend line and the 95% band. Open circles are outside the window.')}
            </p>
          </figcaption>
          <Suspense fallback={loading}>
            <PlotlyChart data={main.data} layout={main.layout} />
          </Suspense>
        </figure>
      )}
      {view === 'simple' && hasYearly ? (
        <details className="more">
          <summary>{c('result.chart.more', COPY.moreCharts)}</summary>
          <FullCharts result={result} />
        </details>
      ) : (
        <FullCharts result={result} />
      )}
    </div>
  )
}

function FullCharts({ result }: { result: AnalysisResult }) {
  const { s, view } = useResultCopy()
  const raw = rawChart(result, view)
  const anom = anomalyChart(result, view)
  const loading = <div className="chart-loading">{s('result.chart.loading', 'Loading chart…')}</div>
  const simple = view === 'simple'
  const isModel = result.variable.source_type === 'model'
  return (
    <>
      <figure aria-describedby="chart-summary">
        <figcaption>
          <h3>
            {simple
              ? isModel
                ? s('result.chart.rawTitleModel', '1. The computer model estimate, month by month')
                : s('result.chart.rawTitle', '1. What the satellite measured, month by month')
              : s('result.chart.rawTitleSci', '', '1. Monthly values')}
          </h3>
          <p className="muted">
            <TermText
              text={s(
                'result.chart.rawCaption',
                'Notice the up-and-down wave: that is the {seasonal_cycle}. Grey dots were left out of the answer.',
                'Raw monthly series; grey = outside the analysis window; shaded = excluded {orbit_drift} period.',
              )}
              terms={{ seasonal_cycle: <Term id="seasonal_cycle" />, orbit_drift: <Term id="orbit_drift" /> }}
            />
          </p>
        </figcaption>
        <Suspense fallback={loading}>
          <PlotlyChart data={raw.data} layout={raw.layout} />
        </Suspense>
      </figure>
      <figure aria-describedby="chart-summary">
        <figcaption>
          <h3>{simple ? s('result.chart.anomTitle', '2. After taking the seasons away') : s('result.chart.anomTitleSci', '', '2. Anomalies and trend')}</h3>
          <p className="muted">
            <TermText
              text={s(
                'result.chart.anomCaption',
                "Now we only look at each month's {anomaly}. The orange line is the {trend}; the shade is the {confidence_range}.",
                '{anomaly} series ({seasonal_cycle} removed) with the {trend} and the {confidence_range}.',
              )}
              terms={{
                anomaly: <Term id="anomaly" cap={!simple} />,
                seasonal_cycle: <Term id="seasonal_cycle" />,
                trend: <Term id="trend" />,
                confidence_range: <Term id="confidence_range" />,
              }}
            />
          </p>
        </figcaption>
        <Suspense fallback={loading}>
          <PlotlyChart data={anom.data} layout={anom.layout} />
        </Suspense>
      </figure>
    </>
  )
}
