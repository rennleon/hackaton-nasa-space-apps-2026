import type { Route } from './route'
import type { Text } from '../types/catalog'

export interface DemoStep {
  route: Route
  caption: Text
}
export interface Demo {
  id: string
  title: Text
  steps: DemoStep[]
}

const tx = (simple: string, scientific: string): Text => ({ simple, scientific })

/** Scripted walkthroughs: a sequence of the real screens with a caption bubble on top. */
export const DEMOS: Demo[] = [
  {
    id: 'cajamarca_west',
    title: tx('Demo: is the air in northern Peru getting more humid?', 'Demo: relative humidity, Cajamarca box'),
    steps: [
      { route: { screen: 'home' }, caption: tx('Welcome! We will check whether the air in a part of northern Peru is changing. First we pick a place on the map.', 'We analyse AIRS surface relative humidity over the Cajamarca box. Regions are predefined, grid-aligned boxes.') },
      { route: { screen: 'theme', region: 'cajamarca_west' }, caption: tx('Now we pick a question. Water: is it getting wetter or drier?', 'Pick a theme; the theme decides which variables enter the shortlist.') },
      { route: { screen: 'shortlist', region: 'cajamarca_west', theme: 'water' }, caption: tx('Here are the measurements that could answer it. The best evidence comes first. Afternoon humidity looks like it is changing.', 'Scan results with Benjamini–Hochberg adjusted p-values; the strongest evidence is listed first.') },
      { route: { screen: 'variable', region: 'cajamarca_west', theme: 'water', variable: 'airs_rh_surf_day' }, caption: tx('The top chart is what the satellite saw. The bottom chart removes the yearly seasons and draws the slow trend.', 'Top: raw monthly series. Bottom: anomalies with the fitted trend and its 95% band.') },
      { route: { screen: 'variable', region: 'cajamarca_west', theme: 'water', variable: 'airs_rh_surf_day', season: 'wet' }, caption: tx('We can also look at just the rainy season. Fewer points, so we are more careful.', 'Declared seasonal subset: Jan–Apr means, one value per year.') },
    ],
  },
  {
    id: 'wisconsin',
    title: tx('Demo: is the air in Wisconsin getting hazier?', 'Demo: aerosol optical depth, Wisconsin'),
    steps: [
      { route: { screen: 'home' }, caption: tx('Our second place is Wisconsin, a US state where wildfire smoke sometimes drifts in.', 'Second region: Wisconsin state shape (MODIS-Aqua AOD example).') },
      { route: { screen: 'theme', region: 'wisconsin' }, caption: tx('This time we ask about the air.', 'Theme: atmospheric composition.') },
      { route: { screen: 'shortlist', region: 'wisconsin', theme: 'air' }, caption: tx('Haze is measured by satellites and by computer models. Models are helpful but they are not direct measurements.', 'Observed (MODIS) and model (MERRA-2) series are listed with their source type.') },
      { route: { screen: 'variable', region: 'wisconsin', theme: 'air', variable: 'modis_aqua_aod' }, caption: tx('The answer is honest: there is a lot of up and down, so we cannot say yet that the haze is changing.', 'Verdict reflects detectability: years needed vs available.') },
    ],
  },
]

export const demoById = (id: string) => DEMOS.find((d) => d.id === id)
