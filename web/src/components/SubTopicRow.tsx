import { useId } from 'react'
import { useData } from '../context'
import { childrenOf } from '../lib/themes'
import { useStartT } from '../lib/startT'
import { ThemeIcon } from './ThemeIcon'
import './SubTopicRow.css'

/** The narrower questions under one main question. A sibling of the main card's button, never inside it. */
export function SubTopicRow({ parentId, onPick }: { parentId: string; onPick: (themeId: string) => void }) {
  const { catalog } = useData()
  const { s, tx } = useStartT()
  const labelId = useId()
  const subs = childrenOf(catalog.themes, parentId)
  if (!subs.length) return null
  return (
    <div className="subtopics" role="group" aria-labelledby={labelId} data-testid={`subtopics-${parentId}`}>
      <span id={labelId} className="subtopics-label">
        {s('start.subtopics', 'Or ask about:', 'Narrower questions:')}
      </span>
      <ul className="subtopics-list">
        {subs.map((th) => (
          <li key={th.id}>
            <button type="button" className="subtopic-btn" title={tx(th.question)} onClick={() => onPick(th.id)}>
              <ThemeIcon id={th.id} parent={th.parent} size={18} />
              <span>{tx(th.name)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
