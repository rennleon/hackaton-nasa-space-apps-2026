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
    id: 'cajamarca_heat',
    label: tx('The mountains of Peru', 'Cajamarca highlands: temperature'),
    title: tx('Demo: is it getting warmer in the Peruvian mountains?', 'Demo: 2-m air temperature, Cajamarca highlands'),
    steps: [
      {
        route: { screen: 'home' },
        target: 'ready-cajamarca_highlands',
        caption: tx('First we pick a place. This one is in the mountains of Peru.', 'Pick a place. This pre-loaded region is the Cajamarca highlands, northern Peruvian Andes.'),
      },
      {
        route: { screen: 'home', region: 'cajamarca_highlands' },
        target: 'question-heat',
        caption: tx('Then we ask a question. Heat: is it getting hotter or colder?', 'Pick a question. Heat selects the temperature series for this region.'),
      },
      {
        route: { screen: 'shortlist', region: 'cajamarca_highlands', theme: 'heat' },
        target: 'finding-power_t2m',
        caption: tx(
          'Each card is one measurement. Over only 2002 to 2021, air temperature says "Too soon to tell".',
          'The scan compares all series over one shared window, 2002 to 2021. Over that window air temperature (MERRA-2) is not significant.',
        ),
      },
      {
        route: { screen: 'variable', region: 'cajamarca_highlands', theme: 'heat', variable: 'power_t2m' },
        target: 'verdict',
        caption: tx(
          'With all the years, 1981 to 2025, the answer is yes. The meter says we are sure: about 17 degrees then, about 18 now.',
          'Over the full record, 1981 to 2025, the trend is significant: +0.24 °C per decade (95% CI +0.16 to +0.32), both decisive tests agree.',
        ),
      },
      {
        route: { screen: 'variable', region: 'cajamarca_highlands', theme: 'heat', variable: 'power_t2m' },
        target: 'source',
        caption: tx(
          'This measurement is air temperature. A computer model called MERRA-2 worked it out.',
          'Variable: 2-m air temperature. Source: MERRA-2 reanalysis (a model), delivered by NASA POWER.',
        ),
      },
      {
        route: { screen: 'variable', region: 'cajamarca_highlands', theme: 'heat', variable: 'power_t2m' },
        target: 'trust-second',
        caption: tx(
          'Can we trust this? AIRS, an instrument on the Aqua satellite, gives a second opinion. It points the same way, but is not sure yet.',
          'Second opinion from AIRS (Aqua satellite), 2002 to 2021: same direction, but not significant over that shorter window.',
        ),
      },
      {
        route: { screen: 'variable', region: 'cajamarca_highlands', theme: 'heat', variable: 'power_t2m' },
        target: 'where',
        caption: tx(
          'Where else? The same measurement in other places. In the Amazon it goes up too, and we are sure.',
          'The same variable in the ready-made places, each with its own full record. Manaus is also significant and increasing.',
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
        caption: tx('Each card is one measurement. The haze card says "Sure it\'s real".', 'Scan for air: aerosol optical depth (MERRA-2 via NASA POWER) is significant over the shared window.'),
      },
      {
        route: { screen: 'variable', place: DELHI, theme: 'air', variable: 'power_aod' },
        target: 'verdict',
        caption: tx(
          'Yes, the air is getting hazier in Delhi. We are sure: about 59 on the haze scale in 2001, about 72 in 2025.',
          'Significant increase in AOD at 550 nm, 2001 to 2025: +0.050 per decade (95% CI +0.023 to +0.077).',
        ),
      },
      {
        route: { screen: 'variable', place: DELHI, theme: 'air', variable: 'power_aod' },
        target: 'source',
        caption: tx(
          'This measurement is haze in the air. A computer model worked it out.',
          'Variable: aerosol optical depth. Source: MERRA-2 reanalysis (a model), delivered by NASA POWER.',
        ),
      },
      {
        route: { screen: 'variable', place: DELHI, theme: 'air', variable: 'merra2_sulfate' },
        target: 'where',
        caption: tx(
          'Now pollution from burning coal and oil, from a computer model. It goes up in Delhi and down in the Sahara.',
          'Surface sulfate (MERRA-2): significant increase in Delhi, significant decrease near Tamanrasset, each with its own record.',
        ),
      },
      {
        route: { screen: 'variable', place: DELHI, theme: 'air', variable: 'merra2_sulfate' },
        target: 'where-both',
        caption: tx('Look at this sentence. Different places can change in different ways.', 'Opposite directions in two places, each with both tests agreeing.'),
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
