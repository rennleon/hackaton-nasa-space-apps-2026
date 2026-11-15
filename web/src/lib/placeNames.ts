// Real names for user-chosen points ("Cajamarca, Peru"). The route only carries `pt:lat,lon`, so the name travels
// in the browser: remembered when the place is chosen, read back by placeRegion(). A shared link opened on
// another device has no remembered name and falls back to "Your place".
const KEY = 'trend-detective:place-names'
const MAX = 30
const memory = new Map<string, string>()

function readStore(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY)
    const v = raw ? (JSON.parse(raw) as unknown) : {}
    return v && typeof v === 'object' ? (v as Record<string, string>) : {}
  } catch {
    return {}
  }
}

/** Remember the name for a place key (the `pt:lat,lon` text). */
export function rememberPlaceName(key: string, name: string): void {
  memory.set(key, name)
  try {
    const store = readStore()
    delete store[key]
    const entries = Object.entries({ ...store, [key]: name }).slice(-MAX)
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    /* storage unavailable: the in-memory copy still works for this visit */
  }
}

export function recallPlaceName(key: string): string | null {
  const name = memory.get(key) ?? readStore()[key]
  return typeof name === 'string' && name ? name : null
}
