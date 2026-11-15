import { useId, useState } from 'react'
import { useGeocodeSearch, type GeoResult } from '../lib/geocode'
import { useStartT } from '../lib/startT'
import './PlaceSearch.css'

interface Props {
  disabled?: boolean
  onChoose: (r: GeoResult) => void
  onLocate: (lat: number, lon: number) => void
}

type Locate = 'idle' | 'finding' | 'denied' | 'unavailable'

/** Search by place name (Open-Meteo geocoding) plus "Use my location". The main action of the start screen. */
export function PlaceSearch({ disabled, onChoose, onLocate }: Props) {
  const { s } = useStartT()
  const [query, setQuery] = useState('')
  const [closed, setClosed] = useState(false)
  const [active, setActive] = useState(0)
  const [locate, setLocate] = useState<Locate>('idle')
  const listId = useId()
  const hintId = useId()
  const search = useGeocodeSearch(query, { enabled: !closed && !disabled })
  const open = !closed && !disabled && (search.status !== 'idle' || search.tooShort)
  const hasResults = search.status === 'done' && search.results.length > 0
  const current = hasResults ? Math.min(active, search.results.length - 1) : -1

  const choose = (r: GeoResult) => {
    setQuery(r.label)
    setClosed(true)
    onChoose(r)
  }

  const findMe = () => {
    if (!('geolocation' in navigator)) {
      setLocate('unavailable')
      return
    }
    setLocate('finding')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocate('idle')
        // two decimals is about 1 km, finer than our data can see
        onLocate(Math.round(pos.coords.latitude * 100) / 100, Math.round(pos.coords.longitude * 100) / 100)
      },
      (err) => setLocate(err.code === 1 ? 'denied' : 'unavailable'),
      { timeout: 10000, maximumAge: 600000 },
    )
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && hasResults) {
      e.preventDefault()
      setActive((current + 1) % search.results.length)
    } else if (e.key === 'ArrowUp' && hasResults) {
      e.preventDefault()
      setActive((current - 1 + search.results.length) % search.results.length)
    } else if (e.key === 'Escape') {
      setClosed(true)
    } else if (e.key === 'Enter' && hasResults) {
      e.preventDefault()
      choose(search.results[current])
    }
  }

  return (
    <div className="place-search">
      <label htmlFor={`${listId}-in`} className="place-search-label">
        {s('start.search.label', 'Type the name of a city or town', 'Search for a place')}
      </label>
      <div className="place-search-row">
        <div className="place-search-box">
          <input
            id={`${listId}-in`}
            type="search"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            value={query}
            placeholder={s('start.search.placeholder', 'Try Cajamarca or Madison')}
            aria-expanded={open && hasResults}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={current >= 0 ? `${listId}-${current}` : undefined}
            aria-describedby={hintId}
            onChange={(e) => {
              setQuery(e.target.value)
              setClosed(false)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
          />
          <ul id={listId} role="listbox" className="place-results" hidden={!hasResults || !open} aria-label={s('start.search.results', 'Places found')}>
            {hasResults &&
              search.results.map((r, i) => (
                <li
                  key={r.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === current}
                  className={i === current ? 'place-result is-active' : 'place-result'}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(r)}
                >
                  <span className="place-result-name">{r.name}</span>
                  {r.detail && <span className="place-result-detail">{r.detail}</span>}
                </li>
              ))}
          </ul>
        </div>
        <button type="button" className="btn" onClick={findMe} disabled={disabled || locate === 'finding'}>
          {locate === 'finding' ? s('start.locate.finding', 'Finding you…') : s('start.locate.button', 'Use my location')}
        </button>
      </div>
      <div id={hintId} className="place-search-status" aria-live="polite">
        {open && search.tooShort && <p className="muted">{s('start.search.short', 'Type at least 3 letters.')}</p>}
        {open && search.status === 'searching' && <p className="muted">{s('start.search.searching', 'Searching…')}</p>}
        {open && search.status === 'done' && !hasResults && <p className="muted">{s('start.search.none', 'No place found')}</p>}
        {open && search.status === 'error' && (
          <p className="error">{s('start.search.error', 'We could not search just now. Try the map instead.', 'Place search is unavailable. Use the map or coordinates.')}</p>
        )}
        {locate === 'denied' && (
          <p className="error" role="alert">
            {s('start.locate.denied', 'No problem. You can type a place or tap the map instead.', 'Location permission was denied. Search for a place or use the map.')}
          </p>
        )}
        {locate === 'unavailable' && (
          <p className="error" role="alert">
            {s('start.locate.unavailable', 'We could not find where you are. You can type a place or tap the map.', 'Location is unavailable. Search for a place or use the map.')}
          </p>
        )}
      </div>
      <p className="muted small">{s('start.search.credit', 'Place search uses Open-Meteo.')}</p>
    </div>
  )
}
