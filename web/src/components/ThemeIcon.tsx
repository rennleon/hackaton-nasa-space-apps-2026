// One small line-icon set for the main questions and their sub-topics (no emoji). Decorative: the words next to them
// carry the meaning. A sub-topic with no icon of its own falls back to its parent's.
const PATHS: Record<string, string> = {
  // thermometer
  heat: 'M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z',
  // drop
  water: 'M12 3s6 6.3 6 10.5a6 6 0 0 1-12 0C6 9.3 12 3 12 3z',
  // cloud
  air: 'M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8.5a4.75 4.75 0 0 1 0 9.5H7z',
  // sun
  hot_afternoons: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  // moon
  warm_nights: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  // cloud with raindrops
  rain: 'M7 14a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 4.5a4.75 4.75 0 0 1 0 9.5H7zM8 17l-1 3M12 17l-1 3M16 17l-1 3',
  // two small drops
  damp_air: 'M8 4s4 4.2 4 7a4 4 0 0 1-8 0c0-2.8 4-7 4-7zM16 11s3 3.2 3 5.3a3 3 0 0 1-6 0c0-2.1 3-5.3 3-5.3z',
  // sprout in the ground
  soil: 'M12 20v-8M12 12c0-4 3-6 7-6 0 4-3 6-7 6zM12 15c0-3-2-5-6-5 0 3 2 5 6 5zM4 21h16',
  // rising smoke
  smoke_haze: 'M6 20c-2-2 2-4 0-6s2-4 0-6M12 20c-2-2 2-4 0-6s2-4 0-6M18 20c-2-2 2-4 0-6s2-4 0-6',
  // flame
  burning_fuel: 'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z',
}

export function ThemeIcon({ id, parent, size = 32 }: { id: string; parent?: string | null; size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[id] ?? (parent ? PATHS[parent] : undefined) ?? 'M12 6v12M6 12h12'} />
    </svg>
  )
}
