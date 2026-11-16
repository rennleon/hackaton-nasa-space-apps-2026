import { numberLocale, useT } from '../i18n'
import { CERTAINTY_STEPS } from '../lib/copy'
import { removeFind, useFinds, type Find } from '../lib/myFinds'
import { fmt, useResultCopy } from '../lib/resultCopy'
import { toHash } from '../lib/route'
import { FORUM_URL, ShareFind } from '../components/ShareFind'
import '../components/CongratsPanel.css'

const signed = (n: number, dec: number) => `${n < 0 ? '−' : '+'}${fmt(Math.abs(n), dec)}`

/** "My detective notebook": the real changes this user saved. They live in this browser only. */
export function Notebook({ go }: { go: (r: { screen: 'home' }) => void }) {
  const t = useT()
  const { s, c, view } = useResultCopy()
  const finds = useFinds()
  const date = (f: Find) => new Date(f.saved_at).toLocaleDateString(numberLocale(), { year: 'numeric', month: 'short', day: 'numeric' })
  return (
    <div className="page notebook">
      <h1>{t('finds.title', 'My detective notebook')}</h1>
      <p className="lead">{s('finds.intro', 'Here are the real changes you found. They stay on this device.', 'Finds saved in this browser only (localStorage). Nothing is sent to a server.')}</p>
      {finds.length === 0 ? (
        <div className="card notebook-empty">
          <p>{s('finds.empty', 'Nothing here yet. Find a real change and save it here.', 'No saved finds yet. Save a result where both tests agree and it appears here.')}</p>
          <button type="button" className="btn btn-primary" onClick={() => go({ screen: 'home' })}>
            {t('finds.emptyGo', 'Start looking')}
          </button>
        </div>
      ) : (
        <>
          <ul className="notebook-list" aria-label={t('finds.title', 'My detective notebook')}>
            {finds.map((f) => (
              <li key={f.id} className="card find-item">
                <h2>{f.variable_name}</h2>
                <p className="find-meta">
                  {f.place_label} · {t('finds.years', 'Years: {from} to {to}', { from: f.window_start.slice(0, 4), to: f.window_end.slice(0, 4) })}
                  {f.season ? ` (${f.season})` : ''}
                </p>
                {view === 'scientific' && (
                  <p className="find-meta mono">
                    {t('finds.rate', '{slope} {unit} per 10 years (95% range {lo} to {hi})', {
                      slope: signed(f.slope_per_10y, f.decimals),
                      unit: f.units,
                      lo: signed(f.ci_low, f.decimals),
                      hi: signed(f.ci_high, f.decimals),
                    })}
                  </p>
                )}
                <p className="find-meta">
                  <span className="find-sure">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                      <path d="m12 2.6 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.5l-5.4 2.9 1.1-6.1-4.5-4.3 6.1-.8L12 2.6z" />
                    </svg>
                    {c('result.gauge.sure', CERTAINTY_STEPS[2].text)}
                  </span>{' '}
                  <span className="muted small">{t('finds.savedOn', 'Saved {date}', { date: date(f) })}</span>
                </p>
                <div className="find-actions">
                  <a className="btn" href={toHash({ screen: 'variable', ...f.route })}>
                    {t('finds.open', 'Open this find')}
                  </a>
                  <button type="button" className="btn" onClick={() => removeFind(f.id)} aria-label={t('finds.removeAria', 'Remove {name}, {place}', { name: f.variable_name, place: f.place_label })}>
                    {t('finds.remove', 'Remove')}
                  </button>
                </div>
                <ShareFind find={f} forum={false} />
              </li>
            ))}
          </ul>
          <p className="share-forum">
            {t('finds.share.forum', 'Want scientists to see it? Share it with your teacher, or post it on the')}{' '}
            <a href={FORUM_URL} target="_blank" rel="noopener noreferrer">
              {t('finds.share.forumLink', 'NASA Earthdata Forum')}
            </a>
            .
          </p>
        </>
      )}
    </div>
  )
}
