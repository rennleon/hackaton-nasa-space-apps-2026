import { describe, expect, it, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataProvider, GlossaryProvider, ViewProvider } from '../context'
import { HttpError, LiveDataUnavailable, detailText, type DataClient } from '../data/client'
import { StaticClient } from '../data/staticClient'
import { fromSigned, toSigned } from '../lib/place'
import { CoordsForm } from './CoordsForm'
import { PlaceChooser } from './PlaceChooser'
import { LiveNotice, classifyLiveError } from './LiveNotice'

let click: ((lat: number, lon: number) => void) | undefined
vi.mock('./RegionMap', () => ({
  RegionMap: (p: { onMapClick?: (lat: number, lon: number) => void }) => {
    click = p.onMapClick
    return <div data-testid="map" />
  },
}))

const catalog = { regions: [{ id: 'r1', name: { simple: 'Ready place', scientific: 'Ready region' } }], themes: [], variables: [] } as never
const live = { customPlaces: true } as unknown as DataClient

function wrap(ui: React.ReactNode, client: DataClient = live, view: 'simple' | 'scientific' = 'simple') {
  return render(
    <ViewProvider initial={view}>
      <GlossaryProvider terms={[]}>
        <DataProvider value={{ client, catalog }}>{ui}</DataProvider>
      </GlossaryProvider>
    </ViewProvider>,
  )
}

describe('sign helpers', () => {
  it('maps size and side to signed values and back', () => {
    expect(toSigned('7.5', true)).toBe(-7.5)
    expect(toSigned('7.5', false)).toBe(7.5)
    expect(toSigned('', false)).toBeNaN()
    expect(toSigned('-3', false)).toBeNaN()
    expect(fromSigned(-78.514)).toEqual({ size: '78.51', negative: true })
    expect(fromSigned(43)).toEqual({ size: '43', negative: false })
  })
})

describe('CoordsForm signs', () => {
  it('turns South and West into negative numbers', async () => {
    const user = userEvent.setup()
    const onPlace = vi.fn()
    wrap(<CoordsForm onPlace={onPlace} />)
    await user.type(screen.getByLabelText(/Latitude \(north–south\): Number/), '7.16')
    await user.selectOptions(screen.getByLabelText(/Latitude \(north–south\): Which/), 'South')
    await user.type(screen.getByLabelText(/Longitude \(east–west\): Number/), '78.51')
    await user.selectOptions(screen.getByLabelText(/Longitude \(east–west\): Which/), 'West')
    await user.click(screen.getByRole('button', { name: 'Use these numbers' }))
    expect(onPlace).toHaveBeenCalledWith({ kind: 'point', lat: -7.16, lon: -78.51 })
  })
  it('starts with the numbers of a place already drawn', () => {
    wrap(<CoordsForm initial={{ kind: 'point', lat: -7.16, lon: -78.51 }} onPlace={vi.fn()} />)
    expect(screen.getByLabelText(/Latitude \(north–south\): Number/)).toHaveValue(7.16)
    expect(screen.getByLabelText(/Latitude \(north–south\): Which/)).toHaveValue('minus')
    expect(screen.getByRole('button', { name: 'Use these numbers' })).toBeEnabled()
  })
  it('is disabled with a note when no API is configured', () => {
    wrap(<CoordsForm onPlace={vi.fn()} />, new StaticClient())
    expect(screen.getByText(/needs our live service/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use these numbers' })).toBeDisabled()
    expect(screen.getByLabelText(/Latitude \(north–south\): Number/)).toBeDisabled()
  })
})

describe('PlaceChooser', () => {
  it('a map click reports the place', () => {
    const onPlace = vi.fn()
    wrap(<PlaceChooser regions={[]} chosen={null} onPlace={onPlace} />)
    act(() => click?.(-7.164, -78.514))
    expect(onPlace).toHaveBeenCalledWith({ kind: 'point', lat: -7.16, lon: -78.51 })
  })
  it('says how big a pin is, and that it is a square', () => {
    wrap(<PlaceChooser regions={[]} chosen={{ kind: 'place', place: { kind: 'point', lat: 0, lon: -60 }, name: null, viaMap: true }} onPlace={vi.fn()} />)
    expect(screen.getByText(/Your pin covers a square about 55 × 55 km/)).toBeInTheDocument()
  })
  it('refuses a too-big box drawn on the map', () => {
    const onPlace = vi.fn()
    wrap(<PlaceChooser regions={[]} chosen={null} onPlace={onPlace} />)
    return userEvent.setup().click(screen.getByRole('button', { name: 'Draw a box' })).then(() => {
      act(() => click?.(-20, -80))
      act(() => click?.(0, -60))
      expect(screen.getByRole('alert')).toHaveTextContent('That area is too big')
      expect(onPlace).not.toHaveBeenCalled()
    })
  })
  it('shows the action next to the tools, and a note when no API is configured', () => {
    wrap(<PlaceChooser regions={[]} chosen={null} onPlace={vi.fn()} action={<button type="button">Use this spot</button>} />, new StaticClient())
    expect(screen.getByText(/needs our live service/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use this spot' })).toBeInTheDocument()
  })
  it('shows the scientific note', () => {
    wrap(<PlaceChooser regions={[]} chosen={null} onPlace={vi.fn()} />, new StaticClient(), 'scientific')
    expect(screen.getByText(/VITE_API_URL not set/)).toBeInTheDocument()
  })
})

describe('LiveNotice', () => {
  const box = new HttpError(422, 'u', 'Box too large: at most 10 degrees')
  const period = new HttpError(422, 'u', detailText([{ loc: ['query', 'start'], msg: 'String should match pattern' }]))
  it('classifies causes', () => {
    expect(classifyLiveError(new TypeError('Failed to fetch'))).toBe('down')
    expect(classifyLiveError(new LiveDataUnavailable())).toBe('down')
    expect(classifyLiveError(new HttpError(503, 'u', 'live source unavailable'))).toBe('down')
    expect(classifyLiveError(box)).toBe('place')
    expect(classifyLiveError(period)).toBe('period')
    expect(classifyLiveError(new HttpError(422, 'u', 'nope'))).toBe('placeOther')
    expect(period.detail).toBe('start: String should match pattern')
  })
  it.each([
    [new TypeError('Failed to fetch'), /can't reach NASA's live data/],
    [new HttpError(503, 'u', 'live source unavailable'), /can't reach NASA's live data/],
    [box, /Try a smaller one/],
    [period, /Those years don't work/],
    [new HttpError(422, 'u', 'weird'), /Try another one/],
  ])('shows the right simple message', (err, re) => {
    wrap(<LiveNotice error={err as Error} go={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent(re)
    expect(screen.queryByText(/Box too large|String should/)).toBeNull()
  })
  it('shows the server detail only in the scientific view', () => {
    wrap(<LiveNotice error={period} go={vi.fn()} />, live, 'scientific')
    expect(screen.getByText('start: String should match pattern')).toBeInTheDocument()
  })
  it('hides detail for 503 even in scientific view', () => {
    wrap(<LiveNotice error={new HttpError(503, 'u', 'live source unavailable')} go={vi.fn()} />, live, 'scientific')
    expect(screen.queryByText('live source unavailable')).toBeNull()
  })
})
