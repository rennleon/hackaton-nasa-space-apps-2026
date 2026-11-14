// Central place for UI copy that changes between the Simple and Scientific views (R5).
// Simple strings: everyday words, short sentences. A test (copy.test.ts) bans technical words here.
import type { Text } from '../types/contract'
import type { Verdict } from '../types/contract'

export type Certainty = Verdict['certainty']
export type VerdictLabelName = Verdict['label']

const tx = (simple: string, scientific: string): Text => ({ simple, scientific })

export const CERTAINTY_STEPS: { id: Exclude<Certainty, 'cant_tell'>; icon: string; text: Text }[] = [
  { id: 'too_soon', icon: '⏳', text: tx('Too soon to tell', 'Not detectable yet') },
  { id: 'maybe', icon: '🤔', text: tx('Maybe, not sure yet', 'Borderline or fragile') },
  { id: 'sure', icon: '✔', text: tx("Sure it's real", 'Significant') },
]

export const CERTAINTY_CANT_TELL = { icon: '?', text: tx("We can't tell here", "Can't tell here") }

export const COPY = {
  meterLabel: tx('How sure are we?', 'Evidence level'),
  tellMeMore: tx('Tell me more', 'Details'),
  modelTag: tx('computer model estimate', 'model / reanalysis'),
  observedTag: tx('satellite measurement', 'observation'),
  whyLooked: tx('Why we looked at this', 'Selection checks (stage 1)'),
  worthYes: tx('Worth a closer look', 'Worth investigating'),
  worthNo: tx('Not a good fit here', 'Not selected (stage 1)'),
  checkPass: tx('OK', 'Pass'),
  checkCaution: tx('Careful', 'Caution'),
  checkFail: tx('No', 'Fail'),
  commonWindow: (start: string, end: string): Text =>
    tx(
      `We compare every measurement over the same years: ${start} to ${end}.`,
      `Common window ${start} to ${end} for all variables (fair comparison across record lengths).`,
    ),
  shortlistIntro: tx('Measurements that could answer this question.', 'Variables scanned for this theme.'),
  yearsOfData: (n: number): Text => tx(`We looked at ${n} years of data.`, `${n} years of data in the window.`),
  chartTitle: tx('One dot for every year', 'Yearly means and trend'),
  chartCaption: tx(
    'Each dot is one year. The orange line shows where things are heading. Grey dots were left out.',
    'Yearly means of the de-seasonalised values with the Sen trend line. Open circles are outside the window.',
  ),
  chartAxis: tx('← lower · higher →', 'Anomaly'),
  chartDotsIn: tx('Used in the answer', 'In window'),
  chartDotsOut: tx('Left out', 'Outside window'),
  chartLine: tx('Where it is heading', 'Trend'),
  moreCharts: tx('Show every month', 'Monthly series and 95% band'),
  trendLine: tx('The trend line', 'Trend'),
  range: tx('It could be anywhere between', '95% range'),
  checksAgree: tx('We ran two careful checks. Both say this is real.', 'Both decisive tests agree.'),
  checksDisagree: tx('We ran two careful checks. They do not both agree, so we stay careful.', 'The decisive tests do not both agree.'),
  noChart: tx('There is no chart because there is not enough data.', 'No series available (gates failed).'),
} as const
