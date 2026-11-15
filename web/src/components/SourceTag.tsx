import { useView } from '../context'
import { sourceParts } from '../lib/findings'
import { useL } from '../lib/findingsCopy'
import type { VariableRef } from '../types/contract'
import './SourceTag.css'

/**
 * Where a variable comes from, on every card and result.
 * Scientific: "AIRS · Aqua satellite · since 2002" or "MERRA-2 computer model · via NASA POWER".
 * Simple: "Satellite · AIRS" or "Computer model estimate · MERRA-2".
 * NASA POWER is a delivery service, never named as the instrument.
 */
export function SourceTag({ variable }: { variable: VariableRef }) {
  const l = useL()
  const { view } = useView()
  const s = sourceParts(variable)
  const parts: string[] = []
  if (view === 'simple') {
    parts.push(l(s.kind === 'model' ? 'common.source.model' : 'common.source.satellite'))
    if (s.name) parts.push(s.name)
    if (s.viaPower) parts.push(l('common.source.viaPower'))
  } else if (s.kind === 'model') {
    parts.push(s.name ? l('common.source.modelOf', { name: s.name }) : l('common.source.model'))
    parts.push(s.viaPower ? l('common.source.viaPower') : s.since ? l('common.source.since', { year: s.since }) : '')
  } else {
    parts.push(s.name)
    parts.push(s.platform ? l('common.source.satelliteOf', { platform: s.platform }) : l('common.source.satellite'))
    if (s.since) parts.push(l('common.source.since', { year: s.since }))
  }
  return <span className={`source-tag source-${s.kind}`}>{parts.filter(Boolean).join(' · ')}</span>
}
