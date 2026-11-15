#!/usr/bin/env node
// Cut a release on main:  npm run release -- <patch|minor|major|x.y.z>
//  1. checks you are on a clean, up-to-date main
//  2. bumps VERSION and every version field (skipped if the version is already current, e.g. the first release)
//  3. turns the "## [Unreleased]" CHANGELOG section into "## [x.y.z] - YYYY-MM-DD"
//  4. regenerates the static results (they carry the engine version)
//  5. commits "release: vx.y.z" and creates the annotated tag vx.y.z
// It never pushes. Publish with:  git push origin main --follow-tags
// (pushing the tag triggers .github/workflows/release.yml, which builds and publishes the GitHub Release).
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT, bump, check, readVersion, setVersion } from './version.mjs'

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
const die = (msg) => {
  console.error(`\x1b[31m${msg}\x1b[0m`)
  process.exit(1)
}

const how = process.argv[2]
if (!how) die('usage: npm run release -- <patch|minor|major|x.y.z>')
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') die('Releases are cut from main. Run: git checkout main && git pull')
if (git('status', '--porcelain')) die('Working tree is not clean. Commit or stash first.')

const current = readVersion()
const next = bump(current, how)
const tag = `v${next}`
if (git('tag', '--list', tag)) die(`Tag ${tag} already exists.`)

if (next !== current) setVersion(next)
const { bad } = check()
if (bad.length) die(`Version fields disagree:\n  ${bad.join('\n  ')}`)

// CHANGELOG: move Unreleased -> [next]
const clPath = path.join(ROOT, 'CHANGELOG.md')
let cl = readFileSync(clPath, 'utf8')
const today = new Date().toISOString().slice(0, 10)
if (!cl.includes(`## [${next}]`)) {
  if (!cl.includes('## [Unreleased]')) die('CHANGELOG.md has no "## [Unreleased]" section to release.')
  cl = cl.replace('## [Unreleased]', `## [Unreleased]\n\n## [${next}] - ${today}`)
  writeFileSync(clPath, cl)
}

// Static results carry engine_version: regenerate them offline (NASA POWER and Giovanni from the committed cache).
execFileSync('uv', ['run', 'python', 'scripts/precompute.py'], {
  cwd: path.join(ROOT, 'backend'),
  stdio: 'inherit',
  env: { ...process.env, TD_POWER_OFFLINE: '1', TD_GIOVANNI_OFFLINE: '1' },
})

git('add', '-A')
if (git('status', '--porcelain')) git('commit', '-m', `release: ${tag}`)
git('tag', '-a', tag, '-m', `Earth System Trend Detective ${tag}`)
console.log(`\x1b[32mTagged ${tag}.\x1b[0m Publish it with:\n  git push origin main --follow-tags`)
