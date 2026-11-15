import { useEffect, useState } from 'react'
import Plotly from 'plotly.js-basic-dist-min'
import createPlotlyComponent from 'react-plotly.js/factory'
import type { Data, Layout } from 'plotly.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = createPlotlyComponent(Plotly as any)

/** Chart chrome (text, grid, font) comes from the theme tokens in styles.css, so charts follow light, dark and the theme switch. */
interface ChartTheme { text: string; muted: string; grid: string; fontBody: string }

const FALLBACK: ChartTheme = { text: '#e9eff8', muted: '#a8b7cd', grid: '#2a3d61', fontBody: 'system-ui, sans-serif' }

function readTheme(): ChartTheme {
  if (typeof document === 'undefined') return FALLBACK
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb
  return {
    text: v('--text', FALLBACK.text),
    muted: v('--muted', FALLBACK.muted),
    grid: v('--chart-grid', FALLBACK.grid),
    fontBody: v('--font-body', FALLBACK.fontBody).replace(/"/g, "'"),
  }
}

function sameTheme(a: ChartTheme, b: ChartTheme) {
  return a.text === b.text && a.muted === b.muted && a.grid === b.grid && a.fontBody === b.fontBody
}

function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(readTheme)
  useEffect(() => {
    const refresh = () => setTheme((prev) => {
      const next = readTheme()
      return sameTheme(prev, next) ? prev : next
    })
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    mq?.addEventListener('change', refresh)
    const mo = new MutationObserver(refresh)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    refresh() // styles may have arrived after the first render
    return () => {
      mq?.removeEventListener('change', refresh)
      mo.disconnect()
    }
  }, [])
  return theme
}

export default function PlotlyChart({ data, layout, height = 320 }: { data: Data[]; layout: Partial<Layout>; height?: number }) {
  const th = useChartTheme()
  const axis = { gridcolor: th.grid, zerolinecolor: th.grid, linecolor: th.grid, tickfont: { size: 14, color: th.muted }, ticklen: 4, tickcolor: th.grid }
  const merged: Partial<Layout> = {
    autosize: true,
    height,
    margin: { l: 60, r: 16, t: 16, b: 48 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: th.fontBody, color: th.text, size: 14 },
    legend: { orientation: 'h', y: -0.22, font: { size: 13 } },
    hoverlabel: { font: { family: th.fontBody, size: 13 } },
    ...layout,
  }
  // keep the caller's axis settings, with the themed look underneath
  merged.xaxis = { ...axis, ...(layout.xaxis ?? {}) }
  merged.yaxis = { ...axis, ...(layout.yaxis ?? {}) }
  return (
    <Plot
      data={data}
      layout={merged}
      config={{ displaylogo: false, responsive: true, displayModeBar: false }}
      useResizeHandler
      style={{ width: '100%' }}
    />
  )
}
