import { Fragment, type ReactNode } from 'react'
import { tx } from '../i18n'
import { Term } from './Term'
import { instrumentHref, powerParamOf, sourceInfo, splitGiovanniId, useS, type SourceInfo } from '../lib/sourceLabels'
import type { VariableRef } from '../types/contract'
import './SourceTag.css'

/** A small satellite or chip-and-grid drawing, so the instrument kind never relies on words alone. */
function KindIcon({ kind }: { kind: SourceInfo['kind'] }) {
  return (
    <svg className="source-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'satellite' ? (
        <>
          <rect x="6" y="6" width="4" height="4" rx="0.5" transform="rotate(45 8 8)" />
          <path d="M2 5l3 3-3 3-1-1 2-2-2-2zM14 5l-3 3 3 3 1-1-2-2 2-2z" />
        </>
      ) : (
        <>
          <rect x="3" y="3" width="10" height="10" rx="1.5" />
          <path d="M3 8h10M8 3v10" />
        </>
      )}
    </svg>
  )
}

/**
 * Which is the variable and which is the instrument, on every card and result.
 * Full form (result page): two labelled lines.
 *   Simple:     "What we measure: Afternoon humidity" / "Measured by: AIRS, an instrument on the Aqua satellite"
 *   Scientific: "Variable: Surface relative humidity (AIRS3STM v7.0 · RelHumSurf_A)" / "Instrument: AIRS · Aqua satellite · since 2002 · 1° grid"
 * Compact form (cards): icon + "Measured by AIRS (Aqua satellite)".
 * A variable is the quantity we trend. An instrument is a sensor on a satellite or a computer model.
 * NASA POWER is a delivery service ("via NASA POWER"), never the instrument.
 */
export function SourceTag({ variable, compact = false }: { variable: VariableRef; compact?: boolean }) {
  const { s, rich, view } = useS()
  const info = sourceInfo(variable)
  const name: ReactNode = info.id ? (
    <a href={instrumentHref(info.id)} title={s('src.link.title')}>
      {info.name}
    </a>
  ) : (
    info.name
  )
  const model = info.kind === 'model'
  const platform = info.platform ?? ''

  if (compact) {
    const key = model ? (info.viaPower ? 'src.compact.modelPower' : 'src.compact.model') : info.many ? 'src.compact.satMany' : 'src.compact.sat'
    return (
      <span className={`source-tag source-compact source-${info.kind}`}>
        <KindIcon kind={info.kind} />
        <span>{rich(key, { platform }, { name })}</span>
      </span>
    )
  }

  // the "instrument" line
  let by: ReactNode
  if (view === 'simple') {
    const nodes = { name, instrument: <Term id="instrument" />, model: <Term id="computer_model" /> }
    const key = model ? (info.viaPower ? 'src.simple.modelPower' : 'src.simple.model') : info.many ? 'src.simple.satMany' : 'src.simple.sat'
    by = rich(key, { platform }, nodes)
  } else {
    const parts: ReactNode[] = [name]
    if (model) parts.push(s('src.part.model'))
    else if (platform) parts.push(info.many ? platform : s('src.part.platform', { platform }))
    if (info.since) parts.push(s('src.part.since', { year: info.since }))
    if (info.cell) parts.push(s('src.part.grid', { cell: info.cell }))
    if (info.viaPower) parts.push(s('src.part.power'))
    by = parts.map((x, i) => <Fragment key={i}>{i > 0 && ' · '}{x}</Fragment>)
  }

  // the "variable" line
  const giov = variable.giovanni_id ? splitGiovanniId(variable.giovanni_id) : null
  const power = !giov && info.viaPower ? powerParamOf(variable.id) : null
  // one pair of brackets on the line: "Surface relative humidity (daytime)" reads "..., daytime" before the product in brackets
  const varName = tx(variable.name, view).replace(/\s*\(([^()]*)\)\s*$/, view === 'scientific' && (giov || power) ? ', $1' : ' ($1)')
  const varText =
    view === 'simple' ? varName : giov ? s('src.var.giovanni', { name: varName, ...giov }) : power ? s('src.var.power', { name: varName, param: power }) : varName
  const byLabel = s(model ? 'src.label.model' : 'src.label.by')

  return (
    <div className={`source-block source-${info.kind}`}>
      <p className="source-line">
        <span className="source-k">{view === 'simple' ? s('src.label.what') : <Term id="variable">{s('src.label.what')}</Term>}</span>
        <span className="source-v">{varText}</span>
      </p>
      <p className="source-line">
        <span className="source-k">{view === 'simple' ? byLabel : <Term id="instrument">{byLabel}</Term>}</span>
        <span className="source-v">
          <KindIcon kind={info.kind} /> {by}
        </span>
      </p>
      {view === 'simple' && model && <p className="source-line source-note muted small">{rich('src.simple.estimate', {}, { estimate: <Term id="computer_model_estimate" /> })}</p>}
    </div>
  )
}
