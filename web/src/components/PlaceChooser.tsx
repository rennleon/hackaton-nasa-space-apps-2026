import { useState } from 'react'
import { useData, useView } from '../context'
import { Term } from './Term'
import { COPY } from '../lib/copy'
import { formatPlace, fromSigned, placeBbox, toSigned, validatePlace, wrapLon, type Place, type PlaceProblem } from '../lib/place'
import type { Route } from '../lib/route'
import type { RegionCard } from '../types/catalog'
import { RegionMap } from './RegionMap'

type Mode = 'point' | 'box'
const PROBLEM_COPY = { not_numbers: COPY.badNumbers, out_of_range: COPY.outOfRange, corners_mixed_up: COPY.cornersMixedUp, too_big: COPY.tooBig } as const
const FIELDS = {
  point: [
    ['lat', COPY.latLabel, 'lat'],
    ['lon', COPY.lonLabel, 'lon'],
  ],
  box: [
    ['w', COPY.westLabel, 'lon'],
    ['s', COPY.southLabel, 'lat'],
    ['e', COPY.eastLabel, 'lon'],
    ['n', COPY.northLabel, 'lat'],
  ],
} as const
const AXIS = { lat: { max: 90, plus: COPY.north, minus: COPY.south }, lon: { max: 180, plus: COPY.east, minus: COPY.west } } as const

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

/** Read the fields into a signed Place (NaN for empty or unreadable ones, which validatePlace reports). */
function toPlace(mode: Mode, f: Fields): Place {
  const n = (k: string) => toSigned(f.size[k] ?? '', f.neg[k] ?? false)
  return mode === 'point' ? { kind: 'point', lat: n('lat'), lon: n('lon') } : { kind: 'box', w: n('w'), s: n('s'), e: n('e'), n: n('n') }
}

/** Map plus a small form: click for a pin, click two corners for a box, or type the numbers. */
export function PlaceChooser({ regions, go }: { regions: RegionCard[]; go: (r: Route) => void }) {
  const { t } = useView()
  const [mode, setMode] = useState<Mode>('point')
  const { client } = useData()
  const disabled = client.customPlaces === false
  const [vals, setVals] = useState<Fields>(EMPTY)
  const [corner, setCorner] = useState<{ lat: number; lon: number } | null>(null)

  const touched = FIELDS[mode].some(([k]) => vals.size[k]?.trim())
  const place = toPlace(mode, vals)
  const problem: PlaceProblem | null = touched ? validatePlace(place) : 'not_numbers'
  const valid = touched && !problem

  const switchMode = (m: Mode) => {
    setMode(m)
    setVals(EMPTY)
    setCorner(null)
  }
  const onMapClick = (latRaw: number, lonRaw: number) => {
    const lat = Math.max(-90, Math.min(90, latRaw))
    const lon = wrapLon(lonRaw)
    if (mode === 'point') {
      setVals(fromSignedMap({ lat, lon }))
    } else if (!corner) {
      setCorner({ lat, lon })
      setVals(EMPTY)
    } else {
      setVals(fromSignedMap({ w: Math.min(lon, corner.lon), e: Math.max(lon, corner.lon), s: Math.min(lat, corner.lat), n: Math.max(lat, corner.lat) }))
      setCorner(null)
    }
  }
  const help = mode === 'point' ? COPY.helpPoint : corner ? COPY.helpBoxSecond : COPY.helpBoxFirst
  const draft = valid ? place : null
  const pending = corner ? { kind: 'point' as const, lat: corner.lat, lon: corner.lon } : null

  return (
    <div className="chooser">
      <RegionMap
        regions={regions}
        className="map map-home"
        onMapClick={disabled ? undefined : onMapClick}
        draft={draft ? { bbox: placeBbox(draft), isPoint: draft.kind === 'point', center: draft.kind === 'point' ? [draft.lat, draft.lon] : undefined } : null}
        pending={pending ? [pending.lat, pending.lon] : null}
      />
      <section className="card place-form" aria-labelledby="place-h">
        <h2 id="place-h">{t(COPY.chooseTitle)}</h2>
        <div role="group" aria-label={t(COPY.mapLabel)} className="tabs">
          {(['point', 'box'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => switchMode(m)}>
              {t(m === 'point' ? COPY.modePoint : COPY.modeBox)}
            </button>
          ))}
        </div>
        {disabled ? (
          <p className="muted">{t(COPY.noLiveService)}</p>
        ) : (
          <p className="muted" aria-live="polite">
            {t(help)} {t(COPY.formHelp)}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) go({ screen: 'theme', place: formatPlace(place) })
          }}
        >
          <div className="row">
            {FIELDS[mode].map(([k, label, axis]) => (
              <fieldset key={k} className="coord" disabled={disabled}>
                <legend>{axis === 'lat' ? <Term id="latitude">{t(label)}</Term> : <Term id="longitude">{t(label)}</Term>}</legend>
                <input
                  type="number"
                  min={0}
                  max={AXIS[axis].max}
                  step="any"
                  inputMode="decimal"
                  aria-label={`${t(label)}: ${t(COPY.sizeLabel)}`}
                  value={vals.size[k] ?? ''}
                  onChange={(e) => setVals({ ...vals, size: { ...vals.size, [k]: e.target.value } })}
                />
                <select
                  aria-label={`${t(label)}: ${t(COPY.sideLabel)}`}
                  value={vals.neg[k] ? 'minus' : 'plus'}
                  onChange={(e) => setVals({ ...vals, neg: { ...vals.neg, [k]: e.target.value === 'minus' } })}
                >
                  <option value="plus">{t(AXIS[axis].plus)}</option>
                  <option value="minus">{t(AXIS[axis].minus)}</option>
                </select>
              </fieldset>
            ))}
          </div>
          {!disabled && touched && problem && (
            <p role="alert" className="error">
              {t(PROBLEM_COPY[problem])}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={!valid || disabled}>
            {t(COPY.usePlace)}
          </button>
        </form>
      </section>
    </div>
  )
}
