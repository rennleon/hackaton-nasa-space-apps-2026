// Instruments and models behind every number (catalog/instruments.yaml, exported to instruments.json).
// Bundled with the app so the source tag and the "Where our data comes from" page work with no network.
import instrumentsJson from '../../public/data/catalog/instruments.json'
import type { Text } from '../types/catalog'

export interface Instrument {
  id: string
  name: Text
  kind: 'satellite' | 'model'
  platform: string | null
  since: number
  measures: Text
  how: Text
  /** giovanni and power are fetched live; offline means saved files only */
  live: 'giovanni' | 'power' | 'offline'
  link?: string | null
}

export const INSTRUMENTS = instrumentsJson as Instrument[]

export const instrumentById = (id: string | null | undefined): Instrument | undefined =>
  id ? INSTRUMENTS.find((i) => i.id === id) : undefined
