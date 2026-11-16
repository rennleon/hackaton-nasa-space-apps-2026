// Keyword route of the detective guide, in the browser: works offline (static mode) over the catalog the app
// already loaded. A twin of backend/src/trend_detective/guide.py `keyword_guide`; keep the two in step.
import type { GlossaryTerm, ThemeCard, VariableCard } from '../types/catalog'

export interface GuideAnswer {
  /** best question; null when nothing matched */
  theme: string | null
  /** variable ids in that question, best first (up to 4) */
  variables: string[]
  /** a place name the user typed (never coordinates) */
  place_hint: string | null
  reason: string
  source: 'llm' | 'keywords'
}

export interface GuideCatalog {
  themes: ThemeCard[]
  variables: VariableCard[]
  glossary: GlossaryTerm[]
}

const MAX_CHARS = 300
const MAX_VARIABLES = 4
const MAX_PLACE_CHARS = 60
const ROLE_BONUS: Record<string, number> = { target: 3, driver: 1.5, response: 1, cross_check: 0.5 }

const STOPWORDS = new Set(
  (
    'a an the is are was be it its this that these those of in on at to for from by with and or not no do does ' +
    'how what why when where which who i my me we our you your want wants know about get gets getting here there ' +
    'more less very much many can could would should will just like see look find out tell show than then ' +
    'el la los las un una unos unas es son de del en y o por para con que como mas menos quiero saber ' +
    'sobre aqui alli ver hay se mi mis tu tus nos'
  ).split(' '),
)

/** Lower-case and drop accents: 'Sequía' -> 'sequia'. */
export function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
}

/** Crude plural strip so 'afternoons' matches 'afternoon' and 'lluvias' matches 'lluvia'. */
export function stem(t: string): string {
  if (t.length > 4 && t.endsWith('es') && !t.endsWith('ies') && !t.endsWith('ses')) return t.slice(0, -2)
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1)
  return t
}

export function tokens(text: string): string[] {
  const out: string[] = []
  for (const raw of fold(text).match(/[a-z0-9]+/g) ?? []) {
    if (raw.length < 2 || STOPWORDS.has(raw)) continue
    out.push(stem(raw))
  }
  return out
}

// Word -> sub-topic or main theme it points at. Declared before any result is seen.
const SYN: Record<string, string> = {
  smoke_haze: 'smoke smoky haze hazy fire fires wildfire ash humo incendio incendios bruma neblina smog dust polvo',
  air: 'pollution polluted contaminacion contaminado breathe respirar aerosol',
  burning_fuel: 'burning fuel combustible quema traffic trafico cars car factory fabrica no2 coches carros',
  heat: 'hot hotter heat warm warmer warming temperature cold cooler colder calor caliente caluroso temperatura frio fresco climate clima weather tiempo meteorologia sunny sun sol summer verano winter invierno degrees grados',
  hot_afternoons: 'afternoon afternoons daytime midday tarde tardes',
  warm_nights: 'night nights nighttime noche noches',
  rain: 'rain rainy rainfall raining storm storms dry drier drought flood lluvia lluvias llueve llover tormenta sequia seco seca inundacion snow nieve wetness',
  damp_air: 'humid humidity damp muggy humedo humeda humedad',
  water: 'wet wetter moisture',
  soil: 'soil ground farm farms farming crop crops suelo cultivo cultivos agricultura chacra plants plantas',
}
const SYNONYMS = new Map<string, string[]>()
for (const [theme, words] of Object.entries(SYN)) {
  for (const w of words.split(' ')) {
    const k = stem(fold(w))
    SYNONYMS.set(k, [...(SYNONYMS.get(k) ?? []), theme])
  }
}

const PLACE_RE =
  /\b(?:[Ii]n|[Nn]ear|[Aa]t|[Aa]round|[Ff]rom|[Ee]n|[Cc]erca de|[Cc]erca del|[Aa]lrededor de|[Dd]e)\s+([A-ZÁÉÍÓÚÑ][\w'’.-]*(?:\s+(?:de |del |la |of )?[A-ZÁÉÍÓÚÑ][\w'’.-]*){0,3})/u

