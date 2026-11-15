// Test-time helper (never imported by the app): finds every translation key the source code uses, with its
// English default, so a test can fail when a key has no Spanish. Reads the TypeScript source with the compiler API.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { FC } from '../lib/findingsCopy'
import { S } from '../lib/sourceLabels'
import { HOW } from '../lib/howCopy'
import { COPY, CERTAINTY_CANT_TELL, CERTAINTY_STEPS } from '../lib/copy'
import { SHORTLIST_META, VERDICT_META } from '../lib/labels'
import { DEMOS } from '../lib/demos'
import { EXAMPLE_PLACES } from '../lib/places'

type Pair = { simple: string; scientific: string }

export interface KeyUse {
  /** the exact key `t()` receives at run time */
  key: string
  /** English default; null when the call site does not carry it (then only presence is checked) */
  en: string | null
  /** where it comes from */
  file: string
}

const SRC = join(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (['types', 'fixtures', 'data'].includes(name) && dir === SRC) continue
      walk(p, out)
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/(es|extractKeys)\.ts$/.test(name)) out.push(p)
  }
  return out
}

const lit = (n: ts.Node | undefined): string | null | undefined =>
  n === undefined ? undefined : ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : null

/** `COPY.name` (a Text) or `COPY.name.simple` (one string) -> the English from lib/copy.ts. */
function copyRef(n: ts.Node | undefined): { name: string; part: 'simple' | 'scientific' | null } | null {
  if (!n || !ts.isPropertyAccessExpression(n)) return null
  const e = n.expression
  if (ts.isIdentifier(e) && e.text === 'COPY') return { name: n.name.text, part: null }
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'COPY' && (n.name.text === 'simple' || n.name.text === 'scientific'))
    return { name: e.name.text, part: n.name.text }
  return null
}

/** English string for an argument: a literal, or a COPY.x.simple reference. */
function english(n: ts.Node | undefined): string | null | undefined {
  const l = lit(n)
  if (l !== null) return l
  const r = copyRef(n)
  const text = r?.part ? (COPY as unknown as Record<string, Pair | undefined>)[r.name]?.[r.part] : undefined
  return typeof text === 'string' ? text : null
}

/** `{ simple: 'a', scientific: 'b' }` literal, or `COPY.name` -> its two strings. */
function textObject(n: ts.Node | undefined): { simple: string; scientific: string } | null {
  const ref = copyRef(n)
  if (ref && !ref.part) {
    const t = (COPY as unknown as Record<string, Pair | undefined>)[ref.name]
    return t && typeof t === 'object' ? t : null
  }
  if (!n || !ts.isObjectLiteralExpression(n)) return null
  const get = (name: string) => {
    const p = n.properties.find((q) => ts.isPropertyAssignment(q) && q.name.getText() === name) as ts.PropertyAssignment | undefined
    return p ? lit(p.initializer) ?? null : null
  }
  const simple = get('simple')
  const scientific = get('scientific')
  return simple != null && scientific != null ? { simple, scientific } : null
}

