#!/usr/bin/env node
// Single source of truth for the app version: the VERSION file at the repo root (SemVer, e.g. 0.1.0).
//   node scripts/version.mjs check            -> fails if any file disagrees with VERSION
//   node scripts/version.mjs set <x.y.z|patch|minor|major>  -> writes VERSION and syncs every file
// Files kept in sync: package.json (root + web), package-lock.json (root + web), backend/pyproject.toml,
// backend/uv.lock (this project's entry), backend/src/trend_detective/__init__.py (ENGINE_VERSION).
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const p = (...xs) => path.join(ROOT, ...xs)
const SEMVER = /^\d+\.\d+\.\d+$/

export const readVersion = () => readFileSync(p('VERSION'), 'utf8').trim()

const targets = [
  { file: p('package.json'), get: (s) => JSON.parse(s).version, set: setJsonVersion },
  { file: p('web', 'package.json'), get: (s) => JSON.parse(s).version, set: setJsonVersion },
  { file: p('package-lock.json'), get: (s) => JSON.parse(s).version, set: setLockVersion },
  { file: p('web', 'package-lock.json'), get: (s) => JSON.parse(s).version, set: setLockVersion },
  {
    file: p('backend', 'pyproject.toml'),
    get: (s) => s.match(/^version = "([^"]+)"/m)?.[1],
    set: (s, v) => s.replace(/^version = "[^"]+"/m, `version = "${v}"`),
  },
  {
    file: p('backend', 'uv.lock'),
    get: (s) => s.match(/name = "trend-detective"\nversion = "([^"]+)"/)?.[1],
    set: (s, v) => s.replace(/(name = "trend-detective"\nversion = )"[^"]+"/, `$1"${v}"`),
  },
  {
    file: p('backend', 'src', 'trend_detective', '__init__.py'),
    get: (s) => s.match(/ENGINE_VERSION = "([^"]+)"/)?.[1],
    set: (s, v) => s.replace(/ENGINE_VERSION = "[^"]+"/, `ENGINE_VERSION = "${v}"`),
  },
]

function setJsonVersion(s, v) {
  const j = JSON.parse(s)
  j.version = v
  return JSON.stringify(j, null, 2) + '\n'
}
function setLockVersion(s, v) {
  const j = JSON.parse(s)
  j.version = v
  if (j.packages?.['']) j.packages[''].version = v
  return JSON.stringify(j, null, 2) + '\n'
}

export function bump(current, how) {
  if (SEMVER.test(how)) return how
  const [ma, mi, pa] = current.split('.').map(Number)
  if (how === 'major') return `${ma + 1}.0.0`
  if (how === 'minor') return `${ma}.${mi + 1}.0`
  if (how === 'patch') return `${ma}.${mi}.${pa + 1}`
  throw new Error(`expected x.y.z, patch, minor or major; got "${how}"`)
}

export function check() {
  const v = readVersion()
  const bad = []
  for (const t of targets) {
    const found = t.get(readFileSync(t.file, 'utf8'))
    if (found !== v) bad.push(`${path.relative(ROOT, t.file)}: ${found ?? 'not found'}`)
  }
  return { version: v, bad }
}

export function setVersion(v) {
  if (!SEMVER.test(v)) throw new Error(`not a SemVer version: ${v}`)
  writeFileSync(p('VERSION'), v + '\n')
  for (const t of targets) writeFileSync(t.file, t.set(readFileSync(t.file, 'utf8'), v))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, arg] = process.argv.slice(2)
  if (cmd === 'check') {
    const { version, bad } = check()
    if (bad.length) {
      console.error(`Version mismatch (VERSION = ${version}):\n  ${bad.join('\n  ')}\nRun: node scripts/version.mjs set ${version}`)
      process.exit(1)
    }
    console.log(`All version fields are ${version}.`)
  } else if (cmd === 'set' && arg) {
    const next = bump(readVersion(), arg)
    setVersion(next)
    console.log(`Version set to ${next}.`)
  } else {
    console.error('usage: node scripts/version.mjs check | set <x.y.z|patch|minor|major>')
    process.exit(2)
  }
}
