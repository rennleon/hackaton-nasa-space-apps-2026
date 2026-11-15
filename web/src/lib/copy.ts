// Central place for UI copy that changes between the Simple and Scientific views (R5).
// Simple strings: everyday words, short sentences. A test (copy.test.ts) bans technical words here.
import type { Text } from '../types/contract'
import type { Verdict } from '../types/contract'

export type Certainty = Verdict['certainty']
export type VerdictLabelName = Verdict['label']

const tx = (simple: string, scientific: string): Text => ({ simple, scientific })

export const CERTAINTY_STEPS: { id: Exclude<Certainty, 'cant_tell'>; icon: 'soon' | 'maybe' | 'sure'; text: Text }[] = [
  { id: 'too_soon', icon: 'soon', text: tx('Too soon to tell', 'Not detectable yet') },
  { id: 'maybe', icon: 'maybe', text: tx('Maybe, not sure yet', 'Borderline or fragile') },
  { id: 'sure', icon: 'sure', text: tx("Sure it's real", 'Significant') },
]

export const CERTAINTY_CANT_TELL = { icon: 'cant' as const, text: tx("We can't tell here", "Can't tell here") }

export const COPY = {
  meterLabel: tx('How sure are we?', 'Evidence level'),
  tellMeMore: tx('Tell me more', 'Details'),
  modelTag: tx('computer model estimate', 'model / reanalysis'),
  observedTag: tx('satellite measurement', 'observation'),
  whyLooked: tx('Can we trust this?', 'Can we trust this? Evidence checks'),
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
    'Each dot is one year. The orange line shows where things are heading.',
    'Yearly means of the de-seasonalised values with the Sen trend line. Open circles are outside the window.',
  ),
  chartDotsIn: tx('Used in the answer', 'In window'),
  chartDotsOut: tx('Left out', 'Outside window'),
  chartLine: tx('Where it is heading', 'Trend'),
  moreCharts: tx('Show every month', 'Monthly series and 95% band'),
  trendLine: tx('The trend line', 'Trend'),
  range: tx('It could be anywhere between', '95% range'),
  checksAgree: tx('We ran two careful checks. Both say this is real.', 'Both decisive tests agree.'),
  checksFragile: tx('Both checks found a change. But something below makes us careful.', 'Both decisive tests agree; a robustness check lowers the label.'),
  checksDisagree: tx('We ran two careful checks. They do not both agree, so we stay careful.', 'The decisive tests do not both agree.'),
  // Choose a place (R2)
  chooseTitle: tx('Choose any place', 'Choose a place (NASA POWER)'),
  modePoint: tx('Drop a pin', 'Point'),
  modeBox: tx('Draw a box', 'Box'),
  mapLabel: tx('Mode', 'Selection mode'),
  helpPoint: tx('Click the map to drop a pin.', 'Click the map to set a point.'),
  helpBoxFirst: tx('Click one corner of your box.', 'Click the first corner of the box.'),
  helpBoxSecond: tx('Now click the opposite corner.', 'Click the opposite corner.'),
  latLabel: tx('How far north or south', 'Latitude (°N/°S)'),
  lonLabel: tx('How far east or west', 'Longitude (°E/°W)'),
  westLabel: tx('West side: how far east or west', 'West longitude (°E/°W)'),
  southLabel: tx('South side: how far north or south', 'South latitude (°N/°S)'),
  eastLabel: tx('East side: how far east or west', 'East longitude (°E/°W)'),
  northLabel: tx('North side: how far north or south', 'North latitude (°N/°S)'),
  sizeLabel: tx('Number of degrees', 'Degrees'),
  sideLabel: tx('Which side', 'Hemisphere'),
  north: tx('North', 'N'),
  south: tx('South', 'S'),
  east: tx('East', 'E'),
  west: tx('West', 'W'),
  formHelp: tx('Or type the numbers here.', 'Or enter coordinates (decimal degrees).'),
  usePlace: tx('Use this place', 'Use this place'),
  tooBig: tx('That area is too big. Pick a smaller one.', 'Box exceeds 10° × 10° (NASA POWER regional limit).'),
  badNumbers: tx('Please type numbers for every box.', 'Enter a number in every field.'),
  outOfRange: tx('Those numbers are not on Earth. Check them.', 'Out of range: latitude −90…90, longitude −180…180.'),
  cornersMixedUp: tx('The corners are mixed up. West must be left of east.', 'Requires W < E and S < N.'),
  yourPlace: tx('Your place', 'Custom place'),
  loadingPlace: tx('Asking NASA for data about your place…', 'Fetching NASA POWER monthly series…'),
  liveDown: tx("We can't reach NASA's live data right now. Try one of our ready-made places.", 'Live API unreachable; pre-loaded regions remain available.'),
  readyMade: tx('Ready-made places', 'Pre-loaded regions'),
  placeRejected: tx("We can't use that place. Try a smaller one.", 'The API rejected this place.'),
  placeRejectedOther: tx("We can't use that place. Try another one.", 'The API rejected this place.'),
  periodRejected: tx("Those years don't work. Try other years.", 'The API rejected this period.'),
  noLiveService: tx('Choosing any place needs our live service. Try a ready-made place.', 'Custom places require the API (VITE_API_URL not set).'),
  powerCredit: tx('Data: NASA POWER', 'Data: NASA POWER'),
  noChart: tx('There is no chart because there is not enough data.', 'No series available (gates failed).'),
} as const
