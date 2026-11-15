// "About this place" facts come only from what the scan really carries (PlaceProfile, plus the size of the box):
// a fact with no data behind it is left out. They are model estimates (NASA POWER climatology), labelled as such.

/** Month numbers (1-12) as runs that may wrap the new year: [11, 12, 1, 2, 3] is one run from 11 to 3. */
export function monthRuns(months: number[]): [number, number][] {
  const set = new Set(months.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))
  if (set.size === 0) return []
  if (set.size === 12) return [[1, 12]]
  const has = (m: number) => set.has(((m - 1 + 12) % 12) + 1)
  // a run starts at a month whose previous month is missing
  return [...set]
    .filter((m) => !has(m - 1))
    .sort((a, b) => a - b)
    .map((s) => {
      let e = s
      while (has(e + 1)) e += 1
      return [s, ((e - 1) % 12) + 1] as [number, number]
    })
}