/** Keys written as string literals at call sites. Template keys (`a.${id}`) are listed by `dynamicUses()`. */
export function literalUses(): { uses: KeyUse[]; dynamic: { template: string; file: string }[] } {
  const uses: KeyUse[] = []
  const dynamic: { template: string; file: string }[] = []
  for (const path of walk(SRC)) {
    const text = readFileSync(path, 'utf8')
    const file = relative(SRC, path)
    const sf = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const startT = text.includes('useStartT')
    const resultCopy = text.includes('useResultCopy') || text.includes('sv(')
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const fn = n.expression.text
        const a = n.arguments
        const keyArg = fn === 'sv' ? a[1] : a[0]
        const first = keyArg
        if (first && ts.isTemplateExpression(first) && ['t', 'tt', 's', 'sv', 'c'].includes(fn)) dynamic.push({ template: first.getText(), file })
        // `cond ? 'a.b' : 'c.d'` -> both keys
        const keys = first && ts.isConditionalExpression(first) ? [lit(first.whenTrue), lit(first.whenFalse)] : [lit(first)]
        for (const key of keys) {
        if (key && /^[a-z][\w]*(\.[\w]+)+$/.test(key)) {
          if (fn === 't' || fn === 'tt') uses.push({ key, en: lit(a[1]) ?? null, file })
          else if (fn === 'c' && resultCopy) {
            const obj = textObject(a[1])
            if (obj && obj.simple === obj.scientific) uses.push({ key, en: obj.simple, file })
            else uses.push({ key: `${key}.simple`, en: obj?.simple ?? null, file }, { key: `${key}.sci`, en: obj?.scientific ?? null, file })
          } else if ((fn === 's' && resultCopy) || fn === 'sv') {
            const i = fn === 'sv' ? 2 : 1
            const simple = english(a[i])
            const sci = a[i + 1] === undefined ? simple : english(a[i + 1])
            if (simple != null && simple !== '' && simple === sci) uses.push({ key, en: simple, file })
            else {
              if (simple !== '') uses.push({ key: `${key}.simple`, en: simple ?? null, file })
              if (sci !== '') uses.push({ key: `${key}.sci`, en: sci ?? null, file })
            }
          } else if (fn === 's' && startT) {
            const simple = lit(a[1])
            const sci = lit(a[2])
            if (a[2] === undefined || (simple != null && simple === sci)) uses.push({ key, en: simple ?? null, file })
            else {
              uses.push({ key: `${key}.simple`, en: simple ?? null, file }, { key: `${key}.scientific`, en: sci ?? null, file })
            }
          }
        }
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  return { uses, dynamic }
}

const both = (key: string, p: Pair, suffix: [string, string], file: string): KeyUse[] =>
  p.simple !== '' && p.simple === p.scientific
    ? [{ key, en: p.simple, file }]
    : [
        ...(p.simple !== '' ? [{ key: `${key}.${suffix[0]}`, en: p.simple, file }] : []),
        ...(p.scientific !== '' ? [{ key: `${key}.${suffix[1]}`, en: p.scientific, file }] : []),
      ]

/** Keys built from data or enums: the findings copy table, labels, demos, ready-made examples, trust texts. */
export function dynamicUses(): KeyUse[] {
  const out: KeyUse[] = []
  // useL: bare key when both registers read the same, else `.simple` / `.scientific`
  for (const [k, p] of Object.entries(HOW)) out.push(...both(k, p, ['simple', 'scientific'], 'lib/howCopy.ts'))
  for (const [k, p] of Object.entries(FC)) {
    out.push(...both(k, p, ['simple', 'scientific'], 'lib/findingsCopy.ts'))
  }
  for (const m of [...Object.values(SHORTLIST_META), ...Object.values(VERDICT_META)]) out.push(...both(m.key, m.text, ['simple', 'sci'], 'lib/labels.ts'))
  // useS(): always `<key>.simple` and `<key>.scientific`
  for (const [k, pair] of Object.entries(S)) {
    out.push({ key: `${k}.simple`, en: pair.simple, file: 'lib/sourceLabels.tsx' }, { key: `${k}.scientific`, en: pair.scientific, file: 'lib/sourceLabels.tsx' })
  }
  const rc = (key: string, t: Pair, file: string) => out.push(...both(key, t, ['simple', 'sci'], file))
  rc('result.gauge.label', COPY.meterLabel, 'lib/copy.ts')
  rc('result.gauge.cant', CERTAINTY_CANT_TELL.text, 'lib/copy.ts')
  for (const s of CERTAINTY_STEPS) rc(`result.gauge.${s.id}`, s.text, 'lib/copy.ts')
  rc('result.details.agree', COPY.checksAgree, 'lib/copy.ts')
  rc('result.details.disagree', COPY.checksDisagree, 'lib/copy.ts')
  rc('result.live.down', COPY.liveDown, 'lib/copy.ts')
  rc('result.live.place', COPY.placeRejected, 'lib/copy.ts')
  rc('result.live.placeOther', COPY.placeRejectedOther, 'lib/copy.ts')
  rc('result.live.period', COPY.periodRejected, 'lib/copy.ts')
  rc('result.live.readyMade', COPY.readyMade, 'lib/copy.ts')
  for (const d of DEMOS) {
    out.push(...both(`demo.${d.id}.label`, d.label as Pair, ['simple', 'scientific'], 'lib/demos.ts'))
    rc(`demo.${d.id}.title`, d.title as Pair, 'lib/demos.ts')
    d.steps.forEach((st, i) => rc(`demo.${d.id}.step${i}`, st.caption as Pair, 'lib/demos.ts'))
  }
  for (const e of EXAMPLE_PLACES) {
    out.push({ key: `start.example.${e.id}.name`, en: e.name, file: 'lib/places.ts' })
    for (const f of ['tag', 'caption'] as const) {
      const p = e[f]
      out.push(...both(`start.example.${e.id}.${f}`, p, ['simple', 'scientific'], 'lib/places.ts'))
    }
  }
  // TrustPanel: texts chosen by an enum, written inline in the component
  const trust = (key: string, simple: string, sci: string) => rc(key, { simple, scientific: sci }, 'components/TrustPanel.tsx')
  trust('result.trust.cross.agree', 'Two instruments agree.', 'Two instruments agree on the direction, both significant.')
  trust('result.trust.cross.same_direction_one_unsure', 'Both point the same way. One is not sure yet.', 'Same direction; only one instrument is significant.')
  trust('result.trust.cross.disagree', 'The two instruments disagree.', 'The two instruments disagree on the direction.')
  trust('result.trust.cross.both_unsure', 'Neither instrument is sure yet.', 'Neither instrument shows a significant trend.')
  trust('result.trust.cross.only_one', 'We could not compare with a second source here.', 'No usable second-source series to compare with here.')
  trust('result.trust.agreement.agrees', 'This matches what scientists found.', 'Agrees with the published assessment.')
  trust('result.trust.agreement.differs', 'This is different from what scientists found.', 'Differs from the published assessment.')
  trust('result.trust.agreement.too_soon', 'Our record is too short to compare with the scientists yet.', 'Record too short to compare with the published assessment.')
  trust('result.trust.title', 'Tell me more: can we trust this?', 'Can we trust this? Evidence checks')
  for (const [d, en] of [['upward', 'upward'], ['downward', 'downward'], ['flat', 'flat']]) out.push({ key: `result.chart.dir.${d}.simple`, en, file: 'lib/charts.ts' }, { key: `result.chart.dir.${d}.sci`, en, file: 'lib/charts.ts' })
  return out
}

/** Every key the app asks for, merged (one entry per key; English from the first use that has it). */
export function allKeys(): Map<string, KeyUse> {
  const map = new Map<string, KeyUse>()
  const { uses } = literalUses()
  for (const u of [...uses, ...dynamicUses()]) {
    const prev = map.get(u.key)
    if (!prev || (prev.en == null && u.en != null)) map.set(u.key, u)
  }
  return map
}

export const placeholders = (s: string): string[] => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort()
