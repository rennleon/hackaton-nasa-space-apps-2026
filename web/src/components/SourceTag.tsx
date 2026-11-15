import { useEffect, useState } from 'react'
import type { VariableRef } from '../types/contract'
import { useResultCopy } from '../lib/resultCopy'
import { Icon } from './ResultIcons'
import './VariableView.css'

interface Instrument {
  id: string
  name: { simple: string; scientific: string }
  kind: 'satellite' | 'model'
  platform: string | null
  since: number
}

let cache: Promise<Instrument[]> | null = null
/** Reads catalog/instruments.json once; a missing file just means the tag falls back to the variable's own fields. */
function loadInstruments(): Promise<Instrument[]> {
  cache ??= fetch(`${import.meta.env.BASE_URL ?? '/'}data/catalog/instruments.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Instrument[]>) : []))
    .catch(() => [])
  return cache
}

/** "AIRS · Aqua satellite · since 2002" or "MERRA-2 computer model · via NASA POWER". Simple: Satellite / Computer model estimate. */
export function SourceTag({ variable }: { variable: VariableRef }) {
  const { s, view } = useResultCopy()
  const [list, setList] = useState<Instrument[]>([])
  useEffect(() => {
    let alive = true
    void loadInstruments().then((l) => alive && setList(l))
    return () => {
      alive = false
    }
  }, [])
  const inst = list.find((i) => i.id === variable.instrument_id)
  const isModel = variable.source_type === 'model'
  // "AIRS (Atmospheric Infrared Sounder)" -> "AIRS"
  const name = inst ? inst.name.scientific.split(' (')[0] : variable.instrument
  const platform = variable.platform ?? inst?.platform ?? null
  const since = inst?.since
  const via = variable.delivered_by
  const grid = variable.cell_deg

  const parts: string[] = []
  if (isModel) {
    parts.push(s('result.source.model', 'Computer model estimate', '{name} computer model', { name }))
    if (view === 'simple') parts.push(name)
    if (via) parts.push(s('result.source.via', 'via {via}', 'via {via}', { via }))
  } else {
    parts.push(s('result.source.satellite', 'Satellite', '{name}', { name }))
    if (view === 'simple') parts.push(name)
    else if (platform) parts.push(/satellite/i.test(platform) ? platform : s('result.source.platform', '', '{platform} satellite', { platform }))
    if (since) parts.push(s('result.source.since', 'since {year}', 'since {year}', { year: since }))
  }
  if (view !== 'simple' && grid) parts.push(s('result.source.grid', '', '{deg}° grid', { deg: grid }))

  return (
    <p className="source-tag">
      <Icon name={isModel ? 'model' : 'satellite'} size={18} />
      <span>{parts.join(' · ')}</span>
    </p>
  )
}
