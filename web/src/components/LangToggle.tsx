import { setLang, useLang, useT, type Lang } from '../i18n'

const OPTIONS: { id: Lang; short: string; name: string }[] = [
  { id: 'en', short: 'EN', name: 'English' },
  { id: 'es', short: 'ES', name: 'Español' },
]

/** EN / ES switch. Each button names its own language in that language, so it is readable before switching. */
export function LangToggle() {
  const lang = useLang()
  const t = useT()
  return (
    <div role="group" aria-label={t('app.lang.label', 'Language')} className="view-toggle lang-toggle">
      {OPTIONS.map((o) => (
        <button key={o.id} type="button" lang={o.id} aria-pressed={lang === o.id} aria-label={`${o.name} (${o.short})`} title={o.name} onClick={() => setLang(o.id)}>
          {o.short}
        </button>
      ))}
    </div>
  )
}
