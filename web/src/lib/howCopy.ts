// Copy for the "How it works" page (screens/HowItWorks.tsx): the pipeline from "pick a place" to the verdict.
// Same pattern as findingsCopy.ts: every entry has a Simple wording (R5, a primary-school child) and a Scientific one,
// read with useH(), which routes through the i18n helper under `<key>` (same words in both views) or `<key>.<view>`.
// Spanish lives in i18n/es.ts; i18n/extractKeys.ts lists these keys so a test fails when one has no Spanish.
import { useT } from '../i18n'
import { useView } from '../context'

interface Pair {
  simple: string
  scientific: string
}
const p = (simple: string, scientific = simple): Pair => ({ simple, scientific })

export type Band = 'get' | 'clean' | 'trend' | 'check'

export interface Step {
  n: number
  band: Band
  /** backend module(s) that do the step, shown in the Scientific view */
  modules: string[]
}

export const BANDS: Band[] = ['get', 'clean', 'trend', 'check']

export const STEPS: Step[] = [
  { n: 1, band: 'get', modules: ['api.py', 'catalog.py'] },
  { n: 2, band: 'get', modules: ['sources/giovanni_csv.py', 'sources/giovanni_api.py', 'sources/power.py'] },
  { n: 3, band: 'clean', modules: ['sources/base.py', 'sources/giovanni_api.py', 'sources/power.py'] },
  { n: 4, band: 'clean', modules: ['sources/giovanni_api.py'] },
  { n: 5, band: 'clean', modules: ['sources/base.py'] },
  { n: 6, band: 'clean', modules: ['ingest.py'] },
  { n: 7, band: 'clean', modules: ['prepare.py'] },
  { n: 8, band: 'clean', modules: ['gates.py'] },
  { n: 9, band: 'clean', modules: ['selection.py'] },
  { n: 10, band: 'trend', modules: ['prepare.py'] },
  { n: 11, band: 'trend', modules: ['stats.py'] },
  { n: 12, band: 'trend', modules: ['stats.py'] },
  { n: 13, band: 'trend', modules: ['stats.py'] },
  { n: 14, band: 'check', modules: ['robustness.py', 'engine.py', 'gates.py'] },
  { n: 15, band: 'check', modules: ['scan.py'] },
  { n: 16, band: 'check', modules: ['verdict.py', 'engine.py'] },
]

