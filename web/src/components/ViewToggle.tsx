import { useView } from '../context'
import { useT } from '../i18n'
import type { ViewMode } from '../lib/text'

export function ViewToggle() {
  const { view, setView } = useView()
  const t = useT()
  const options: { id: ViewMode; label: string }[] = [
    { id: 'simple', label: t('app.view.simple', 'Simple') },
    { id: 'scientific', label: t('app.view.scientific', 'Scientific') },
  ]
  return (
    <div role="group" aria-label={t('app.view.label', 'Reading level')} className="view-toggle">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={view === o.id} onClick={() => setView(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
