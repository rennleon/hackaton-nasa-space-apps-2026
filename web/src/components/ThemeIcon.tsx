// One small line-icon set for the three questions (no emoji). Decorative: the words next to them carry the meaning.
const PATHS: Record<string, string> = {
  // thermometer
  heat: 'M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z',
  // drop
  water: 'M12 3s6 6.3 6 10.5a6 6 0 0 1-12 0C6 9.3 12 3 12 3z',
  // cloud
  air: 'M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8.5a4.75 4.75 0 0 1 0 9.5H7z',
}

export function ThemeIcon({ id, size = 32 }: { id: string; size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[id] ?? 'M12 6v12M6 12h12'} />
    </svg>
  )
}
