import { useEffect, useId, useRef, useState } from 'react'
import { useT } from '../i18n'
import { LangToggle } from './LangToggle'
import { ThemeToggle } from './ThemeToggle'

/** Hamburger at the top right: holds the language switch and the light/dark switch. */
export function HeaderMenu() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const label = t('app.menu.label', 'Settings menu')
  return (
    <div className="header-menu" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="header-menu-button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      <div id={panelId} className="header-menu-panel" hidden={!open}>
        <div className="header-menu-row">
          <span className="header-menu-name">{t('app.lang.label', 'Language')}</span>
          <LangToggle />
        </div>
        <div className="header-menu-row">
          <ThemeToggle />
        </div>
      </div>
    </div>
  )
}
