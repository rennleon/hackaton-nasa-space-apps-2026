// Variable vs instrument: the words, labels and helpers shared by the source block (SourceTag), the "Where our data
// comes from" page and the Findings legend.
//   variable   = the measured quantity we trend (for example "Afternoon humidity")
//   instrument = the sensor on a satellite (AIRS on Aqua) or a computer model (MERRA-2) that produces many variables
//   NASA POWER = neither: a delivery service ("via NASA POWER")
// Every string has a Simple wording (R5: short, everyday words) and a Scientific one, and goes through the i18n
// helper under the key `<key>.<view>`, so Spanish can be added in i18n/es.ts without touching a component.
import { Fragment, type ReactNode } from 'react'
import { useView } from '../context'
import { useT } from '../i18n'
import variablesJson from '../../public/data/catalog/variables.json'
import type { VariableRef } from '../types/contract'
import { instrumentById, type Instrument } from './instruments'

interface Pair {
  simple: string
  scientific: string
}
const p = (simple: string, scientific = simple): Pair => ({ simple, scientific })

export const S = {
  // labels of the two lines in the source block
  'src.label.what': p('What we measure', 'Variable'),
  'src.label.by': p('Measured by', 'Instrument'),
  'src.label.model': p('Worked out by', 'Instrument'),
  // Simple values of the "instrument" line
  'src.simple.sat': p('{name}, an {instrument} on the {platform} satellite'),
  'src.simple.satMany': p('{name}, an {instrument} on several satellites'),
  'src.simple.model': p('{name}, a {model}'),
  'src.simple.modelPower': p('{name}, a {model} (via NASA POWER)'),
  'src.simple.estimate': p('This is a {estimate}, not a direct reading.'),
  // Scientific parts of the "instrument" line, joined with " · "
  'src.part.platform': p('{platform} satellite'),
  'src.part.since': p('since {year}'),
  'src.part.grid': p('{cell}° grid'),
  'src.part.model': p('computer model'),
  'src.part.power': p('via NASA POWER'),
  // Scientific value of the "variable" line
  'src.var.giovanni': p('{name}', '{name} ({product} v{version} · {param})'),
  'src.var.power': p('{name}', '{name} (via NASA POWER · {param})'),
  // compact form on cards
  'src.compact.sat': p('Measured by {name} ({platform} satellite)', 'Instrument: {name} ({platform} satellite)'),
  'src.compact.satMany': p('Measured by {name} (several satellites)', 'Instrument: {name} ({platform})'),
  'src.compact.model': p('Worked out by {name} (computer model estimate)', 'Instrument: {name} (computer model)'),
  'src.compact.modelPower': p('Worked out by {name} (computer model estimate, via NASA POWER)', 'Instrument: {name} (computer model, via NASA POWER)'),
  'src.link.title': p('Where this instrument is explained', 'Instrument details'),
  // findings page
  'legend.label': p('{instrument} in this list:'),
  'legend.instruments': p('Instruments'),
  'legend.sat': p('{name} (satellite)'),
  'legend.satMany': p('{name} (satellites)'),
  'legend.model': p('{name} (computer model)'),
  'legend.same': p('Same thing, measured by a different instrument: {name}'),
  // sources page
  'sp.intro': p(
    'An {instrument} is a tool that measures. A {variable} is one thing it measures, like how warm the air is.',
    'An {instrument} is a sensor on a satellite, or a computer model, that produces data. A {variable} is one measured quantity in it, and it is what we trend.',
  ),
  'sp.inst': p('Instrument: {name}'),
  'sp.platform.sat': p('Satellite: {platform}'),
  'sp.platform.satMany': p('Satellites: {platform}'),
  'sp.platform.model': p('Computer model'),
  'sp.vars': p('Variables from this instrument:'),
  'sp.flowLabel': p('{name} and the variables it gives us', '{name} and the variables it produces'),
  'sp.notUsedTitle': p('Not used yet'),
  'sp.notUsedWhy': p("NASA's online tool does not have it, so we cannot fetch it live.", 'Not offered by the Giovanni cloud service; saved export only.'),
  'sp.notUsedNone': p('No variable in the app comes from it yet.'),
} as const satisfies Record<string, Pair>

