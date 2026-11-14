import { useView } from '../context'
import type { ViewMode } from '../lib/text'

const OPTIONS: { id: ViewMode; label: string }[] = [
  { id: 'simple', label: 'Simple' },
  { id: 'scientific', label: 'Scientific' },
]

export function ViewToggle() {
  const { view, setView } = useView()
  return (
    <div role="group" aria-label="Reading level" className="view-toggle">
      {OPTIONS.map((o) => (
        <button key={o.id} type="button" aria-pressed={view === o.id} onClick={() => setView(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
