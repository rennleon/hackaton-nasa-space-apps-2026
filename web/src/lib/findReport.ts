// The shareable report of a find: plain text for a citation, and the same fields as JSON. Local only: nothing is sent anywhere.
import { numberLocale, t } from '../i18n'
import { toHash } from './route'
import { formatP } from './text'
import type { Find } from './myFinds'

export const APP_NAME = 'Earth System Trend Detective'
export const appVersion = (): string => (typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__)

const TEST_LABEL: Record<string, string> = {
  mk_hamed_rao: 'Mann–Kendall (Hamed–Rao corrected)',
  ols_neff: 'OLS slope, effective sample size',
  seasonal_mk: 'Seasonal Mann–Kendall (context only)',
}

const sign = (n: number, dec: number) => `${n < 0 ? '−' : '+'}${Math.abs(n).toLocaleString(numberLocale(), { minimumFractionDigits: dec, maximumFractionDigits: dec })}`

const pText = (p: number) => (p < 0.001 ? 'p < 0.001' : `p = ${formatP(p)}`)

/** The app address that opens this result again. */
export function findLink(f: Find, base?: string): string {
  const root = base ?? (typeof window === 'undefined' ? '' : `${window.location.origin}${window.location.pathname}`)
  return `${root}${toHash({ screen: 'variable', ...f.route })}`
}

export function findReportText(f: Find, link: string = findLink(f)): string {
  const dec = f.decimals
  const lines = [
    t('finds.report.title', 'EARTH SYSTEM TREND DETECTIVE: FIND REPORT'),
    `${t('finds.report.what', 'What')}: ${f.variable_name}`,
    `${t('finds.report.where', 'Where')}: ${f.place_label}`,
    `${t('finds.report.years', 'Years used')}: ${f.window_start} – ${f.window_end}${f.season ? ` (${f.season})` : ''}`,
    `${t('finds.report.rate', 'Rate of change')}: ${sign(f.slope_per_10y, dec)} ${f.units} ${t('finds.report.per10', 'per 10 years')}`,
    `${t('finds.report.range', '95% range')}: ${sign(f.ci_low, dec)} ${t('finds.report.to', 'to')} ${sign(f.ci_high, dec)} ${f.units}`,
    `${t('finds.report.verdict', 'Verdict')}: ${t('finds.report.verdictText.sci', 'Trend detected: both persistence-aware tests agree at the 95% level')}`,
    ...f.tests.map((x) => `  - ${TEST_LABEL[x.name] ?? x.name}: ${pText(x.p)}${x.decisive ? ` (${t('finds.report.decisive', 'decisive')})` : ''}`),
    `${t('finds.report.source', 'Data source')}: ${f.source}`,
    `${t('finds.report.dataset', 'Dataset')}: ${f.dataset}`,
    `${t('finds.report.madeWith', 'Made with')}: ${APP_NAME} v${appVersion()}`,
    `${t('finds.report.date', 'Date')}: ${f.saved_at.slice(0, 10)}`,
    `${t('finds.report.link', 'Link')}: ${link}`,
  ]
  return lines.join('\n')
}

export function findReportJson(f: Find, link: string = findLink(f)): string {
  return JSON.stringify({ app: { name: APP_NAME, version: appVersion() }, link, ...f }, null, 2)
}

/** A file name such as `trend-find-airs_rh_surf_day-2002-09-2021-12.json`. */
export function findFileName(f: Find): string {
  return `trend-find-${f.variable_id}-${f.window_start}-${f.window_end}.json`.replace(/[^\w.-]+/g, '_')
}
