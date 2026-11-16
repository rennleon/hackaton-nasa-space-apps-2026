import type { ReactNode } from 'react'

/**
 * Shows one of several labels while reserving the width of the longest, so switching language never moves or
 * resizes the header. Only the active label is read by screen readers.
 */
export function Stable({ texts, active, lang }: { texts: string[]; active: number; lang?: (string | undefined)[] }) {
  return (
    <span className="stable">
      {texts.map((t, i) => (
        <span key={i} className="stable-item" data-active={i === active} aria-hidden={i === active ? undefined : true} lang={lang?.[i]}>
          {t}
        </span>
      ))}
    </span>
  )
}

/**
 * A two-state switch: optional word on each side, a track, and a knob that carries an icon, so the state never
 * rests on colour alone. `checked` = the right-hand state.
 */
export function Switch({
  checked,
  onChange,
  label,
  left,
  right,
  knob,
  className = '',
  title,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  left?: ReactNode
  right?: ReactNode
  knob: ReactNode
  className?: string
  title?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title ?? label}
      className={`switch ${className}`.trim()}
      data-on={checked}
      onClick={() => onChange(!checked)}
    >
      {left != null && (
        <span className="switch-word" data-active={!checked} aria-hidden="true">
          {left}
        </span>
      )}
      <span className="switch-track" aria-hidden="true">
        <span className="switch-knob">{knob}</span>
      </span>
      {right != null && (
        <span className="switch-word" data-active={checked} aria-hidden="true">
          {right}
        </span>
      )}
    </button>
  )
}