/** A place name only: no digits (never coordinates), short, trimmed. */
export function cleanPlace(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.replace(/\s+/g, ' ').trim().replace(/^[ .,;:!?"']+|[ .,;:!?"']+$/g, '')
  return !v || v.length > MAX_PLACE_CHARS || /\d/.test(v) ? null : v
}

export function placeFromText(text: string): string | null {
  const m = PLACE_RE.exec(text)
  return m ? cleanPlace(m[1]) : null
}

export const cleanText = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS)

type Txt = { simple: string; simple_es?: string | null }
const bag = (...texts: (string | null | undefined)[]): Set<string> => new Set(texts.flatMap((t) => tokens(t ?? '')))
const overlap = (w: Map<string, number>, b: Set<string>): number => {
  let n = 0
  for (const [t, weight] of w) if (b.has(t)) n += weight
  return n
}
const plain = (t: Txt, lang: string): string => (lang === 'es' && t.simple_es) || t.simple

/** Typed words weigh 1; words of a matching glossary entry's definition weigh 0.5 (e.g. 'NO2' -> 'burning', 'fuel'). */
function queryWeights(text: string, glossary: GlossaryTerm[]): Map<string, number> {
  const direct = new Set(tokens(text))
  const w = new Map<string, number>([...direct].map((t) => [t, 1]))
  for (const g of glossary) {
    const termTokens = bag(g.term.simple, g.term.simple_es, g.term.scientific)
    if (![...termTokens].some((t) => direct.has(t))) continue
    for (const t of bag(g.definition.simple, g.definition.simple_es)) if (!w.has(t)) w.set(t, 0.5)
  }
  return w
}

export const NO_MATCH = {
  en: 'I could not match that. Try words like heat, rain or smoke.',
  es: 'No pude entender eso. Prueba con palabras como calor, lluvia o humo.',
}

export function matchReason(themeName: string, lang: string): string {
  return lang === 'es'
    ? `Tus palabras encajan con «${themeName}». Ábrela y miramos los datos.`
    : `Your words match “${themeName}”. Open it and we will check the data.`
}

export function keywordGuide(rawText: string, lang: string, cat: GuideCatalog): GuideAnswer {
  const l = lang === 'es' ? 'es' : 'en'
  const text = cleanText(rawText)
  const weights = queryWeights(text, cat.glossary)
  const score = new Map<string, number>()
  for (const th of cat.themes) {
    const nameScore = 2 * overlap(weights, bag(th.name.simple, th.name.simple_es, th.name.scientific))
    score.set(th.id, nameScore + 0.5 * overlap(weights, bag(th.question.simple, th.question.simple_es)))
  }
  for (const tok of new Set(tokens(text))) {
    for (const id of SYNONYMS.get(tok) ?? []) {
      const th = cat.themes.find((t) => t.id === id)
      if (!th) continue
      score.set(id, (score.get(id) ?? 0) + 4)
      if (th.parent && score.has(th.parent)) score.set(th.parent, (score.get(th.parent) ?? 0) + 1.5)
    }
  }
  const best = Math.max(0, ...score.values())
  const place_hint = placeFromText(text)
  if (best <= 0) return { theme: null, variables: [], place_hint, reason: NO_MATCH[l], source: 'keywords' }
  // ties go to the more specific question (a sub-topic), then catalog order
  const tied = cat.themes.filter((t) => score.get(t.id) === best)
  const theme = tied.find((t) => t.parent) ?? tied[0]
  const ranked = cat.variables
    .filter((v) => v.themes[theme.id])
    .map((v, i) => {
      const nameBag = bag(v.name.simple, v.name.simple_es)
      const defBag = bag(v.definition.simple, v.definition.simple_es, v.words.subject, v.words_es?.subject)
      return { id: v.id, i, s: 2 * overlap(weights, nameBag) + overlap(weights, defBag) + (ROLE_BONUS[v.themes[theme.id]] ?? 0) }
    })
    .sort((a, b) => b.s - a.s || a.i - b.i)
  return {
    theme: theme.id,
    variables: ranked.slice(0, MAX_VARIABLES).map((r) => r.id),
    place_hint,
    reason: matchReason(plain(theme.name, l), l),
    source: 'keywords',
  }
}
