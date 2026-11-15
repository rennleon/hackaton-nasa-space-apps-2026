import type { Data, Layout } from 'plotly.js'
import type { AnalysisResult, YearPoint } from '../types/contract'
import { formatYm, type ViewMode } from './text'
import { COPY } from './copy'
import { fmt, sv } from './resultCopy'
import { tx } from '../i18n'

const BLUE = '#1c6ea4'
const ORANGE = '#d9480f'
const GREY = '#9aa3ab'
const GREY_TEXT = '#6b7580'

const day = (t: string) => `${t}-01`

function nextMonth(t: string): string {
  const [y, m] = t.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

export interface ChartSpec {
  data: Data[]
  layout: Partial<Layout>
}

function leftOutText(r: AnalysisResult, view: ViewMode): string {
  return r.window?.reason === 'drift_cut' ? sv(view, 'result.chart.driftOut', 'Satellite drift: years left out') : sv(view, 'result.chart.yearsOut', 'Years left out')
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
      name: sv(view, 'result.chart.used', 'Used in the answer', 'In analysis window'),
      line: { color: BLUE, width: 1.5 },
      marker: { size: 4, color: BLUE },
      hovertemplate: '%{x|%b %Y}: %{y:.2f}<extra></extra>',
    },
    {
      x: outW.map((p) => day(p.t)),
      y: outW.map((p) => p.value),
      type: 'scatter',
      mode: 'markers',
      name: sv(view, 'result.chart.out', 'Left out', 'Outside window'),
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
      name: tx(r.season!.name, view),
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
      text: leftOutText(r, view),
      font: { size: 12, color: GREY_TEXT },
    })
  }
  return {
    data,
    layout: { shapes, annotations, yaxis: { title: { text: unitLabel(r, view) }, ticks: 'outside', automargin: true }, xaxis: { type: 'date', ticks: 'outside' } },
  }
}

/** The 95% likely-range band: two lines filled between, with an outline so the legend swatch is visible. */
function bandTraces(r: AnalysisResult, view: ViewMode): Data[] {
  const fit = r.trend?.fit ?? []
  const fx = fit.map((f) => day(f.t))
  const outline = { color: 'rgba(217,72,15,0.55)', width: 1 }
  return [
    { x: fx, y: fit.map((f) => f.high), type: 'scatter', mode: 'lines', line: outline, showlegend: false, hoverinfo: 'skip' },
    {
      x: fx, y: fit.map((f) => f.low), type: 'scatter', mode: 'lines', line: outline, fill: 'tonexty',
      fillcolor: 'rgba(217,72,15,0.28)', name: sv(view, 'result.chart.band', 'Likely range', '95% band'), hoverinfo: 'skip',
    },
  ]
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
      type: 'scatter', mode: 'markers+lines', name: sv(view, 'result.chart.eachYear', 'Each year', 'Seasonal mean anomaly'),
      marker: { size: 7, color: BLUE }, line: { color: BLUE, width: 1 },
    })
  } else {
    const pts = (r.series ?? []).filter((p) => p.in_window && p.anomaly != null)
    data.push({
      x: pts.map((p) => day(p.t)), y: pts.map((p) => p.anomaly), type: 'scatter', mode: 'markers',
      name: sv(view, 'result.chart.eachMonth', 'Each month', 'Monthly anomaly'), marker: { size: 4, color: BLUE, opacity: 0.7 },
      hovertemplate: '%{x|%b %Y}: %{y:.2f}<extra></extra>',
    })
  }
  if (fit.length) {
    data.push(...bandTraces(r, view), { x: fx, y: fit.map((f) => f.trend), type: 'scatter', mode: 'lines', name: sv(view, 'result.chart.trend', 'Trend'), line: { color: ORANGE, width: 3 } })
  }
  return {
    data,
    layout: {
      yaxis: { title: { text: `${sv(view, 'result.chart.diffNormal', 'Difference from normal', 'Anomaly')} (${unitLabel(r, view)})` }, zeroline: true },
      xaxis: { type: 'date' },
    },
  }
}

