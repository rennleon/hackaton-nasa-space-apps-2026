import { useView } from '../context'
import { tIn, useLang, useT } from '../i18n'
import { Stable, Switch } from './Switch'

/** Smiley for the Simple view, flask for the Scientific view. */
function KnobIcon({ scientific }: { scientific: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {scientific ? (
        <>
          <path d="M9 3h6M10 3v6.5L4.6 18.4A1.8 1.8 0 0 0 6.1 21h11.8a1.8 1.8 0 0 0 1.5-2.6L14 9.5V3" />
          <path d="M7.2 15h9.6" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
          <path d="M9 9.5h.01M15 9.5h.01" strokeWidth="3" />
        </>
      )}
    </svg>
  )
}

/** Reading level as one switch: "Simple [knob] Scientific". On = Scientific. Words keep one width in both languages. */
export function ViewToggle() {
  const { view, setView } = useView()
  const t = useT()
  const lang = useLang()
  const active = lang === 'es' ? 1 : 0
  const word = (key: string, en: string) => <Stable texts={[tIn('en', key, en), tIn('es', key, en)]} active={active} />
  const scientific = view === 'scientific'
  return (
    <Switch
      className="view-switch"
      checked={scientific}
      onChange={(on) => setView(on ? 'scientific' : 'simple')}
      label={t('app.view.switch', 'Scientific view')}
      title={t('app.view.label', 'Reading level')}
      left={word('app.view.simple', 'Simple')}
      right={word('app.view.scientific', 'Scientific')}
      knob={<KnobIcon scientific={scientific} />}
    />
  )
}
