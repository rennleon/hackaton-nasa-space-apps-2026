import type { Data, Layout } from 'plotly.js'
import type { AnalysisResult } from '../types/contract'
import { formatYm, pick, type ViewMode } from './text'
import { COPY } from './copy'

const BLUE = '#1c6ea4'
const ORANGE = '#d9480f'
const GREY = '#9aa3ab'

const day = (t: string) => `${t}-01`

function nextMonth(t: string): string {
  const [y, m] = t.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

export interface ChartSpec {
  data: Data[]
  layout: Partial<Layout>
}

function unitLabel(r: AnalysisResult, view: ViewMode) {
  return view === 'simple' ? r.variable.units.simple : r.variable.units.display
}

/** Chart 1: raw monthly values, months outside the window greyed, excluded drift period shaded. */
export function rawChart(r: AnalysisResult, view: ViewMode): ChartSpec {
  const series = r.series ?? []
  const inW = series.filter((p) => p.in_window && p.value != null)
  const outW = series.filter((p) => !p.in_window && p.value != null)
  const season = r.season?.months
  const data: Data[] = [
    {
      x: inW.map((p) => day(p.t)),
      y: inW.map((p) => p.value),
      type: 'scatter',
      mode: 'lines+markers',
      name: view === 'simple' ? 'Used in the answer' : 'In analysis window',
      line: { color: BLUE, width: 1.5 },
      marker: { size: 4, color: BLUE },
      hovertemplate: '%{x|%b %Y}: %{y:.2f}<extra></extra>',
    },
    {
      x: outW.map((p) => day(p.t)),
      y: outW.map((p) => p.value),
      type: 'scatter',
      mode: 'markers',
      name: view === 'simple' ? 'Left out' : 'Outside window',
      marker: { size: 4, color: GREY },
      hovertemplate: '%{x|%b %Y}: %{y:.2f}<extra></extra>',
    },
  ]
  if (season) {
    const sm = inW.filter((p) => season.includes(Number(p.t.slice(5, 7))))
    data.push({
      x: sm.map((p) => day(p.t)),
      y: sm.map((p) => p.value),
      type: 'scatter',
      mode: 'markers',
      name: pick(r.season!.name, view),
      marker: { size: 7, color: ORANGE },
      hovertemplate: '%{x|%b %Y}: %{y:.2f}<extra></extra>',
    })
  }
  const shapes: NonNullable<Partial<Layout>['shapes']> = []
  const annotations: NonNullable<Partial<Layout>['annotations']> = []
  const last = series.length ? series[series.length - 1].t : null
  if (r.window && last && r.window.end < last) {
    const from = day(nextMonth(r.window.end))
    shapes.push({ type: 'rect', xref: 'x', yref: 'paper', x0: from, x1: day(last), y0: 0, y1: 1, fillcolor: GREY, opacity: 0.2, line: { width: 0 }, layer: 'below' })
    annotations.push({
      x: from, y: 1, xref: 'x', yref: 'paper', xanchor: 'left', yanchor: 'top', showarrow: false,
      text: r.window.reason === 'drift_cut' ? (view === 'simple' ? 'Left out: satellite drift' : 'Excluded: orbit drift') : view === 'simple' ? 'Left out' : 'Outside window',
      font: { size: 11, color: GREY },
    })
  }
  return {
    data,
    layout: { shapes, annotations, yaxis: { title: { text: unitLabel(r, view) } }, xaxis: { type: 'date' } },
  }
}

/** Chart 2: anomalies with the trend line and the 95% slope band (low/high from trend.fit). */
export function anomalyChart(r: AnalysisResult, view: ViewMode): ChartSpec {
  const fit = r.trend?.fit ?? []
  const fx = fit.map((f) => day(f.t))
  const data: Data[] = []
  if (r.season_series && r.season_series.length) {
    data.push({
      x: r.season_series.map((p) => `${p.year}-07-01`),
      y: r.season_series.map((p) => p.anomaly),
      type: 'scatter', mode: 'markers+lines', name: view === 'simple' ? 'Each year' : 'Seasonal mean anomaly',
      marker: { size: 7, color: BLUE }, line: { color: BLUE, width: 1 },
    })
  } else {
    const pts = (r.series ?? []).filter((p) => p.in_window && p.anomaly != null)
    data.push({
      x: pts.map((p) => day(p.t)), y: pts.map((p) => p.anomaly), type: 'scatter', mode: 'markers',
      name: view === 'simple' ? 'Each month' : 'Monthly anomaly', marker: { size: 4, color: BLUE, opacity: 0.7 },
      hovertemplate: '%{x|%b %Y}: %{y:.2f}<extra></extra>',
    })
  }
  if (fit.length) {
    data.push(
      { x: fx, y: fit.map((f) => f.high), type: 'scatter', mode: 'lines', line: { width: 0 }, showlegend: false, hoverinfo: 'skip' },
      {
        x: fx, y: fit.map((f) => f.low), type: 'scatter', mode: 'lines', line: { width: 0 }, fill: 'tonexty',
        fillcolor: 'rgba(217,72,15,0.18)', name: view === 'simple' ? 'Likely range' : '95% band', hoverinfo: 'skip',
      },
      { x: fx, y: fit.map((f) => f.trend), type: 'scatter', mode: 'lines', name: 'Trend', line: { color: ORANGE, width: 3 } },
    )
  }
  return {
    data,
    layout: {
      yaxis: { title: { text: `${view === 'simple' ? 'Difference from normal' : 'Anomaly'} (${unitLabel(r, view)})` }, zeroline: true },
      xaxis: { type: 'date' },
    },
  }
}

/** Simple chart: one dot per year (de-seasonalised yearly mean) plus the trend line from trend.fit. */
export function simpleChart(r: AnalysisResult): ChartSpec {
  const ys = r.yearly_series ?? []
  const inY = ys.filter((p) => p.in_window)
  const outY = ys.filter((p) => !p.in_window)
  const fit = r.trend?.fit ?? []
  const mid = (y: number) => `${y}-07-01`
  const data: Data[] = [
    {
      x: inY.map((p) => mid(p.year)), y: inY.map((p) => p.anomaly), type: 'scatter', mode: 'markers', name: COPY.chartDotsIn.simple,
      marker: { size: 11, color: BLUE }, hovertemplate: '%{x|%Y}<extra></extra>',
    },
  ]
  if (outY.length) {
    data.push({
      x: outY.map((p) => mid(p.year)), y: outY.map((p) => p.anomaly), type: 'scatter', mode: 'markers', name: COPY.chartDotsOut.simple,
      marker: { size: 11, color: 'rgba(0,0,0,0)', line: { color: GREY, width: 2 } }, hovertemplate: '%{x|%Y}<extra></extra>',
    })
  }
  if (fit.length) {
    data.push({ x: fit.map((f) => day(f.t)), y: fit.map((f) => f.trend), type: 'scatter', mode: 'lines', name: COPY.chartLine.simple, line: { color: ORANGE, width: 4 }, hoverinfo: 'skip' })
  }
  return {
    data,
    layout: {
      yaxis: { title: { text: COPY.chartAxis.simple }, showticklabels: false, zeroline: true },
      xaxis: { type: 'date', dtick: 'M60', tickformat: '%Y' },
    },
  }
}

/** Plain-text description of what the charts show, for readers who cannot see them. */
export function chartSummary(r: AnalysisResult, view: ViewMode): string {
  const s = r.series ?? []
  if (!s.length || !r.window) return pick(COPY.noChart, view)
  const w = r.window
  const trend = r.trend
  const dec = r.variable.units.decimals
  const unit = unitLabel(r, view)
  const base =
    view === 'simple'
      ? `The chart covers ${w.start.slice(0, 4)} to ${w.end.slice(0, 4)}.`
      : `Monthly series, analysis window ${formatYm(w.start)} to ${formatYm(w.end)} (${w.years.toFixed(1)} years).`
  if (!trend) return base
  const sl = trend.slope_per_decade
  const dir = sl > 0 ? 'upward' : sl < 0 ? 'downward' : 'flat'
  return view === 'simple'
    ? `Each dot is one year. The orange line goes ${dir === 'upward' ? 'up' : dir === 'downward' ? 'down' : 'sideways'}.`
    : `${base} Fitted trend is ${dir}: ${sl >= 0 ? '+' : '−'}${Math.abs(sl).toFixed(dec)} ${unit} per decade, 95% interval ${trend.ci_low.toFixed(dec)} to ${trend.ci_high.toFixed(dec)}.`
}