/** The yearly dots to plot: the chosen season's own yearly means when a season is selected, else all months. */
export function yearlyPoints(r: AnalysisResult): YearPoint[] {
  if (r.season && r.season_series && r.season_series.length) return r.season_series
  return r.yearly_series ?? []
}

/**
 * Shift from the anomaly scale to real values: the "then" level minus the fitted anomaly in that year.
 * Lets the Simple chart show real numbers on its y-axis instead of "difference from normal".
 */
function levelOffset(r: AnalysisResult): number | null {
  const tn = r.then_now
  const fit = r.trend?.fit ?? []
  if (!tn || !fit.length) return null
  const f = fit.find((p) => Number(p.t.slice(0, 4)) === tn.year_then) ?? fit[0]
  return tn.value_then - f.trend
}

/** Shaded span plus an on-chart label for years that sit outside the analysis window. */
function leftOutMarks(r: AnalysisResult, view: ViewMode, outYears: number[], allYears: number[]) {
  if (!outYears.length) return { shapes: [], annotations: [] }
  const lo = Math.min(...outYears)
  const hi = Math.max(...outYears)
  const right = (lo + hi) / 2 >= (Math.min(...allYears) + Math.max(...allYears)) / 2
  const x0 = `${lo}-01-01`
  const x1 = `${hi + 1}-01-01`
  return {
    shapes: [{ type: 'rect' as const, xref: 'x' as const, yref: 'paper' as const, x0, x1, y0: 0, y1: 1, fillcolor: GREY, opacity: 0.18, line: { width: 0 }, layer: 'below' as const }],
    annotations: [
      {
        x: right ? x1 : x0, y: 1, xref: 'x' as const, yref: 'paper' as const, xanchor: right ? ('right' as const) : ('left' as const), yanchor: 'bottom' as const,
        showarrow: false, text: leftOutText(r, view), font: { size: 12, color: GREY_TEXT },
      },
    ],
  }
}

/**
 * The yearly chart (main chart). Simple: one dot per year plus the trend arrow, real values on the y-axis in kid units.
 * Scientific: yearly anomalies with the 95% band. Plots the season's yearly means when a season is selected.
 */
