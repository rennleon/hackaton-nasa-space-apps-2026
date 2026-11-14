// Catalog shapes (regions/themes/variables/glossary). These are NOT part of the generated JSON-Schema contract,
// so they are written by hand to mirror catalog/*.yaml. Keep in sync with the backend catalog loader.
import type { Text } from './contract'

export type { Text }

export interface DeclaredSeason {
  variable: string
  id: string
  name: Text
  months: number[]
}

export interface RegionCard {
  id: string
  name: Text
  description: Text
  regime: string
  geometry: {
    kind: 'bbox' | 'shape'
    bbox: [number, number, number, number] // W, S, E, N
    shape_ref?: string | null
    area_fraction?: number
  }
  comparison_region: string | null
  listed?: boolean
  expectations?: unknown[]
  declared_seasons: DeclaredSeason[]
}

export interface ThemeCard {
  id: string
  name: Text
  question: Text
}

export interface VariableArtifact {
  kind: string
  start: string // YYYY-MM
  action: 'end_window_before' | 'flag'
  note: Text
}

export interface VariableCard {
  id: string
  giovanni_id: string
  name: Text
  definition: Text
  source: { instrument: string; platform?: string; type: 'observed' | 'model' }
  units: { native: string; display: string; simple: string; scale: number; offset: number; decimals: number }
  grid_deg: number
  record_start: string // YYYY-MM
  artifacts: VariableArtifact[]
  cross_check: string | null
  words: { subject?: string; up: string; down: string }
  kid_units?: unknown
  power_param?: string | null
  reference_trend_per_decade?: number | null
  themes: Record<string, 'target' | 'driver' | 'response' | 'cross_check'>
}

export interface GlossaryTerm {
  id: string
  term: Text
  definition: Text
}

export interface Catalog {
  regions: RegionCard[]
  themes: ThemeCard[]
  variables: VariableCard[]
  glossary: GlossaryTerm[]
}