export const HOW = {
  'how.link': p('How it works'),
  'how.title': p('How it works'),
  'how.lead': p(
    'Follow the numbers from your question to the answer.',
    'Every step the data goes through, from the place you pick to the verdict. The backend module for each step is shown in small type.',
  ),
  'how.stepN': p('Step {n}'),
  'how.code': p('Code'),
  'how.flowLabel': p('Steps from your question to the answer', 'Pipeline steps, in order'),
  'how.band.get': p('Get the data'),
  'how.band.clean': p('Clean it'),
  'how.band.trend': p('Find the trend'),
  'how.band.check': p('Check and explain'),
  'how.pic.label': p(
    'Before: a wavy line. After: a calmer line with a small tilt.',
    'Before: raw monthly series with a seasonal wave. After: monthly anomalies with a small trend.',
  ),
  'how.pic.before': p('Before'),
  'how.pic.after': p('After'),

  'how.s1.title': p('Pick a question and a place', 'Choose a theme and a place'),
  'how.s1.text': p(
    'You pick a question, like heat, water or air. Then you pick a place.',
    'Theme (heat, water or air), then a pre-loaded region, a point, or a drawn box (W, S, E, N).',
  ),
  'how.s2.title': p('Ask NASA for the numbers', 'Fetch NASA data'),
  'how.s2.text': p(
    'We ask NASA for the numbers. Saved copies work with no internet.',
    'Source chain, first that answers: a pre-loaded Giovanni CSV (Giovanni\'s own area average), then NASA POWER (MERRA-2 for temperature, rain and humidity; CERES SYN1deg for haze; serves only its own variables), then the NASA Giovanni time-series API (saved copy first, then live, with a server-side Earthdata token). Saved copies make the demo work offline.',
  ),
  'how.s3.title': p('Clean the numbers'),
  'how.s3.text': p(
    'We throw out broken numbers. We also drop squares outside your place.',
    'Fill values (−9999, −999, 1e15 …) become missing. The unit the source reports is checked against our catalog card (Giovanni API and NASA POWER); a mismatch stops the run. Grid cells that snapped outside the box are dropped.',
  ),
  'how.s4.title': p('Make months', 'Build monthly values'),
  'how.s4.text': p(
    'Some numbers come every day or hour. We turn them into one number per month.',
    'Daily products become a monthly mean only if at least 10 days are valid (OMI). Hourly products only if at least 90% of the hours are valid (MERRA-2 aerosols).',
  ),
  'how.s5.title': p('Average the map squares', 'Average the grid cells'),
  'how.s5.text': p(
    'We average all the map squares inside your place. Bigger squares count more.',
    "The product's own fixed grid cells inside the box (MERRA-2 and POWER 0.5°×0.625°, POWER haze, AIRS, MODIS and OMI aerosol 1°, GLDAS and OMI NO₂ 0.25°, GPM 0.1°), combined as a cos(latitude)-weighted mean. Each cell is fitted as the box series plus its own fixed offset per calendar month, estimated over the months it shares with the box, so a cell that stops reporting can neither create a trend nor shrink a real one; with every cell present this is exactly the weighted mean. A month needs at least half the cells. (Pre-loaded Giovanni CSVs arrive already averaged by Giovanni.)",
  ),
  'how.s6.title': p('Use everyday units', 'Convert to student units'),
  'how.s6.text': p(
    'We switch to units you know, like degrees and millimetres of rain a day.',
    'Per-variable scale and offset: K to °C, kg m⁻² s⁻¹ to mm/day, mm/hr to mm/day.',
  ),
  'how.s7.title': p('Choose the years', 'Choose the window'),
  'how.s7.text': p(
    "We use all the years we have. We skip years we can't trust.",
    'Full record. AIRS surface humidity and temperature end before 2022, because the Aqua orbit drift changes the pass time. Other known breaks (OMI row anomaly 2007, GPM input change 2014, GLDAS forcing changes, MODIS drift) keep the data and show a warning.',
  ),
  'how.s8.title': p('Is the data good enough?', 'Quality gates'),
  'how.s8.text': p(
    "We need many years and enough map squares. If not, we say we can't tell.",
    'At least 15 years, at least 4 grid cells (or one cell for a point), at least 90% of months present, at most 30% of months at zero, and the product covers the place. If a gate fails the answer is "can\'t tell", never a number.',
  ),
  'how.s9.title': p('Is it worth a look?', 'Selection (stage 1)'),
  'how.s9.text': p(
    'We choose what to check before we see any answer. That keeps us fair.',
    'Uses only what is known before the trend is computed: the question, a cited published reason to expect change, fitness, and the minimum detectable trend (Weatherhead et al. 1998).',
  ),
  'how.s10.title': p('Take away the seasons', 'Remove the seasonal cycle'),
  'how.s10.text': p(
    'Summer is always warmer than winter. We take that out, so only the real change is left.',
    "Subtract each calendar month's long-term mean over the window (at least 3 values per month) to get monthly anomalies. The share of variance explained by the seasonal cycle is reported.",
  ),
  'how.s11.title': p('Handle the jumps', 'Handle the noise (no smoothing)'),
  'how.s11.text': p(
    "Weather jumps up and down. We don't hide the jumps. We make our checks stricter instead. The chart shows one dot per year.",
    'The series is not smoothed or filtered before testing, because smoothing manufactures persistence and false trends. Instead, month-to-month persistence is measured (lag-1 autocorrelation of the residuals) and the tests are corrected for it (effective sample size; Hamed–Rao variance). The Simple chart shows one dot per year.',
  ),
  'how.s12.title': p('Measure the change', 'Measure the rate of change'),
  'how.s12.text': p(
    'We draw the line that best follows the dots. Its tilt shows the change.',
    "Sen's slope per 10 years, with a 95% range from the persistence-corrected (Hamed–Rao) variance. The chart band and the verdict range come from the same calculation.",
  ),
  'how.s13.title': p('Two checks must agree', 'Two tests must agree'),
  'how.s13.text': p(
    'We run two different checks. We say "sure" only if both agree.',
    'Test A: Mann–Kendall with Hamed–Rao correction. Test B: OLS t-test with effective sample size (Santer et al. 2000). "Sure" only if both give p < 0.05. Context only: seasonal Mann–Kendall, and a Welch test on the 12 per-month slopes (Welch 1951) that notes when the change is bigger in some months than in others.',
  ),
  'how.s14.title': p('Try to break the answer', 'Robustness checks'),
  'how.s14.text': p(
    'We try to prove ourselves wrong. We leave out years and try other data.',
    'Leave-one-year-out; re-run with the drift years included; a second instrument over the overlapping years (never the same model twice); a step check on the excluded years; a near-0/100 warning for humidity; a chip when the data box differs from the place.',
  ),
  'how.s15.title': p('Compare fairly', 'Compare fairly (many tests at once)'),
  'how.s15.text': p(
    'We look at every measurement over the same years. That keeps it fair.',
    'The scan compares all variables of a question over one shared window and adjusts for many tests at once (Benjamini–Hochberg).',
  ),
  'how.s16.title': p('Say it plainly', 'Report the verdict'),
  'how.s16.text': p(
    'You get a short answer and a three-step meter. Then you see then and now.',
    'Labels map to the three-step meter ("Sure it\'s real", "Maybe, not sure yet", "Too soon to tell", plus "can\'t tell"). Then-vs-now in whole numbers; the per-10-years rate with its 95% range in the Scientific view. We never write "caused by", "proves" or "no change".',
  ),
} as const satisfies Record<string, Pair>

export type HKey = keyof typeof HOW

/** Translating lookup bound to the current view: h('how.title'), h('how.stepN', { n: 3 }). */
export function useH() {
  const t = useT()
  const { view } = useView()
  // one key when both registers read the same, `<key>.simple` / `<key>.scientific` when they differ
  return (key: HKey, vars?: Record<string, string | number>) => {
    const pair: Pair = HOW[key]
    return t(pair.simple === pair.scientific ? key : `${key}.${view}`, pair[view], vars)
  }
}
