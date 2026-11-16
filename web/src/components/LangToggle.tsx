import { setLang, useLang, useT } from '../i18n'
import { Switch } from './Switch'

/** EN / ES as one switch: "EN [knob] ES". On = Español. The knob shows a globe. */
export function LangToggle() {
  const lang = useLang()
  const t = useT()
  const es = lang === 'es'
  return (
    <Switch
      className="lang-switch"
      checked={es}
      onChange={(on) => setLang(on ? 'es' : 'en')}
      label={t('app.lang.switch', 'Español (Spanish)')}
      title={es ? 'English' : 'Español'}
      left={<span lang="en">EN</span>}
      right={<span lang="es">ES</span>}
      knob={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
        </svg>
      }
    />
  )
}
