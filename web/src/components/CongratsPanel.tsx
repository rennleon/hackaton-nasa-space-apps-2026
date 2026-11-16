import { useMemo } from 'react'
import { useT } from '../i18n'
import { useResultCopy } from '../lib/resultCopy'
import { findFromResult, isSaved, removeFind, saveFind, useFinds } from '../lib/myFinds'
import type { Route } from '../lib/route'
import type { AnalysisResult } from '../types/contract'
import { ShareFind } from './ShareFind'
import './CongratsPanel.css'

const CONFETTI = 14

/**
 * "You found a real change!" Shown only when the answer is "Sure it's real" (never for Maybe, Too soon or Can't tell).
 * Both views say the same thing: the two careful checks agree. The save button keeps the find in this browser only.
 */
export function CongratsPanel({ result, route, placeLabel, notebookHref = '#/notebook' }: { result: AnalysisResult; route: Route; placeLabel: string; notebookHref?: string }) {
  const t = useT()
  const { s } = useResultCopy()
  const finds = useFinds()
  const find = useMemo(() => (result.verdict.certainty === 'sure' ? findFromResult(result, route, placeLabel) : null), [result, route, placeLabel])
  if (!find) return null
  const saved = finds.some((f) => f.id === find.id)
  const toggle = () => (isSaved(find.id) ? removeFind(find.id) : saveFind(find))
  return (
    <section className="card congrats" aria-labelledby="congrats-h" data-testid="congrats">
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: CONFETTI }, (_, i) => (
          <span key={i} className={`confetti-bit confetti-${i % 4}`} style={{ left: `${(i + 0.5) * (100 / CONFETTI)}%`, animationDelay: `${(i % 5) * 0.12}s` }} />
        ))}
      </div>
      <div className="congrats-top">
        <span className="congrats-medal" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" focusable="false">
            <path d="m12 2.6 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.5l-5.4 2.9 1.1-6.1-4.5-4.3 6.1-.8L12 2.6z" />
          </svg>
        </span>
        <div>
          <h3 id="congrats-h">{s('finds.congrats.title', 'You found a real change!', 'Trend detected')}</h3>
          <p className="congrats-body">
            {s('finds.congrats.body', 'Detectives check twice. Two checks agree.', 'Both persistence-aware tests agree at the 95% level.')}
          </p>
        </div>
      </div>
      <div className="congrats-actions">
        <button type="button" className={`btn ${saved ? '' : 'btn-primary'}`} aria-pressed={saved} onClick={toggle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M6 3h12v18l-6-4-6 4V3z" />
          </svg>
          {saved ? t('finds.saved', 'Saved') : t('finds.save', 'Save to my detective notebook')}
        </button>
        <a className="congrats-badge" href={notebookHref} title={t('finds.openNotebook', 'Open my notebook')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zM9 8h6" />
          </svg>
          {t('finds.count', 'Finds saved: {n}', { n: finds.length })}
        </a>
      </div>
      <ShareFind find={find} />
    </section>
  )
}
