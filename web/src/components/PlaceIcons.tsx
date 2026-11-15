// Line icons for the start wizard: the four ways to pick a place and the kinds of ready-made place.
// Decorative: the words next to each one carry the meaning.
export type PlaceIconName = 'search' | 'mountain' | 'pin' | 'grid' | 'leaf' | 'city' | 'forest' | 'sun' | 'locate' | 'back' | 'check'

const PATHS: Record<PlaceIconName, string> = {
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-3.5-3.5',
  mountain: 'M3 19l6-10 4 6 3-4 5 8z',
  pin: 'M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12zM12 6.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  grid: 'M9 4 7 20M17 4l-2 16M4 9h16M3 15h16',
  leaf: 'M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19l7-7',
  city: 'M5 3h14v18H5zM9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2',
  forest: 'M12 3 6 12h3l-4 6h14l-4-6h3zM12 18v3',
  sun: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  locate: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zM12 2v2M12 20v2M2 12h2M20 12h2',
  back: 'M19 12H5M11 6l-6 6 6 6',
  check: 'm5 12.5 4.5 4.5L19 7.5',
}

export function PlaceIcon({ name, size = 20 }: { name: PlaceIconName; size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" className="pi" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  )
}