export type SKey = keyof typeof S

/** Translating lookup bound to the current view, plus `rich` for sentences that hold links or glossary terms. */
export function useS() {
  const t = useT()
  const { view } = useView()
  const s = (key: SKey, vars?: Record<string, string | number>) => t(`${key}.${view}`, S[key][view], vars)
  /** One whole translated sentence with React nodes in the {placeholders}; plain values go in `vars`. */
  const rich = (key: SKey, vars: Record<string, string | number>, nodes: Record<string, ReactNode>): ReactNode => {
    const keep = Object.fromEntries(Object.keys(nodes).map((k) => [k, `{${k}}`]))
    const tpl = s(key, { ...vars, ...keep })
    return tpl.split(/(\{\w+\})/).map((part, i) => {
      const m = /^\{(\w+)\}$/.exec(part)
      return <Fragment key={i}>{m && m[1] in nodes ? nodes[m[1]] : part}</Fragment>
    })
  }
  return { s, rich, view }
}

/** "AIRS", "GPM IMERG", "MERRA-2": the short name before the long one in brackets. */
export const shortName = (i: Instrument): string => i.name.scientific.split(' (')[0]

/** More than one satellite carries it ("Terra and Aqua", "GPM Core Observatory and partner satellites"). */
export const manySatellites = (platform: string | null | undefined): boolean => !!platform && /\band\b|,/.test(platform)

export interface SourceInfo {
  id: string | null
  kind: 'satellite' | 'model'
  name: string
  platform: string | null
  many: boolean
  since: number | null
  cell: number | null
  viaPower: boolean
}

/** Everything the source block says about a variable's instrument. NASA POWER is a delivery service, never the instrument. */
export function sourceInfo(v: VariableRef): SourceInfo {
  const inst = instrumentById(v.instrument_id)
  const viaPower = (v.delivered_by ?? '').toUpperCase().includes('POWER')
  const kind = v.source_type === 'model' ? 'model' : 'satellite'
  const name = v.instrument || (inst ? shortName(inst) : viaPower ? 'MERRA-2' : '')
  const platform = kind === 'satellite' ? (v.platform ?? inst?.platform ?? null) : null
  return { id: v.instrument_id ?? inst?.id ?? null, kind, name, platform, many: manySatellites(platform), since: inst?.since ?? null, cell: v.cell_deg, viaPower }
}

/** Where the instrument is explained: the sources page, scrolled to that instrument. */
export const instrumentHref = (id: string | null | undefined): string => (id ? `#/sources?instrument=${encodeURIComponent(id)}` : '#/sources')

/**
 * "AIRS3STM_7_0_RelHumSurf_A" -> product AIRS3STM, version 7.0, variable RelHumSurf_A.
 * The version is the first run of all-digit parts after the product name ("GPM_3IMERGM_07_precipitation" -> GPM_3IMERGM, 7).
 */
export function splitGiovanniId(id: string): { product: string; version: string; param: string } | null {
  const parts = id.split('_')
  const at = parts.findIndex((x, i) => i > 0 && /^\d+$/.test(x))
  if (at < 0) return null
  let end = at
  while (end < parts.length && /^\d+$/.test(parts[end])) end++
  if (end >= parts.length) return null
  return { product: parts.slice(0, at).join('_'), version: parts.slice(at, end).map((x) => String(Number(x))).join('.'), param: parts.slice(end).join('_') }
}

const POWER_PARAMS = new Map((variablesJson as { id: string; power_param?: string | null }[]).map((v) => [v.id, v.power_param ?? null]))
/** NASA POWER parameter of a catalog variable ("T2M"), or null. */
export const powerParamOf = (variableId: string): string | null => POWER_PARAMS.get(variableId) ?? null
