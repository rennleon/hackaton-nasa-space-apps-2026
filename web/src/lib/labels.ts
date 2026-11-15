import type { ScanEntry, Verdict } from '../types/contract'
import type { Text } from '../types/catalog'

export type ShortlistLabel = ScanEntry['shortlist_label']
export type VerdictLabel = Verdict['label']

export interface LabelMeta {
  /** i18n key stem: the Spanish for text.simple / text.scientific sits under `<key>.simple` / `<key>.sci` */
  key: string
  icon: string // never the only signal: always shown next to text
  text: Text
  tone: 'strong' | 'medium' | 'none' | 'unknown'
}

export const SHORTLIST_META: Record<ShortlistLabel, LabelMeta> = {
  changing: { key: 'label.shortlist.changing', icon: '▲', tone: 'strong', text: { simple: 'Changing', scientific: 'Changing' } },
  possibly_changing: { key: 'label.shortlist.possibly_changing', icon: '◔', tone: 'medium', text: { simple: 'Maybe changing', scientific: 'Possibly changing' } },
  no_detectable_change: {
    key: 'label.shortlist.no_detectable_change', icon: '＝',
    tone: 'none',
    text: { simple: 'No change we can see yet', scientific: 'No detectable change yet' },
  },
  cant_tell: { key: 'label.shortlist.cant_tell', icon: '?', tone: 'unknown', text: { simple: "Can't tell here", scientific: "Can't tell here" } },
}

export const VERDICT_META: Record<VerdictLabel, LabelMeta> = {
  significant: { key: 'label.verdict.significant', icon: '▲', tone: 'strong', text: { simple: 'Real change', scientific: 'Significant change' } },
  significant_fragile: {
    key: 'label.verdict.significant_fragile', icon: '▲!',
    tone: 'strong',
    text: { simple: 'Real change, but fragile', scientific: 'Significant, fragile' },
  },
  borderline: { key: 'label.verdict.borderline', icon: '◑', tone: 'medium', text: { simple: 'Almost sure', scientific: 'Borderline' } },
  possibly_changing: { key: 'label.verdict.possibly_changing', icon: '◔', tone: 'medium', text: { simple: 'Maybe changing', scientific: 'Possibly changing' } },
  no_detectable_change: {
    key: 'label.verdict.no_detectable_change', icon: '＝',
    tone: 'none',
    text: { simple: 'Not clear yet', scientific: 'No detectable change yet' },
  },
  cant_tell: { key: 'label.verdict.cant_tell', icon: '?', tone: 'unknown', text: { simple: "Can't tell here", scientific: "Can't tell here" } },
}

const ORDER: Record<ShortlistLabel, number> = { changing: 0, possibly_changing: 1, no_detectable_change: 2, cant_tell: 3 }

/** Strongest evidence first; ties by smaller decisive p, unknown p last. */
export function sortEntries(entries: ScanEntry[]): ScanEntry[] {
  return [...entries].sort(
    (a, b) =>
      ORDER[a.shortlist_label] - ORDER[b.shortlist_label] ||
      (a.p_decisive ?? Infinity) - (b.p_decisive ?? Infinity) ||
      a.variable_id.localeCompare(b.variable_id),
  )
}
