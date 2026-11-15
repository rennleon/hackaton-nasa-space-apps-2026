import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { AnalysisResult } from '../types/contract'
import { yearlyChart, yearlyPoints } from './charts'
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
