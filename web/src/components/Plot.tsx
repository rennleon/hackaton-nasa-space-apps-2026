import { useEffect, useState } from 'react'
import Plotly from 'plotly.js-basic-dist-min'
import createPlotlyComponent from 'react-plotly.js/factory'
import type { Data, Layout } from 'plotly.js'
import { useLang } from '../i18n'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = createPlotlyComponent(Plotly as any)

// Spanish month and day names for axis ticks and hover text (the basic Plotly bundle ships English only).
// Peru: decimal point, comma for thousands. Registered once; the chart picks it with config.locale.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(Plotly as any).register({
  moduleType: 'locale',
  name: 'es',
  dictionary: {},
  format: {
    days: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    shortDays: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
    months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'],
    shortMonths: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
    date: '%d/%m/%Y',
    decimal: '.',
    thousands: ',',
  },
})

function useDark() {
  const [dark, setDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const fn = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return dark
}

export default function PlotlyChart({ data, layout, height = 320 }: { data: Data[]; layout: Partial<Layout>; height?: number }) {
  const dark = useDark()
  const lang = useLang()
  const fg = dark ? '#e6e8eb' : '#1d2329'
  const grid = dark ? '#3a424b' : '#dde2e7'
  const merged: Partial<Layout> = {
    autosize: true,
    height,
    margin: { l: 56, r: 16, t: 16, b: 44 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: fg, size: 13 },
    xaxis: { gridcolor: grid, ...(layout.xaxis ?? {}) },
    yaxis: { gridcolor: grid, zerolinecolor: grid, ...(layout.yaxis ?? {}) },
    legend: { orientation: 'h', y: -0.2 },
    ...layout,
    // keep the merged axes
  }
  merged.xaxis = { gridcolor: grid, ...(layout.xaxis ?? {}) }
  merged.yaxis = { gridcolor: grid, zerolinecolor: grid, ...(layout.yaxis ?? {}) }
  return (
    <Plot
      data={data}
      layout={merged}
      config={{ displaylogo: false, responsive: true, displayModeBar: false, locale: lang }}
      useResizeHandler
      style={{ width: '100%' }}
    />
  )
}
