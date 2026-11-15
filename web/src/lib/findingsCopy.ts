// UI copy for the Findings screen, the source tag and the "Where our data comes from" page.
// Every entry has a Simple wording (for a primary-school child, R5) and a Scientific one. Components read them
// with useL(), which routes through the i18n helper under the key `<entry key>` (same words in both views) or `<entry key>.<view>`, so Spanish can be added
// in i18n/es.ts without touching a component. findingsCopy.test.ts bans technical words in the Simple strings.
import { useT } from '../i18n'
import { useView } from '../context'

export interface Pair {
  simple: string
  scientific: string
}
const p = (simple: string, scientific = simple): Pair => ({ simple, scientific })

export const FC = {
  // header and edit bar
  'findings.eyebrow': p('Findings for this place'),
  'findings.edit': p('Edit'),
  'findings.editLabel': p('Change your choices', 'Change region, theme, period or season'),
  'findings.chip.place': p('Place', 'Region'),
  'findings.chip.question': p('Question', 'Theme'),
  'findings.chip.years': p('Years', 'Period'),
  'findings.chip.season': p('Time of year', 'Season'),
  'findings.from': p('From'),
  'findings.to': p('To'),
  'findings.anyYear': p('any', 'default'),
  'findings.allMonths': p('Whole year', 'All months'),
  'findings.changePlace': p('Change place'),
  'findings.yearsHint': p('Leave empty to use all the years we have.', 'Empty means the default window. Applied when you open a result.'),
  'findings.seasonHint': p(
    "Some measurements can't show one time of year. They open with the whole year.",
    'Variables that do not declare this season open on all months.',
  ),
  'findings.commonWindow': p(
    'We compare every measurement over the same years: {start} to {end}.',
    'Common window {start} to {end} for all variables (fair comparison across record lengths).',
  ),
  'findings.scanNote': p('Measurements that could answer this question.', 'Scan of {n} variables, α = {alpha}, Benjamini–Hochberg adjusted (false discovery control).'),
  // summary banner
  'findings.summary.some': p('{clear} of {total} measurements show a clear change.', '{clear} of {total} variables significant (both tests agree, α = {alpha}).'),
  'findings.summary.one': p('{clear} of {total} measurements shows a clear change.', '{clear} of {total} variables significant (both tests agree, α = {alpha}).'),
  'findings.summary.oneOfOne': p('The measurement shows a clear change.', '1 of 1 variables significant (both tests agree, α = {alpha}).'),
  'findings.summary.none': p("We can't see a clear change yet. We looked at {total} measurements.", '0 of {total} variables significant (α = {alpha}).'),
  'findings.summary.noneOne': p("We can't see a clear change yet. We looked at 1 measurement.", '0 of 1 variables significant (α = {alpha}).'),
  'findings.strongest': p('Strongest: {name}.', 'Strongest: {name}, {slope}.'),
  // states
  'findings.loading': p('Asking NASA for the data…', 'Fetching data from NASA…'),
  'findings.error.down': p("We couldn't reach NASA right now. Try again.", 'The live data service could not be reached. Try again.'),
  'findings.error.noSaved': p("We don't have results for this place and question yet.", 'No precomputed scan for this region and theme.'),
  'findings.retry': p('Try again', 'Retry'),
  'findings.empty.title': p('NASA has no data for this place and question yet.', 'No variable has usable data for this place and theme.'),
  'findings.empty.help': p('Try another question or another place.', 'Try another theme or region.'),
  'findings.otherQuestions': p('Other questions', 'Other themes'),
  'findings.readyMade': p('Ready-made places', 'Pre-loaded regions'),
  'findings.livePlace': p('Data: NASA POWER (MERRA-2-based)'),
  'findings.pickRegion': p('Pick a place first.', 'Pick a region first.'),
  'findings.choosePlace': p('Choose a place', 'Choose a region'),
  // cards
  'findings.open': p('Open {name}', 'Open {name}'),
  'findings.recommended': p('Recommended', 'Selected for investigation'),
  'findings.hardToSpot': p('Hard to spot with this record', 'Low detectability with this record'),
  'findings.secondOpinion': p('Second opinion'),
  'findings.second.agree': p('Two instruments agree', 'Instruments agree (same direction, both significant)'),
  'findings.second.same_direction_one_unsure': p('Same direction, one not sure yet', 'Same direction, only one significant'),
  'findings.second.disagree': p('They disagree', 'Opposite directions, both significant'),
  'findings.second.both_unsure': p("They don't tell the same story yet", 'No agreement: neither significant, or only one significant with opposite sign'),
  'findings.second.only_one': p('Only one instrument here'),
  'findings.heading.up': p('Heading up', 'Trend up'),
  'findings.heading.down': p('Heading down', 'Trend down'),
  'findings.heading.flat': p('Staying level', 'Flat'),
  'findings.spark': p('One dot for each year, {from} to {to}.', 'Yearly de-seasonalised means, {from} to {to}.'),
  'findings.cardYears': p('Years used here: {from} to {to}', 'Window {from}–{to} (shared across the scan)'),
  'findings.adjP': p('adj. p = {p}'),
  // verdict chip
  'findings.chip.too_soon': p('Too soon to tell', 'Not detectable yet'),
  'findings.chip.maybe': p('Maybe, not sure yet', 'Borderline or fragile'),
  'findings.chip.sure': p("Sure it's real", 'Significant'),
  'findings.chip.cant_tell': p("We can't tell here", "Can't tell here"),
  // not available row
  'findings.notAvailable': p('Not available for this place ({n})'),
  'findings.unavailable.no_data_here': p("We don't have this one for this place.", 'No data for this place.'),
  'findings.unavailable.too_short': p("It hasn't watched this place for enough years.", 'Record too short.'),
  'findings.unavailable.too_many_gaps': p('Too many months are missing.', 'Too many gaps in the record.'),
  'findings.unavailable.fetch_failed': p("We couldn't get this one from NASA this time.", 'Fetch failed.'),
  'findings.coverage': p('Years of data', 'Record coverage'),
  'findings.timeline.aria': p('How many years of data each measurement has', 'Record coverage timeline'),
  'findings.timeline.row': p('{name}: used {from} to {to}', '{name}: used {from} to {to}'),
  'findings.timeline.rowDrift': p('{name}: used {from} to {to}; {cut} onward left out ({note})', '{name}: used {from} to {to}; {cut} onward left out ({note})'),
  'findings.timeline.used': p('years we use', 'analysis window'),
  'findings.timeline.out': p('years left out (satellite drift)', 'excluded (orbit drift)'),
  'findings.mdt': p('', 'MDT {mdt} {unit}/decade'),
  // source tag
  'common.source.satellite': p('Satellite'),
  'common.source.model': p('Computer model estimate', 'Computer model'),
  'common.source.since': p('since {year}'),
  'common.source.viaPower': p('via NASA POWER'),
  'common.source.satelliteOf': p('{platform} satellite'),
  'common.source.modelOf': p('{name} computer model'),
  // sources page and links
  'sources.link': p('Where our data comes from', 'Data sources'),
  'sources.title': p('Where our data comes from', 'Data sources'),
  'sources.intro': p(
    'Every number in this app comes from NASA. Some come from satellites. Some come from computer models.',
    'All series are NASA products: satellite retrievals (Giovanni, GES DISC) and model reanalyses (MERRA-2, GLDAS), plus NASA POWER as a delivery service.',
  ),
  'sources.powerNote': p(
    'NASA POWER is a delivery service. It hands us numbers from the MERRA-2 computer model.',
    'NASA POWER is a delivery service, not an instrument: its series are MERRA-2 reanalysis values.',
  ),
  'sources.measures': p('What it measures', 'Measures'),
  'sources.how': p('How it works', 'Method'),
  'sources.since': p('Since {year}', 'since {year}'),
  'sources.platform': p('Rides on {platform}', 'Platform: {platform}'),
  'sources.usedFor': p('We use it for', 'Variables from it'),
  'sources.nothingYet': p('Nothing in the app uses it yet.', 'No listed variable uses it.'),
  'sources.nasaPage': p('NASA page about it', 'Mission page'),
  'sources.live.giovanni': p('Fresh from NASA when you ask', 'Live (NASA Giovanni)'),
  'sources.live.power': p('Fresh from NASA when you ask', 'Live (NASA POWER)'),
  'sources.live.offline': p('Saved inside the app', 'Offline (saved export only)'),
  'sources.kind.satellite': p('Satellite', 'Satellite instrument'),
  'sources.kind.model': p('Computer model', 'Model / reanalysis'),
  'sources.viaPower': p('via NASA POWER'),
  'common.footer': p(
    'Map data © OpenStreetMap contributors. Data: NASA satellite and model products via NASA Giovanni (GES DISC) and NASA POWER; results computed by our analysis engine.',
  ),
} as const satisfies Record<string, Pair>

export type FKey = keyof typeof FC

/** Translating lookup bound to the current view: l('findings.eyebrow'), l('findings.open', { name }). */
export function useL() {
  const t = useT()
  const { view } = useView()
  // one key when both registers read the same, `<key>.simple` / `<key>.scientific` when they differ
  return (key: FKey, vars?: Record<string, string | number>) => {
    const pair: Pair = FC[key]
    return t(pair.simple === pair.scientific ? key : `${key}.${view}`, pair[view], vars)
  }
}
