import { useState } from 'react'
import { useT } from '../i18n'
import { findFileName, findLink, findReportJson, findReportText } from '../lib/findReport'
import type { Find } from '../lib/myFinds'
import './CongratsPanel.css'

export const FORUM_URL = 'https://forum.earthdata.nasa.gov/'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** "Copy report" and "Download JSON" for one find. Everything stays on this device: no service is called. */
export function ShareFind({ find, forum = true }: { find: Find; forum?: boolean }) {
  const t = useT()
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copy = async () => {
    setState((await copyText(findReportText(find, findLink(find)))) ? 'copied' : 'failed')
    setTimeout(() => setState('idle'), 2500)
  }
  return (
    <div className="share" role="group" aria-label={t('finds.share.title', 'Share this find')}>
      <p className="share-title">{t('finds.share.title', 'Share this find')}</p>
      <div className="share-btns">
        <button type="button" className="btn" onClick={copy}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V6a2 2 0 0 1 2-2h9" />
          </svg>
          {t('finds.share.copy', 'Copy report')}
        </button>
        <button type="button" className="btn" onClick={() => download(findFileName(find), findReportJson(find, findLink(find)))}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
          </svg>
          {t('finds.share.json', 'Download JSON')}
        </button>
        <span role="status" className="share-status">
          {state === 'copied' && t('finds.share.copied', 'Copied!')}
          {state === 'failed' && t('finds.share.failed', 'Could not copy. Try again.')}
        </span>
      </div>
      {forum && (
        <p className="share-forum">
          {t('finds.share.forum', 'Want scientists to see it? Share it with your teacher, or post it on the')}{' '}
          <a href={FORUM_URL} target="_blank" rel="noopener noreferrer">
            {t('finds.share.forumLink', 'NASA Earthdata Forum')}
          </a>
          .
        </p>
      )}
    </div>
  )
}
