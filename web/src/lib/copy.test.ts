import { describe, expect, it } from 'vitest'
import { COPY, CERTAINTY_STEPS, CERTAINTY_CANT_TELL } from './copy'
import type { Text } from '../types/contract'

export const BANNED = [/p-value/i, /significant/i, /decade/i, /anomaly/i, /autocorrelation/i, /percentage points/i, /confidence interval/i, /statistically/i, /%RH/]

export function bannedIn(text: string): string[] {
  return BANNED.filter((re) => re.test(text)).map(String)
}

function simpleStrings(): string[] {
  const out: string[] = []
  const add = (v: unknown) => {
    if (typeof v === 'function') {
      const r = (v as (...a: never[]) => unknown)(...([2002, 2021] as never[]))
      add(r)
    } else if (v && typeof v === 'object' && 'simple' in v) out.push((v as Text).simple)
  }
  Object.values(COPY).forEach(add)
  CERTAINTY_STEPS.forEach((s) => out.push(s.text.simple))
  out.push(CERTAINTY_CANT_TELL.text.simple)
  return out
}

describe('Simple-view copy', () => {
  it('contains no banned technical words', () => {
    for (const s of simpleStrings()) expect(bannedIn(s), s).toEqual([])
  })
  it('keeps sentences short', () => {
    for (const s of simpleStrings()) for (const sentence of s.split(/[.?!]\s/)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(16)
  })
  it('has all three meter words', () => {
    expect(CERTAINTY_STEPS.map((s) => s.text.simple)).toEqual(['Too soon to tell', 'Maybe, not sure yet', "Sure it's real"])
  })
})
