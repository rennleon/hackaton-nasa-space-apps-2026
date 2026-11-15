import type { Route } from './route'
import type { Text } from '../types/catalog'
import { rememberPlaceName, recallPlaceName } from './placeNames'

export interface DemoStep {
  route: Route
  /** `data-demo` value of the element this step points at; null = nothing to point at (centred note) */
  target: string | null
  caption: Text
}
export interface Demo {
  id: string
  /** short name for the start-page entry */
  label: Text
  title: Text
  /** a live example point opened by this demo: its name is remembered so the screens show it */
  place?: { key: string; name: string }
  steps: DemoStep[]
}

const tx = (simple: string, scientific: string): Text => ({ simple, scientific })

const DELHI = 'pt:28.61,77.21'

/**
 * Two scripted walkthroughs on the precomputed results (`public/data/results/`), so they work with no network.
 * Each step points at one thing that is on screen and says only what is there. Keep the narration in step with
 * the verdicts in those files (and with the Spanish in i18n/es.ts).
 */
export const DEMOS: Demo[] = [
  {
    id: 'cajamarca_water',
    label: tx('The mountains of Peru', 'Cajamarca highlands: afternoon humidity'),
    title: tx('Demo: are afternoons getting more humid in the Peruvian mountains?', 'Demo: surface relative humidity (AIRS), Cajamarca highlands'),
    steps: [
      {
        route: { screen: 'home' },
        target: 'ready-cajamarca_highlands',
        caption: tx('First we pick a place. This one is in the mountains of Peru.', 'Pick a place. This pre-loaded region is the Cajamarca highlands, northern Peruvian Andes.'),
      },
      {
        route: { screen: 'home', region: 'cajamarca_highlands' },
        target: 'question-water',
        caption: tx('Then we ask a question. Water: is it getting wetter or drier here?', 'Pick a question. Water selects the precipitation, soil moisture, evaporation and humidity series.'),
      },
      {
        route: { screen: 'shortlist', region: 'cajamarca_highlands', theme: 'water' },
        target: 'finding-airs_rh_surf_day',
        caption: tx(
          'Each card is one measurement. The afternoon humidity card says "Sure it\'s real".',
          'The scan compares all series over one shared window, 2002 to 2021. Surface relative humidity (AIRS) is significant.',
        ),
      },
      {
        route: { screen: 'variable', region: 'cajamarca_highlands', theme: 'water', variable: 'airs_rh_surf_day' },
        target: 'verdict',
        caption: tx(
          'Yes, afternoons are getting more humid. We are sure. About 66 on the humidity scale in 2002, about 69 in 2021.',
          'Significant increase in surface relative humidity, 2002 to 2021: +1.33 %RH per decade (95% CI +1.15 to +1.50), both decisive tests agree.',
        ),
      },
      {
        route: { screen: 'variable', region: 'cajamarca_highlands', theme: 'water', variable: 'airs_rh_surf_day' },
        target: 'source',
        caption: tx(
          'AIRS, an instrument on the Aqua satellite, measured this.',
          'Variable: surface relative humidity, daytime. Source: AIRS on the Aqua satellite, Level 3 monthly data, 1° grid.',
        ),
      },
      {
        route: { screen: 'variable', region: 'cajamarca_highlands', theme: 'water', variable: 'airs_rh_surf_day' },
        target: 'trust-second',
        caption: tx(
          'Can we trust this? The MERRA-2 computer model points the same way and is sure too. But the two share some data.',
          'Second opinion from MERRA-2 (a model), 2002 to 2021: +1.85 %RH per decade, same direction, also significant. It assimilates AIRS, so the two are not independent.',
        ),
      },
      {
        route: { screen: 'variable', region: 'cajamarca_highlands', theme: 'water', variable: 'airs_rh_surf_day' },
        target: 'where',
        caption: tx(
          'Only Cajamarca says "Sure it\'s real". Four places say "Too soon to tell". The high-mountain box has too few map squares to tell.',
          'The same variable in the other ready-made places, each analysed separately over 2002 to 2021: none of the four other places is significant, and the highland-only box cannot be tested (2 AIRS cells; the gate needs 4).',
        ),
      },
    ],
  },
  {
    id: 'delhi_air',
    label: tx('A big city, Delhi', 'Delhi: aerosols'),
    title: tx('Demo: is the air getting hazier in Delhi?', 'Demo: aerosol optical depth, Delhi'),
    place: { key: DELHI, name: 'Delhi, India' },
    steps: [
      {
        route: { screen: 'home' },
        target: 'ready-delhi',
        caption: tx('First we pick a place. Delhi is a huge city in India.', 'Pick a place. This ready-made example is Delhi, India, a dense urban area.'),
      },
      {
        route: { screen: 'home', place: DELHI },
        target: 'question-air',
        caption: tx('Then we ask about the air: is it getting hazier or smokier?', 'Pick a question. Air selects the aerosol and trace-gas series.'),
      },
      {
        route: { screen: 'shortlist', place: DELHI, theme: 'air' },
        target: 'finding-power_aod',
        caption: tx('Each card is one measurement. The haze card says "Sure it\'s real".', 'Scan for air: aerosol optical depth (CERES SYN1deg via NASA POWER) is significant over the shared window.'),
      },
      {
        route: { screen: 'variable', place: DELHI, theme: 'air', variable: 'power_aod' },
        target: 'verdict',
        caption: tx(
          'Yes, the air is getting hazier in Delhi. We are sure. About 59 on the haze scale in 2001, about 72 in 2025.',
          'Significant increase in AOD at 550 nm, 2001 to 2025: +0.050 per decade (95% CI +0.023 to +0.077).',
        ),
      },
      {
        route: { screen: 'variable', place: DELHI, theme: 'air', variable: 'power_aod' },
        target: 'source',
        caption: tx(
          'This measurement is haze in the air. A computer model worked it out.',
          'Variable: aerosol optical depth. Source: CERES SYN1deg (a NASA data product, labelled a computer estimate), delivered by NASA POWER.',
        ),
      },
      {
        // MERRA-2 persists its emissions after 2008 (Randles et al. 2017), so this series is never "sure" across it
        route: { screen: 'variable', place: DELHI, theme: 'air', variable: 'merra2_sulfate' },
        target: 'verdict',
        caption: tx(
          'Now tiny sulfate particles, from a computer model. Here it says "Maybe, not sure yet".',
          'Surface sulfate (MERRA-2), Delhi: significant but not robust, because the window crosses a known break in the model inputs.',
        ),
      },
      {
        route: { screen: 'variable', place: DELHI, theme: 'air', variable: 'merra2_sulfate' },
        target: 'where',
        caption: tx(
          'Why? After 2008 the model stopped updating pollution. Good detectives check how data is made.',
          'MERRA-2 persists anthropogenic emissions after 2008 (Randles et al. 2017, Table 1), so no place gets a robust result for this series.',
        ),
      },
    ],
  },
]

export const demoById = (id: string) => DEMOS.find((d) => d.id === id)

/** The route that starts a demo. */
export const demoStart = (d: Demo): Route => ({ ...d.steps[0].route, demo: d.id, step: 0 })

/** Make sure a demo's example place shows its real name on the screens (the route only carries coordinates). */
export function prepareDemo(demoId: string): void {
  const p = demoById(demoId)?.place
  if (p && recallPlaceName(p.key) !== p.name) rememberPlaceName(p.key, p.name)
}
