import type { ScanEntry } from '../types/contract'
import type { VariableCard } from '../types/catalog'
import { coverageFor } from '../lib/coverage'
import { useL } from '../lib/findingsCopy'
import { useT, tx } from '../i18n'
import { useView } from '../context'

const END_YEAR = 2026 + 10 / 12

/** Year timeline: each variable's record coverage, with excluded drift years hatched. */
export function Timeline({ entries, variables }: { entries: ScanEntry[]; variables: VariableCard[] }) {
  const { view } = useView()
  useT()
  const l = useL()
  const t = (x: Parameters<typeof tx>[0]) => tx(x, view)
  const rows = entries
    .map((e) => ({ e, v: variables.find((x) => x.id === e.variable_id) }))
    .filter((r): r is { e: ScanEntry; v: VariableCard } => !!r.v)
    .map((r) => ({ ...r, c: coverageFor(r.v, END_YEAR) }))
  if (!rows.length) return null
  const min = Math.floor(Math.min(...rows.map((r) => r.c.start)) / 5) * 5
  const max = 2030
  const pct = (y: number) => `${((y - min) / (max - min)) * 100}%`
  const ticks: number[] = []
  for (let y = min; y <= max; y += 5) ticks.push(y)
  return (
    <section className="timeline" aria-label={l('findings.timeline.aria')}>
      <h3>{l('findings.coverage')}</h3>
      <div className="tl-grid">
        <div className="tl-row" aria-hidden="true">
          <span />
          <div className="tl-axis">
            {ticks.map((y) => (
              <span key={y} style={{ left: pct(y) }}>
                {y}
              </span>
            ))}
          </div>
        </div>
        {rows.map(({ e, v, c }) => (
          <div className="tl-row" key={e.variable_id}>
            <span className="tl-name">{t(e.name)}</span>
            <div className="tl-track" role="img"
              aria-label={l(c.drift ? 'findings.timeline.rowDrift' : 'findings.timeline.row', { name: t(e.name), from: Math.floor(c.start), to: Math.floor(c.end), cut: c.drift ? Math.floor(c.drift[0]) : '', note: c.drift ? t(v.artifacts[0].note) : '' })}>
              <div className="tl-bar" style={{ left: pct(c.start), width: `calc(${pct(c.end)} - ${pct(c.start)})` }} />
              {c.drift && <div className="tl-drift" style={{ left: pct(c.drift[0]), width: `calc(${pct(c.drift[1])} - ${pct(c.drift[0])})` }} />}
            </div>
          </div>
        ))}
      </div>
      <p className="muted tl-legend">
        <span className="swatch swatch-bar" /> {l('findings.timeline.used')}{' '}
        <span className="swatch swatch-drift" /> {l('findings.timeline.out')}
      </p>
    </section>
  )
}
