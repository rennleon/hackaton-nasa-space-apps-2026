import { numberLocale, useStartT } from '../lib/startT'
import { classOf, type ClimateGrid, type ClimateLayer, type ClimateLayerId } from '../lib/climate'
import type { ClimateStatus } from './useClimateGrid'
import { Term } from './Term'
import { TermText } from './TermText'
import './ClimateLegend.css'

/** Everything the "where does it happen?" layer says, in the active view: Simple words, or numbers and units. */
export function useClimateWords() {
  const { s, view } = useStartT()
  const rain = s('start.clim.water.unit', 'mm/day')
  const words: Record<ClimateLayerId, { toggle: string; hint: string; classes: string[]; unit: string }> = {
    heat: {
      toggle: s('start.clim.heat.toggle', 'Show where it is hot', 'Mean temperature'),
      hint: s('start.clim.heat.hint', 'Darker red means hotter. Pick a spot inside one colour.', 'Darker red is warmer. Choose a box inside one colour class.'),
      classes: [
        s('start.clim.heat.c0', 'Very cold'),
        s('start.clim.heat.c1', 'Cool'),
        s('start.clim.heat.c2', 'Mild'),
        s('start.clim.heat.c3', 'Warm'),
        s('start.clim.heat.c4', 'Hot'),
      ],
      unit: s('start.clim.heat.unit', '°C'),
    },
    water: {
      toggle: s('start.clim.water.toggle', 'Show where it rains', 'Mean precipitation'),
      hint: s('start.clim.water.hint', 'Darker blue means more rain. Pick a spot inside one colour.', 'Darker blue is wetter. Choose a box inside one colour class.'),
      classes: [
        s('start.clim.water.c0', 'Very dry'),
        s('start.clim.water.c1', 'Dry'),
        s('start.clim.water.c2', 'Some rain'),
        s('start.clim.water.c3', 'Rainy'),
        s('start.clim.water.c4', 'Very rainy'),
      ],
      unit: rain,
    },
    air: {
      toggle: s('start.clim.air.toggle', 'Show where the air is hazy', 'Mean aerosol optical depth'),
      hint: s('start.clim.air.hint', 'Darker purple means hazier air. Pick a spot inside one colour.', 'Darker purple is higher aerosol optical depth. Choose a box inside one colour class.'),
      classes: [
        s('start.clim.air.c0', 'Very clear'),
        s('start.clim.air.c1', 'Clear'),
        s('start.clim.air.c2', 'A bit hazy'),
        s('start.clim.air.c3', 'Hazy'),
        s('start.clim.air.c4', 'Very hazy'),
      ],
      unit: '',
    },
  }
  const num = (layer: ClimateLayer, v: number) => v.toLocaleString(numberLocale(), { minimumFractionDigits: layer.decimals, maximumFractionDigits: layer.decimals })
  /** What a cell says when you point at it: a word in the Simple view, the number in the Scientific view. */
  const cellText = (layer: ClimateLayer, v: number) => {
    if (view === 'simple') return words[layer.id].classes[classOf(layer, v)]
    return `${num(layer, v)}${words[layer.id].unit ? ` ${words[layer.id].unit}` : ''}`
  }
  /** Legend label of class i: its word (Simple) or its number range (Scientific). */
  const classLabel = (layer: ClimateLayer, i: number) => {
    if (view === 'simple') return words[layer.id].classes[i]
    const b = layer.breaks
    if (i === 0) return `< ${num(layer, b[0])}`
    if (i === b.length) return `≥ ${num(layer, b[i - 1])}`
    return `${num(layer, b[i - 1])}–${num(layer, b[i])}`
  }
  return { s, view, words, num, cellText, classLabel }
}

interface Props {
  layer: ClimateLayer
  grid: ClimateGrid | null
  status: ClimateStatus
  /** the colours reach only part of what the map shows */
  partial?: boolean
}

/** Colour scale, one sentence on how to read it, what the map currently spans, and where the numbers come from. */
export function ClimateLegend({ layer, grid, status, partial }: Props) {
  const { s, words, num, classLabel, view } = useClimateWords()
  const w = words[layer.id]
  const values = grid?.cells.map((c) => c[2]) ?? []
  const lo = values.length ? Math.min(...values) : null
  const hi = values.length ? Math.max(...values) : null
  const source =
    layer.id === 'air'
      ? s('start.clim.src.syn1deg', 'Data: NASA POWER (CERES SYN1deg computer estimate), {avg}.')
      : s('start.clim.src.merra', 'Data: NASA POWER (MERRA-2 computer model), {avg}.')
  return (
    <div className="clim-legend" aria-live="polite">
      <p className="clim-hint">{w.hint}</p>
      <ol className="clim-scale" aria-label={w.toggle}>
        {layer.colors.map((c, i) => (
          <li key={c}>
            <span className="clim-swatch" style={{ background: c }} aria-hidden="true" />
            <span>{classLabel(layer, i)}</span>
          </li>
        ))}
      </ol>
      {view === 'scientific' && w.unit && <p className="muted clim-unit">{s('start.clim.unitLine', 'Unit: {unit}', 'Unit: {unit}', { unit: w.unit })}</p>}
      {status === 'loading' && <p className="muted">{s('start.clim.loading', 'Getting the colours…', 'Loading climatology…')}</p>}
      {status === 'far' && <p className="clim-note">{s('start.clim.far', 'Zoom in to see colours.')}</p>}
      {status === 'ready' && partial && <p className="clim-note">{s('start.clim.partial', 'Colours show only near the middle of the map. Zoom in to see more.')}</p>}
      {status === 'none' && <p className="muted">{s('start.clim.none', 'No colours here without internet. Try a ready-made place.', 'No climatology available for this view (offline, or outside the precomputed places).')}</p>}
      {status === 'ready' && lo !== null && hi !== null && (
        <p className="muted">
          {view === 'simple' && classOf(layer, lo) === classOf(layer, hi)
            ? s('start.clim.same', 'All of this map looks the same: {lo}.', 'All of this map looks the same: {lo}.', { lo: w.classes[classOf(layer, lo)].toLowerCase() })
            : s(
                'start.clim.span',
                'On this map: {lo} to {hi}.',
                'Values in this view: {lo} to {hi}{unit}.',
                view === 'simple'
                  ? { lo: w.classes[classOf(layer, lo)].toLowerCase(), hi: w.classes[classOf(layer, hi)].toLowerCase(), unit: '' }
                  : { lo: num(layer, lo), hi: num(layer, hi), unit: w.unit ? ` ${w.unit}` : '' },
              )}
        </p>
      )}
      <p className="muted clim-source">
        <TermText text={source} terms={{ avg: <Term id="long_term_average">{s('start.clim.avg', 'long-term average')}</Term> }} />
      </p>
    </div>
  )
}
