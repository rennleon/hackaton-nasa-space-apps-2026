import { useState } from 'react'
import { useData } from '../context'
import { fromSigned, toSigned, validatePlace, type Place, type PlaceProblem } from '../lib/place'
import { useStartT } from '../lib/startT'
import './CoordsForm.css'

type Mode = 'point' | 'box'
type Axis = 'lat' | 'lon'
const FIELDS: Record<Mode, [key: string, axis: Axis][]> = {
  point: [['lat', 'lat'], ['lon', 'lon']],
  box: [['w', 'lon'], ['s', 'lat'], ['e', 'lon'], ['n', 'lat']],
}
const AXIS_MAX = { lat: 90, lon: 180 } as const

/** What the child fills in: a size per field plus which side (south and west are the negative sides). */
type Fields = { size: Record<string, string>; neg: Record<string, boolean> }
const EMPTY: Fields = { size: {}, neg: {} }

const fromSignedMap = (v: Record<string, number>): Fields => {
  const f: Fields = { size: {}, neg: {} }
  for (const [k, x] of Object.entries(v)) {
    const s = fromSigned(x)
    f.size[k] = s.size
    f.neg[k] = s.negative
  }
  return f
}

function toPlace(mode: Mode, f: Fields): Place {
  const n = (k: string) => toSigned(f.size[k] ?? '', f.neg[k] ?? false)
  return mode === 'point' ? { kind: 'point', lat: n('lat'), lon: n('lon') } : { kind: 'box', w: n('w'), s: n('s'), e: n('e'), n: n('n') }
}

const startFrom = (p?: Place | null): { mode: Mode; vals: Fields } =>
  p?.kind === 'box' ? { mode: 'box', vals: fromSignedMap({ w: p.w, s: p.s, e: p.e, n: p.n }) } : p?.kind === 'point' ? { mode: 'point', vals: fromSignedMap({ lat: p.lat, lon: p.lon }) } : { mode: 'point', vals: EMPTY }

/** The sentence for a place that cannot be used (shared by the typed form and the map). */
export function useProblemText() {
  const { s } = useStartT()
  return (p: PlaceProblem) =>
    ({
      not_numbers: s('start.coords.badNumbers', 'Please type a number in every box.', 'Enter a number in every field.'),
      out_of_range: s('start.coords.outOfRange', 'Those numbers are not on Earth. Check them.', 'Out of range: latitude −90…90, longitude −180…180.'),
      corners_mixed_up: s('start.coords.corners', 'The corners are mixed up. West must be left of east.', 'Requires W < E and S < N.'),
      too_big: s('start.coords.tooBig', 'That area is too big. Pick a smaller one.', 'Box exceeds 10° × 10° (NASA POWER regional limit).'),
    })[p]
}

interface Props {
  /** live places are off (no API configured) */
  disabled?: boolean
  /** a place already drawn or typed elsewhere: its numbers fill the form */
  initial?: Place | null
  onPlace: (place: Place) => void
}

/** Type a point (latitude and longitude) or a box (four edges), with the side of each number. */
export function CoordsForm({ disabled, initial, onPlace }: Props) {
  const { s } = useStartT()
  const { client } = useData()
  const off = disabled ?? client.customPlaces === false
  const [start] = useState(() => startFrom(initial))
  const [mode, setMode] = useState<Mode>(start.mode)
  const [vals, setVals] = useState<Fields>(start.vals)

  const touched = FIELDS[mode].some(([k]) => vals.size[k]?.trim())
  const typed = toPlace(mode, vals)
  const typedProblem: PlaceProblem | null = touched ? validatePlace(typed) : 'not_numbers'
  const problemText = useProblemText()

  const switchMode = (m: Mode) => {
    setMode(m)
    setVals(EMPTY)
  }

  return (
    <form
      className="coords"
      onSubmit={(e) => {
        e.preventDefault()
        if (!typedProblem && !off) onPlace(typed)
      }}
    >
      <div className="coords-bar">
        <div role="group" aria-label={s('start.coords.mode', 'What to type', 'Input mode')} className="tabs">
          {(['point', 'box'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => switchMode(m)} disabled={off}>
              {m === 'point' ? s('start.coords.modePoint', 'One spot', 'Point') : s('start.coords.modeBox', 'A box', 'Box')}
            </button>
          ))}
        </div>
        <p className="muted small coords-help">{off ? s('start.map.off', 'Choosing any place needs our live service. Try a ready-made place.', 'Custom places require the API (VITE_API_URL not set).') : s('start.coords.help', 'Type the numbers, then pick the side. Example: 7.16 South, 78.51 West.', 'Decimal degrees, e.g. 7.16 S, 78.51 W.')}</p>
      </div>
      <div className="coords-grid">
        {FIELDS[mode].map(([k, axis]) => {
          const label = {
            lat: mode === 'point' ? s('start.coords.lat', 'Latitude (north–south)', 'Latitude') : '',
            lon: mode === 'point' ? s('start.coords.lon', 'Longitude (east–west)', 'Longitude') : '',
            w: s('start.coords.w', 'West edge (east–west)', 'West longitude'),
            s: s('start.coords.s', 'South edge (north–south)', 'South latitude'),
            e: s('start.coords.e', 'East edge (east–west)', 'East longitude'),
            n: s('start.coords.n', 'North edge (north–south)', 'North latitude'),
          }[k]
          const plus = axis === 'lat' ? s('start.coords.north', 'North', 'N') : s('start.coords.east', 'East', 'E')
          const minus = axis === 'lat' ? s('start.coords.south', 'South', 'S') : s('start.coords.west', 'West', 'W')
          return (
            <div key={k} className="coords-field">
              <span className="coords-label">{label}</span>
              <div className="coords-inputs">
                <input
                  type="number"
                  min={0}
                  max={AXIS_MAX[axis]}
                  step="any"
                  inputMode="decimal"
                  disabled={off}
                  aria-label={`${label}: ${s('start.coords.number', 'Number', 'Degrees')}`}
                  value={vals.size[k] ?? ''}
                  onChange={(e) => setVals({ ...vals, size: { ...vals.size, [k]: e.target.value } })}
                />
                <select
                  disabled={off}
                  aria-label={`${label}: ${s('start.coords.side', 'Which side', 'Hemisphere')}`}
                  value={vals.neg[k] ? 'minus' : 'plus'}
                  onChange={(e) => setVals({ ...vals, neg: { ...vals.neg, [k]: e.target.value === 'minus' } })}
                >
                  <option value="plus">{plus}</option>
                  <option value="minus">{minus}</option>
                </select>
              </div>
            </div>
          )
        })}
      </div>
      {!off && touched && typedProblem && (
        <p role="alert" className="error">
          {problemText(typedProblem)}
        </p>
      )}
      <div>
        <button type="submit" className="btn btn-primary" disabled={!!typedProblem || off}>
          {s('start.coords.use', 'Use these numbers', 'Use these coordinates')}
        </button>
      </div>
    </form>
  )
}
