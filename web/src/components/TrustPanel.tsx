import type { ReactNode } from 'react'
import type { AnalysisResult, Comparison, Text } from '../types/contract'
import { fmt, useResultCopy } from '../lib/resultCopy'
import { Term } from './Term'
import { Icon, type IconName } from './ResultIcons'
import './VariableView.css'

type Status = 'pass' | 'caution' | 'fail' | 'info'
const STATUS_ICON: Record<Status, IconName> = { pass: 'check', caution: 'caution', fail: 'fail', info: 'info' }

interface Row {
  key: string
  status: Status
  text: string
  extra?: ReactNode
}

type Outcome = NonNullable<Comparison['outcome']>

const OUTCOME_STATUS: Record<Outcome, Status> = {
  agree: 'pass',
  same_direction_one_unsure: 'info',
  disagree: 'caution',
  both_unsure: 'info',
  only_one: 'info',
}

function outcomeOf(c: Comparison): Outcome {
  if (c.outcome) return c.outcome
  if (c.same_sign) return c.significant ? 'agree' : 'same_direction_one_unsure'
  return c.significant ? 'disagree' : 'both_unsure'
}

/**
 * "Can we trust this?": grouped checks, each one icon plus one plain sentence.
 * Replaces the old "Why we looked at this" list, so "the change is real" and "hard to spot with this record" read together.
 */
