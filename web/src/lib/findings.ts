// Pure helpers for the Findings screen: who is available, sort order, summary counts, source tags.
import type { ScanEntry, VariableRef } from '../types/contract'
import type { Text, VariableCard } from '../types/catalog'
import { sortEntries } from './labels'
import { certaintyOf } from '../components/CertaintyMeter'
import { instrumentById } from './instruments'

export type Availability = ScanEntry['availability']
export type Certainty = ReturnType<typeof certaintyOf>

/**
 * Older precomputed scans have no `availability`: an entry without a slope has no usable series.
 * (Entries that do have a slope are available even when the verdict is "can't tell".)
 */
export function availabilityOf(e: ScanEntry): Availability {
  return e.availability ?? (e.slope_per_decade == null ? 'no_data_here' : 'available')
}

export interface Split {
  /** results first: strongest evidence at the top */
  available: ScanEntry[]
  unavailable: ScanEntry[]
}

export function splitEntries(entries: ScanEntry[]): Split {
  const sorted = sortEntries(entries)
  return {
    available: sorted.filter((e) => availabilityOf(e) === 'available'),
    unavailable: sorted.filter((e) => availabilityOf(e) !== 'available'),
  }
}

export interface Summary {
  total: number
  clear: number
  strongest: ScanEntry | null
}

/**
 * The scan card's "how sure": from `shortlist_label`, which applies the Benjamini-Hochberg correction across the
 * scan (changing = significant AND adjusted p below alpha). The variable page keeps its own single-variable verdict.
 */
export function certaintyOfEntry(e: ScanEntry): Certainty {
  switch (e.shortlist_label) {
    case 'changing':
      return 'sure'
    case 'possibly_changing':
      return 'maybe'
    case 'cant_tell':
      return 'cant_tell'
    default:
      return 'too_soon'
  }
}

/** "Clear change" means the card chip says sure (corrected for looking at many variables), the same signal the chip shows. */
export function summarize(available: ScanEntry[]): Summary {
  const sure = available.filter((e) => certaintyOfEntry(e) === 'sure')
  return { total: available.length, clear: sure.length, strongest: sure[0] ?? null }
}

export type Direction = 'up' | 'down' | 'flat'
export function directionOf(slope: number | null): Direction | null {
  if (slope == null) return null
  return slope > 0 ? 'up' : slope < 0 ? 'down' : 'flat'
}

/** Internal labels never reach the screen: "Cajamarca (test box)" shows as "Cajamarca". */
export function cleanPlaceName(name: string): string {
  return name.replace(/\s*\((?:our first )?test box\)/i, '').trim()
}

const NO_TEXT: Text = { simple: '', scientific: '' }

/** A VariableRef for a scan entry, so the same SourceTag works on cards and on the result page. */
export function variableRefFromEntry(e: ScanEntry, card?: VariableCard): VariableRef {
  const src = card?.source as (VariableCard['source'] & { instrument_id?: string | null; delivered_by?: string | null }) | undefined
  return {
    id: e.variable_id,
    giovanni_id: card?.giovanni_id ?? null,
    name: e.name,
    definition: card?.definition ?? NO_TEXT,
    source_type: e.source_type,
    instrument: src?.instrument ?? '',
    units: e.units,
    instrument_id: e.instrument_id ?? src?.instrument_id ?? null,
    platform: src?.platform ?? null,
    delivered_by: src?.delivered_by ?? null,
    cell_deg: card?.grid_deg ?? null,
  }
}

export interface SourceParts {
  kind: 'satellite' | 'model'
  /** short name, e.g. "AIRS" or "MERRA-2" */
  name: string
  /** "Aqua" (satellites only) */
  platform: string | null
  since: number | null
  viaPower: boolean
}

/** What to say about where a variable comes from. NASA POWER is a delivery service, never the instrument. */
export function sourceParts(v: VariableRef): SourceParts {
  const inst = instrumentById(v.instrument_id)
  const viaPower = (v.delivered_by ?? '').toUpperCase().includes('POWER')
  const kind = v.source_type === 'model' ? 'model' : 'satellite'
  const name = v.instrument || inst?.name.simple || ''
  return {
    kind,
    name: viaPower && !name ? 'MERRA-2' : name,
    platform: kind === 'satellite' ? (v.platform ?? inst?.platform ?? null) : null,
    since: inst?.since ?? null,
    viaPower,
  }
}
