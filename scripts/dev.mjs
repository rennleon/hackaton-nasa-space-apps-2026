#!/usr/bin/env node
// One command for the whole app: `npm run dev` from the repo root.
// 1) checks/syncs dependencies  2) regenerates the static results (offline, from cache)
// 3) starts the FastAPI backend (:8000) and the Vite front end (:5173) with prefixed logs
// 4) on Ctrl+C (or if either side exits) stops BOTH process groups, leaving nothing behind.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BACKEND = path.join(ROOT, 'backend')
const WEB = path.join(ROOT, 'web')
const API_PORT = Number(process.env.API_PORT || 8000)
const WEB_PORT = Number(process.env.WEB_PORT || 5173)
const COLORS = { setup: '\x1b[33m', api: '\x1b[36m', web: '\x1b[35m' }
const RESET = '\x1b[0m'

const log = (tag, msg) => process.stdout.write(`${COLORS[tag] ?? ''}[${tag}]${RESET} ${msg}\n`)
const fail = (msg) => {
  log('setup', `\x1b[31m${msg}${RESET}`)
  process.exit(1)
}

function run(tag, cmd, args, cwd, env = {}) {
  log(tag, `$ ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } })
  if (r.error?.code === 'ENOENT') return { missing: true }
  return { ok: r.status === 0 }
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, '127.0.0.1')
  })
}

async function waitFor(url, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) return true
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

// ---------- 1. dependencies
if (spawnSync('uv', ['--version']).error) {
  fail('`uv` was not found. Install it (https://docs.astral.sh/uv/getting-started/installation/), then run `npm run dev` again.')
}
if (!run('setup', 'uv', ['sync', '--quiet'], BACKEND).ok) fail('`uv sync` failed in backend/. Fix the error above and retry.')
if (!existsSync(path.join(WEB, 'node_modules'))) {
  if (!run('setup', 'npm', ['install', '--no-fund', '--no-audit'], WEB).ok) fail('`npm install` failed in web/.')
}

// ---------- 2. static results (NASA POWER from the on-disk cache, no network); skipped when up to date
function newest(dir) {
  if (!existsSync(dir)) return 0
  let t = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs)
  }
  return t
}
const stamp = path.join(WEB, 'public', 'data', 'catalog', 'regions.json')
const inputs = ['catalog', 'data', path.join('backend', 'src')].map((d) => newest(path.join(ROOT, d)))
if (existsSync(stamp) && statSync(stamp).mtimeMs >= Math.max(...inputs)) {
  log('setup', 'Static results are up to date; skipping precompute.')
} else if (!run('setup', 'uv', ['run', 'python', 'scripts/precompute.py'], BACKEND, { TD_POWER_OFFLINE: '1' }).ok) {
  fail('Precompute failed. See the error above.')
}

// ---------- 3. ports
for (const [name, port] of [['API', API_PORT], ['web', WEB_PORT]]) {
  if (!(await portFree(port))) fail(`Port ${port} (${name}) is already in use. Stop whatever is using it, then retry.`)
}

// ---------- 4. start both, each in its own process group so Ctrl+C can stop everything
const children = []
function start(tag, cmd, args, cwd, env = {}) {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const stream of [child.stdout, child.stderr]) {
    let buf = ''
    stream.on('data', (chunk) => {
      buf += chunk.toString()
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) if (line.trim()) log(tag, line)
    })
  }
  child.on('exit', (code, signal) => {
    if (!stopping) {
      log(tag, `exited (${signal ?? code}); stopping the other side`)
      stop(code ?? 1)
    }
  })
  children.push(child)
  return child
}

let stopping = false
function killGroups(signal) {
  for (const c of children) {
    try {
      process.kill(-c.pid, signal) // the whole group: uvicorn reloader + worker, npm + vite
    } catch {
      /* already gone */
    }
  }
}
function stop(code = 0) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  killGroups('SIGTERM')
  // Hard stop after 1.5 s; the timer keeps Node alive so the exit code is always `code`.
  setTimeout(() => {
    killGroups('SIGKILL')
    process.exit(code)
  }, 1500)
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => stop(0)) // SIGHUP: terminal closed

const apiUrl = `http://localhost:${API_PORT}`
start('api', 'uv', ['run', 'uvicorn', 'trend_detective.api:app', '--port', String(API_PORT), '--reload'], BACKEND)
// The web app calls the API through Vite's /api proxy (same origin), so CORS and localhost vs 127.0.0.1 don't matter.
start('web', 'npm', ['run', 'dev', '--', '--port', String(WEB_PORT), '--strictPort'], WEB, { VITE_API_URL: '/api' })

const [apiUp, webUp] = await Promise.all([waitFor(`${apiUrl}/health`), waitFor(`http://localhost:${WEB_PORT}/`)])
if (!apiUp || !webUp) {
  log('setup', `\x1b[31m${!apiUp ? 'The API' : 'The web app'} did not start. See the logs above.${RESET}`)
  stop(1)
} else {
  log('setup', `\x1b[32mReady. Open http://localhost:${WEB_PORT}  (API docs: ${apiUrl}/docs). Press Ctrl+C to stop both.${RESET}`)
}