export function TrustPanel({ result }: { result: AnalysisResult }) {
  const { s, c, bx, view } = useResultCopy()
  const simple = view === 'simple'
  const sel = result.selection
  const statusWord = (st: Status) =>
    st === 'pass' ? s('result.trust.pass', 'Good', 'Pass') : st === 'caution' ? s('result.trust.caution', 'Careful', 'Caution') : st === 'fail' ? s('result.trust.fail', 'Problem', 'Fail') : s('result.trust.info', 'Note', 'Note')

  // A failed gate blocks the verdict (red cross). A failed stage-1 check only says how hard this is to see, so a child
  // reads it as a note, not as a contradiction under "Sure it's real". Scientific keeps the plain pass/caution/fail.
  const gateRow = (g: AnalysisResult['gates']['checks'][number]): Row => ({ key: `gate-${g.code}`, status: g.passed ? 'pass' : 'fail', text: bx(g.detail) })
  const selRow = (k: 'fitness' | 'known_breaks' | 'detectability'): Row[] => {
    const x = sel?.checks.find((q) => q.code === k)
    return x ? [{ key: `sel-${k}`, status: simple && x.status === 'fail' ? 'info' : x.status, text: bx(x.detail) }] : []
  }

  const quality: Row[] = [
    ...result.gates.checks.filter((g) => g.code !== 'record_length').map(gateRow),
    ...selRow('fitness'),
    ...selRow('known_breaks'),
    ...(result.chips ?? []).map((ch): Row => ({ key: `chip-${ch.code}`, status: ch.severity === 'warning' ? 'caution' : 'info', text: bx(ch.text) })),
  ]
  const record: Row[] = [...result.gates.checks.filter((g) => g.code === 'record_length').map(gateRow), ...selRow('detectability')]

  const cc = result.robustness?.cross_check ?? null
  const ccOutcome = cc ? outcomeOf(cc) : null
  const ccFallback: Record<Outcome, Text> = {
    agree: { simple: 'Two instruments agree.', scientific: 'Two instruments agree on the direction, both significant.' },
    same_direction_one_unsure: { simple: 'Both point the same way. One is not sure yet.', scientific: 'Same direction; only one instrument is significant.' },
    disagree: { simple: 'The two instruments disagree.', scientific: 'The two instruments disagree on the direction.' },
    both_unsure: { simple: 'Neither instrument is sure yet.', scientific: 'Neither instrument shows a significant trend.' },
    only_one: { simple: 'Only one instrument sees this place.', scientific: 'Only one instrument covers this place.' },
  }
  const second: Row[] =
    cc && ccOutcome
      ? [
          {
            key: 'cross',
            status: OUTCOME_STATUS[ccOutcome],
            text: cc.text ? bx(cc.text) : c(`result.trust.cross.${ccOutcome}`, ccFallback[ccOutcome]),
            extra: !simple && (
              <span className="muted small">
                {s('result.trust.crossWith', '', 'Compared with {against}{window}.', {
                  against: cc.against_instrument ?? cc.against,
                  window: cc.window_start && cc.window_end ? `, ${cc.window_start} to ${cc.window_end}` : '',
                })}
              </span>
            ),
          },
        ]
      : []

  const pub = result.published
  const agreeText: Record<NonNullable<NonNullable<typeof pub>['agreement']>, { st: Status; text: Text }> = {
    agrees: { st: 'pass', text: { simple: 'This matches what scientists found.', scientific: 'Agrees with the published assessment.' } },
    differs: { st: 'caution', text: { simple: 'This is different from what scientists found.', scientific: 'Differs from the published assessment.' } },
    too_soon: { st: 'info', text: { simple: 'Our record is too short to compare with the scientists yet.', scientific: 'Record too short to compare with the published assessment.' } },
  }

  type Group = { id: string; icon: IconName; title: string; rows: Row[] }
  const groups: Group[] = ([
    { id: 'quality', icon: 'data', title: s('result.trust.quality', 'Is the data good?', 'Data quality'), rows: quality },
    { id: 'record', icon: 'record', title: s('result.trust.record', 'Is the record long enough?', 'Long enough record'), rows: record },
    { id: 'second', icon: 'pair', title: s('result.trust.second', 'Does another instrument agree?', 'Second opinion'), rows: second },
  ] as Group[]).filter((g) => g.rows.length > 0 || g.id === 'record')

  const na = s('result.trust.na', '', 'n/a')
  const notes = result.verdict.notes ?? []
  const worth = sel ? sel.worth_investigating : null

  // "Hard to spot" only when the stage-1 detectability check failed; a recommended variable needs no tag
  const detect = sel?.checks.find((q) => q.code === 'detectability')
  const hard = sel != null && (detect ? detect.status === 'fail' : !worth)

  return (
    <section className="card trust" aria-labelledby="trust-h" data-demo="trust">
      <details key={view} className="trust-details" open={!simple}>
        <summary>
          <h3 id="trust-h">{c('result.trust.title', { simple: 'Tell me more: can we trust this?', scientific: 'Can we trust this? Evidence checks' })}</h3>
        </summary>
        {hard && (
          <div className="trust-head">
            <span className="trust-tag trust-tag-hard">
              <Icon name="caution" size={16} />
              {s('result.trust.hard', 'Hard to spot with this record', 'Hard to detect with this record')}
            </span>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.id} className="trust-group" data-demo={`trust-${g.id}`}>
            <h4>
              <Icon name={g.icon} size={18} /> {g.title}
            </h4>
            <ul className="trust-rows">
              {g.rows.map((row) => (
                <li key={row.key} className={`trust-row trust-${row.status}`}>
                  <Icon name={STATUS_ICON[row.status]} size={20} />
                  <span>
                    <span className="visually-hidden">{statusWord(row.status)}: </span>
                    {row.text}
                    {row.extra && <> {row.extra}</>}
                  </span>
                </li>
              ))}
            </ul>
            {g.id === 'record' && notes.map((n, i) => (
              <p key={i} className="trust-note">
                {bx(n)}
              </p>
            ))}
            {g.id === 'record' && !simple && <Detectability result={result} />}
          </div>
        ))}
        {pub && (
          <div className="trust-group">
            <h4>
              <Icon name="book" size={18} /> {s('result.trust.published', 'What scientists found here', 'Matches published science')}
            </h4>
            <blockquote className="trust-quote">{bx(pub.statement)}</blockquote>
            <ul className="trust-rows">
              {pub.agreement && (
                <li className={`trust-row trust-${agreeText[pub.agreement].st}`}>
                  <Icon name={STATUS_ICON[agreeText[pub.agreement].st]} size={20} />
                  <span>
                    <span className="visually-hidden">{statusWord(agreeText[pub.agreement].st)}: </span>
                    {c(`result.trust.agreement.${pub.agreement}`, agreeText[pub.agreement].text)}
                  </span>
                </li>
              )}
            </ul>
            <p className="muted small">
              {s('result.trust.source', 'Source: {source}.', 'Source: {source}.', { source: pub.source })}
              {pub.confidence && ' ' + s('result.trust.confidence', 'How sure the scientists are: {level}.', 'Assessment confidence: {level}.', { level: pub.confidence })}
            </p>
          </div>
        )}
        {!simple && sel && (
          <p className="muted small">
            {s('result.trust.mdt', '', 'MDT {mdt} {unit}/decade · expected {exp} {unit}/decade', {
              mdt: sel.mdt_per_decade == null ? na : fmt(sel.mdt_per_decade, result.variable.units.decimals),
              exp: sel.expected_per_decade == null ? na : fmt(sel.expected_per_decade, 2),
              unit: result.variable.units.display,
            })}
          </p>
        )}
      </details>
    </section>
  )
}

function Detectability({ result }: { result: AnalysisResult }) {
  const { s } = useResultCopy()
  const d = result.detectability
  if (!d) return null
  // A significant result is already detected; "years needed" (90% power) can exceed the record without contradiction.
  const detected = result.verdict.label === 'significant' || result.verdict.label === 'significant_fragile'
  const needed = d.years_needed == null ? s('result.trust.noSlope', '', 'n/a (slope ≈ 0)') : s('result.trust.yr', '', '{n} yr', { n: fmt(d.years_needed, 1) })
  const have = s('result.trust.yr', '', '{n} yr', { n: fmt(d.years_available, 1) })
  return (
    <p className="muted small">
      <Term id="years_to_detect" cap />:{' '}
      {detected
        ? s('result.trust.detectDone', '', '{needed} needed vs {have} available (90% power design target; this trend is already significant at α = 0.05).', { needed, have })
        : s('result.trust.detect', '', '{needed} needed vs {have} available.', { needed, have })}
    </p>
  )
}
