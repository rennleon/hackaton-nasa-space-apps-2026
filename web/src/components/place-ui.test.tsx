import { describe, expect, it, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataProvider, GlossaryProvider, ViewProvider } from '../context'
import { HttpError, LiveDataUnavailable, detailText, type DataClient } from '../data/client'
import { StaticClient } from '../data/staticClient'
import { fromSigned, toSigned } from '../lib/place'
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

describe('PlaceChooser signs', () => {
  it('turns South and West into negative numbers in the route', async () => {
    const user = userEvent.setup()
    const go = vi.fn()
    wrap(<PlaceChooser regions={[]} go={go} />)
    await user.type(screen.getByLabelText(/How far north or south: Number/), '7.16')
    await user.selectOptions(screen.getByLabelText(/How far north or south: Which/), 'South')
    await user.type(screen.getByLabelText(/How far east or west: Number/), '78.51')
    await user.selectOptions(screen.getByLabelText(/How far east or west: Which/), 'West')
    await user.click(screen.getByRole('button', { name: 'Use this place' }))
    expect(go).toHaveBeenCalledWith({ screen: 'theme', place: 'pt:-7.16,-78.51' })
  })
  it('fills size and toggles from a map click', async () => {
    wrap(<PlaceChooser regions={[]} go={vi.fn()} />)
    act(() => click?.(-7.16, -78.51))
    expect(await screen.findByLabelText(/How far north or south: Number/)).toHaveValue(7.16)
    expect(screen.getByLabelText(/How far north or south: Which/)).toHaveValue('minus')
    expect(screen.getByLabelText(/How far east or west: Which/)).toHaveValue('minus')
    act(() => click?.(10, 20))
    expect(screen.getByLabelText(/How far north or south: Which/)).toHaveValue('plus')
    expect(screen.getByLabelText(/How far east or west: Which/)).toHaveValue('plus')
  })
  it('is disabled with a note when no API is configured', () => {
    wrap(<PlaceChooser regions={[]} go={vi.fn()} />, new StaticClient())
    expect(screen.getByText(/needs our live service/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use this place' })).toBeDisabled()
    expect(screen.getByLabelText(/How far north or south: Number/)).toBeDisabled()
  })
  it('shows the scientific note', () => {
    wrap(<PlaceChooser regions={[]} go={vi.fn()} />, new StaticClient(), 'scientific')
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
