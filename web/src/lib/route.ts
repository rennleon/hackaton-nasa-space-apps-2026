export type Screen = 'home' | 'theme' | 'shortlist' | 'variable'

export interface Route {
  screen: Screen
  region?: string
  /** user-chosen place: `pt:lat,lon` or `box:W,S,E,N` (see lib/place.ts) */
  place?: string
  theme?: string
  variable?: string
  season?: string
  /** 4-digit years */
  start?: string
  end?: string
  demo?: string
  step?: number
}

const SCREENS: Screen[] = ['home', 'theme', 'shortlist', 'variable']
const KEYS = ['region', 'place', 'theme', 'variable', 'season', 'start', 'end', 'demo'] as const

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '')
  const [path, query = ''] = raw.split('?')
  const screen = (SCREENS as string[]).includes(path) ? (path as Screen) : 'home'
  const params = new URLSearchParams(query)
  const route: Route = { screen }
  for (const k of KEYS) {
    const v = params.get(k)
    if (v) route[k] = v
  }
  const step = params.get('step')
  if (step !== null && /^\d+$/.test(step)) route.step = Number(step)
  return route
}

export function toHash(route: Route): string {
  const params = new URLSearchParams()
  for (const k of KEYS) {
    const v = route[k]
    if (v) params.set(k, v)
  }
  if (route.step !== undefined) params.set('step', String(route.step))
  // keep the place readable and shareable: ':' and ',' need no escaping in a hash
  const q = params.toString().replace(/%3A/g, ':').replace(/%2C/g, ',')
  return `#/${route.screen}${q ? `?${q}` : ''}`
}
