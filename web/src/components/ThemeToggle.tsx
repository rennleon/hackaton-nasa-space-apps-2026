import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { Switch } from './Switch'

export type ThemeName = 'dark' | 'light'
const KEY = 'td-theme'

function systemTheme(): ThemeName {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function stored(): ThemeName | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' || v === 'light' ? v : null
  } catch {
    return null
  }
}

/** Applies the viewer's saved choice before the first paint; with no choice the system setting rules (see styles.css). */
export function applySavedTheme() {
  const t = stored()
  if (t) document.documentElement.dataset.theme = t
}

/** The effective theme right now: an explicit data-theme wins, otherwise the system setting. */
export function currentTheme(): ThemeName {
  const t = document.documentElement.dataset.theme
  return t === 'dark' || t === 'light' ? t : systemTheme()
}

/**
 * Dark mode on/off switch for the settings menu. The visible label names the current mode ("Light mode" /
 * "Dark mode"); the switch itself keeps the constant name "Dark mode" so on/off stays clear to screen readers.
 * Remembers the choice in this browser only.
 */
export function ThemeToggle() {
  const t = useT()
  const [theme, setTheme] = useState<ThemeName>(() => currentTheme())
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const on = () => setTheme(currentTheme())
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const dark = theme === 'dark'
  const set = (next: ThemeName) => {
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* the choice just will not be remembered */
    }
    setTheme(next)
  }
  return (
    <>
      <span className="header-menu-name">{dark ? t('app.theme.dark', 'Dark mode') : t('app.theme.light', 'Light mode')}</span>
      <Switch
        className="theme-switch"
        checked={dark}
        onChange={(on) => set(on ? 'dark' : 'light')}
        label={t('app.theme.dark', 'Dark mode')}
        knob={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            {dark ? (
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            ) : (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </>
            )}
          </svg>
        }
      />
    </>
  )
}