export function yearlyChart(r: AnalysisResult, view: ViewMode): ChartSpec {
  const simple = view === 'simple'
  const ys = yearlyPoints(r)
  const inY = ys.filter((p) => p.in_window)
  const outY = ys.filter((p) => !p.in_window)
  const fit = r.trend?.fit ?? []
  const seasonName = r.season ? tx(r.season.name, view) : null
  const off = simple ? levelOffset(r) : null
  const scale = simple && off != null ? (r.then_now?.kid_scale ?? 1) : 1
  const lvl = (anomaly: number) => (off == null ? anomaly : (anomaly + off) * scale)
  const all = [...inY, ...outY].map((p) => lvl(p.anomaly))
  const span = all.length ? Math.max(...all) - Math.min(...all) : 10
  const tickfmt = span >= 4 ? ',.0f' : ',.1f'
  const mid = (y: number) => `${y}-07-01`
  const dotsBase = sv(view, 'result.chart.dotsIn', COPY.chartDotsIn.simple, COPY.chartDotsIn.scientific)
  const dotsIn = seasonName ? (simple ? `${dotsBase} (${seasonName})` : sv(view, 'result.chart.yearlyMean', 'Yearly mean, {season}', 'Yearly mean, {season}', { season: seasonName })) : dotsBase
  const data: Data[] = [
    {
      x: inY.map((p) => mid(p.year)), y: inY.map((p) => lvl(p.anomaly)), type: 'scatter', mode: 'markers', name: dotsIn,
      marker: { size: simple ? 11 : 9, color: BLUE }, hovertemplate: `%{x|%Y}: %{y:${tickfmt.slice(1)}}<extra></extra>`,
    },
  ]
  if (outY.length) {
    data.push({
      x: outY.map((p) => mid(p.year)), y: outY.map((p) => lvl(p.anomaly)), type: 'scatter', mode: 'markers', name: sv(view, 'result.chart.dotsOut', COPY.chartDotsOut.simple, COPY.chartDotsOut.scientific),
      marker: { size: simple ? 11 : 9, color: 'rgba(0,0,0,0)', line: { color: GREY, width: 2 } }, hovertemplate: `%{x|%Y}: %{y:${tickfmt.slice(1)}}<extra></extra>`,
    })
  }
  if (!simple && fit.length) data.push(...bandTraces(r, view))
  if (fit.length) {
    data.push({
      x: fit.map((f) => day(f.t)), y: fit.map((f) => lvl(f.trend)), type: 'scatter', mode: 'lines', name: sv(view, 'result.chart.line', COPY.chartLine.simple, COPY.chartLine.scientific),
      line: { color: ORANGE, width: simple ? 4 : 3 }, hoverinfo: 'skip',
    })
  }
  const years = ys.map((p) => p.year)
  const marks = leftOutMarks(r, view, outY.map((p) => p.year), years)
  const longSpan = years.length ? Math.max(...years) - Math.min(...years) > 20 : false
  const unit = unitLabel(r, view)
  const yTitle = simple
    ? off != null
      ? (r.then_now?.kid_label ?? unit)
      : sv(view, 'result.chart.axisDiff', 'Difference from a normal year ({unit})', '', { unit })
    : seasonName
      ? sv(view, 'result.chart.axisSeasonAnomaly', '', '{season} anomaly ({unit})', { season: seasonName, unit })
      : sv(view, 'result.chart.axisYearlyAnomaly', '', 'Yearly anomaly ({unit})', { unit })
  return {
    data,
    layout: {
      shapes: marks.shapes, annotations: marks.annotations,
      margin: { l: 64, r: 16, t: 34, b: 48 },
      yaxis: { title: { text: yTitle, standoff: 8 }, showticklabels: true, tickformat: tickfmt, zeroline: off == null, ticks: 'outside', automargin: true },
      xaxis: { type: 'date', dtick: longSpan ? 'M60' : 'M24', tickformat: '%Y', ticks: 'outside', automargin: true },
    },
  }
}

/** Kept for callers that only want the Simple chart. */
export const simpleChart = (r: AnalysisResult): ChartSpec => yearlyChart(r, 'simple')

/** Plain-text description of what the charts show, for readers who cannot see them. */
export function chartSummary(r: AnalysisResult, view: ViewMode): string {
  const s = r.series ?? []
  if (!s.length || !r.window) return sv(view, 'result.chart.none', COPY.noChart.simple, COPY.noChart.scientific)
  const w = r.window
  const trend = r.trend
  const dec = r.variable.units.decimals
  const unit = unitLabel(r, view)
  const base = sv(view, 'result.chart.covers', 'The chart covers {from} to {to}.', 'Monthly series, analysis window {from} to {to} ({years} years).', {
    from: view === 'simple' ? w.start.slice(0, 4) : formatYm(w.start),
    to: view === 'simple' ? w.end.slice(0, 4) : formatYm(w.end),
    years: fmt(w.years, 1),
  })
  if (!trend) return base
  const sl = trend.slope_per_decade
  if (view === 'simple') {
    const dir = sl > 0 ? sv(view, 'result.chart.up', 'up') : sl < 0 ? sv(view, 'result.chart.down', 'down') : sv(view, 'result.chart.sideways', 'sideways')
    return sv(view, 'result.chart.summarySimple', 'Each dot is one year. The orange line goes {dir}.', '', { dir })
  }
  const dir = sl > 0 ? 'upward' : sl < 0 ? 'downward' : 'flat'
  return `${base} ${sv(view, 'result.chart.summarySci', '', 'Fitted trend is {dir}: {slope} {unit} per decade, 95% interval {lo} to {hi}.', {
    dir: sv(view, `result.chart.dir.${dir}`, dir),
    slope: `${sl >= 0 ? '+' : '−'}${fmt(Math.abs(sl), dec)}`,
    unit,
    lo: fmt(trend.ci_low, dec),
    hi: fmt(trend.ci_high, dec),
  })}`
}
