import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { AnalysisResult } from '../types/contract'
import { anomalyChart, rawChart, yearlyChart, yearlyPoints } from './charts'
import { setLang } from '../i18n'

const dry = JSON.parse(readFileSync('src/fixtures/airs_rh_surf_day__dry.json', 'utf8')) as AnalysisResult
const all = JSON.parse(readFileSync('src/fixtures/airs_rh_surf_day.json', 'utf8')) as AnalysisResult

afterEach(() => setLang('en'))

describe('yearly chart (R3, season bug)', () => {
  it('plots the season series when a season is selected, not the all-months yearly means', () => {
    expect(dry.season).not.toBeNull()
    expect(yearlyPoints(dry)).toBe(dry.season_series)
    const c = yearlyChart(dry, 'scientific')
    const dots = c.data[0] as { y: number[]; name: string }
    expect(dots.y).toEqual(dry.season_series!.filter((p) => p.in_window).map((p) => p.anomaly))
    expect(dots.y).not.toEqual(dry.yearly_series!.filter((p) => p.in_window).map((p) => p.anomaly))
  })
  it('labels the dots with the season name in both views', () => {
    expect((yearlyChart(dry, 'simple').data[0] as { name: string }).name).toContain('dry season')
    expect((yearlyChart(dry, 'scientific').data[0] as { name: string }).name).toContain('Jun')
  })
  it('plots all-months yearly means without a season', () => {
    expect(all.season).toBeNull()
    expect(yearlyPoints(all)).toBe(all.yearly_series)
  })
  it('Simple y-axis shows real values in kid units; Scientific adds the visible 95% band', () => {
    const s = yearlyChart(all, 'simple')
    const ys = (s.data[0] as { y: number[] }).y
    expect(Math.min(...ys)).toBeGreaterThan(40) // a humidity level, not a difference from normal
    expect(s.layout.yaxis).toMatchObject({ showticklabels: true })
    expect((s.layout.yaxis as { title: { text: string } }).title.text).toBe(all.then_now!.kid_label)
    expect(s.data.some((d) => (d as { fill?: string }).fill === 'tonexty')).toBe(false)
    const sci = yearlyChart(all, 'scientific')
    const band = sci.data.find((d) => (d as { fill?: string }).fill === 'tonexty') as { fillcolor: string }
    expect(band.fillcolor).toMatch(/0\.28/)
  })
  it('Simple y-axis title is in Spanish when the card has kid_label_es', () => {
    const r: AnalysisResult = { ...all, then_now: { ...all.then_now!, kid_label_es: 'en la escala de humedad (0 a 100)' } }
    setLang('es')
    try {
      expect((yearlyChart(r, 'simple').layout.yaxis as { title: { text: string } }).title.text).toBe('en la escala de humedad (0 a 100)')
    } finally {
      setLang('en')
    }
  })
  it('annotates years that were left out', () => {
    const r: AnalysisResult = {
      ...all,
      window: { ...all.window!, reason: 'drift_cut' },
      yearly_series: [...all.yearly_series!, { year: 2023, anomaly: 1, in_window: false }, { year: 2024, anomaly: 1, in_window: false }],
    }
    const c = yearlyChart(r, 'simple')
    expect(c.layout.annotations?.[0]?.text).toBe('Satellite drift: years left out')
    expect(c.layout.shapes).toHaveLength(1)
  })
})

describe('kid scale on the charts', () => {
  const haze: AnalysisResult = {
    ...all,
    variable: { ...all.variable, units: { ...all.variable.units, display: 'AOD', simple: 'points on the haze scale', decimals: 3, kid_scale: 100, kid_label: 'on the haze scale', kid_label_es: null } },
    then_now: null,
  } as AnalysisResult
  const ys = (d: unknown) => (d as { y: number[] }).y
  const same = (a: number[], b: number[], k: number) => {
    expect(a.length).toBe(b.length)
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i] * k, 9))
  }
  it('rawChart scales every trace x100 in Simple, not in Scientific', () => {
    const sci = rawChart(haze, 'scientific')
    const sim = rawChart(haze, 'simple')
    sci.data.forEach((d, i) => same(ys(sim.data[i]), ys(d), 100))
    expect(ys(sci.data[0])).toEqual(haze.series!.filter((p) => p.in_window && p.value != null).map((p) => p.value))
    expect((sim.layout.yaxis as { title: { text: string } }).title.text).toBe('points on the haze scale')
  })
  it('anomalyChart scales the dots, band and trend x100 in Simple, not in Scientific', () => {
    const sci = anomalyChart(haze, 'scientific')
    const sim = anomalyChart(haze, 'simple')
    expect(sim.data.length).toBe(sci.data.length)
    expect(sim.data.some((d) => (d as { fill?: string }).fill === 'tonexty')).toBe(true)
    sci.data.forEach((d, i) => same(ys(sim.data[i]), ys(d), 100))
    expect((sim.layout.yaxis as { title: { text: string } }).title.text).toBe('Difference from normal (points on the haze scale)')
  })
  it('yearlyChart scales the dots and trend line x100 in Simple, not in Scientific', () => {
    const sci = yearlyChart(haze, 'scientific')
    const sim = yearlyChart(haze, 'simple')
    same(ys(sim.data[0]), ys(sci.data[0]), 100)
    expect(ys(sci.data[0])).toEqual(yearlyPoints(haze).filter((p) => p.in_window).map((p) => p.anomaly))
  })
  it('yearlyChart falls back to the then_now scale when units has no kid fields', () => {
    const old = { ...all, variable: { ...all.variable, units: { ...all.variable.units, kid_label: null } }, then_now: { ...all.then_now!, kid_scale: 10 } } as AnalysisResult
    const sim = yearlyChart(old, 'simple')
    const first = yearlyPoints(old).find((p) => p.in_window)!
    const off = old.then_now!.value_then - (old.trend!.fit.find((p) => Number(p.t.slice(0, 4)) === old.then_now!.year_then) ?? old.trend!.fit[0]).trend
    expect(ys(sim.data[0])[0]).toBeCloseTo((first.anomaly + off) * 10, 6)
  })
})
