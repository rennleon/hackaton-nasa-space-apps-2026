#!/usr/bin/env node
// One command for the whole app: `npm run dev` from the repo root.
// `npm run lan` (this script with --lan) shares it with other devices on your local network:
// it serves the production build (vite preview, not the dev server) on your PRIVATE LAN address
// only; the API stays on 127.0.0.1 and is reached through the web server's /api proxy.
// 1) checks/syncs dependencies  2) regenerates the static results (offline, from cache)
// 3) starts the FastAPI backend (:8000) and the Vite front end (:5173) with prefixed logs
// 4) on Ctrl+C (or if either side exits) stops BOTH process groups, leaving nothing behind.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BACKEND = path.join(ROOT, 'backend')
const WEB = path.join(ROOT, 'web')
const API_PORT = Number(process.env.API_PORT || 8000)
const LAN = process.argv.includes('--lan')
const WEB_PORT = Number(process.env.WEB_PORT || (LAN ? 4173 : 5173))
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

function portFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, host)
  })
}

// Private (RFC 1918) IPv4 only, so the app is never bound to a public address.
const isPrivate = (ip) => /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
function lanAddress() {
  if (process.env.LAN_HOST) {
    if (!isPrivate(process.env.LAN_HOST)) fail(`LAN_HOST=${process.env.LAN_HOST} is not a private address.`)
    return process.env.LAN_HOST
  }
  const skip = /^(docker|br-|veth|virbr|lo|tun|tap|wg|zt|tailscale)/ // containers, VPNs, loopback
  const found = []
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (skip.test(name)) continue
    for (const a of addrs ?? []) if (a.family === 'IPv4' && !a.internal && isPrivate(a.address)) found.push(a.address)
  }
  found.sort((a, b) => (b.startsWith('192.168.') ? 1 : 0) - (a.startsWith('192.168.') ? 1 : 0))
  if (!found.length) fail('No private LAN address found. Connect to your Wi-Fi/LAN, or set LAN_HOST=192.168.x.y.')
  return found[0]
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
// The results are committed to git, so start from them. Recomputing on every start was slow, and on a machine
// without the per-cell Giovanni files it silently dropped the cell-agreement check from committed results.
// Recompute on purpose with `npm run dev -- --precompute` or `npm run precompute`.
const stamp = path.join(WEB, 'public', 'data', 'catalog', 'regions.json')
const FORCE = process.argv.includes('--precompute')
const inputs = FORCE ? [] : ['catalog', path.join('backend', 'src')].map((d) => newest(path.join(ROOT, d)))
if (!FORCE && existsSync(stamp)) {
  if (statSync(stamp).mtimeMs < Math.max(...inputs)) {
    log('setup', 'Using the committed results. Catalog or engine changed since: run `npm run precompute` if you need new numbers.')
  } else log('setup', 'Static results are up to date; skipping precompute.')
} else if (!run('setup', 'uv', ['run', 'python', 'scripts/precompute.py'], BACKEND, { TD_POWER_OFFLINE: '1' }).ok) {
  fail('Precompute failed. See the error above.')
}

// ---------- 3. ports (and, for --lan, the production build)
const WEB_HOST = LAN ? lanAddress() : 'localhost'
if (!(await portFree(API_PORT))) fail(`Port ${API_PORT} (API) is already in use. Stop whatever is using it, then retry.`)
if (!(await portFree(WEB_PORT, LAN ? WEB_HOST : '127.0.0.1'))) {
  fail(`Port ${WEB_PORT} (web) is already in use. Stop whatever is using it, then retry.`)
}
if (LAN && !run('setup', 'npm', ['run', 'build'], WEB, { VITE_API_URL: '/api' }).ok) fail('The web build failed.')

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

const apiUrl = `http://127.0.0.1:${API_PORT}`
// The API listens on 127.0.0.1 only; the browser reaches it through Vite's same-origin /api proxy.
const apiArgs = ['run', 'uvicorn', 'trend_detective.api:app', '--host', '127.0.0.1', '--port', String(API_PORT)]
start('api', 'uv', LAN ? apiArgs : [...apiArgs, '--reload'], BACKEND)
if (LAN) {
  start('web', 'npm', ['run', 'preview', '--', '--host', WEB_HOST, '--port', String(WEB_PORT), '--strictPort'], WEB, {
    API_PORT: String(API_PORT),
  })
} else {
  start('web', 'npm', ['run', 'dev', '--', '--port', String(WEB_PORT), '--strictPort'], WEB, {
    VITE_API_URL: '/api',
    API_PORT: String(API_PORT),
  })
}
const webUrl = `http://${WEB_HOST}:${WEB_PORT}`

const [apiUp, webUp] = await Promise.all([waitFor(`${apiUrl}/health`), waitFor(`${webUrl}/`)])
if (!apiUp || !webUp) {
  log('setup', `\x1b[31m${!apiUp ? 'The API' : 'The web app'} did not start. See the logs above.${RESET}`)
  stop(1)
} else {
  if (LAN) {
    log('setup', `\x1b[32mReady. On any device on this network open ${webUrl}${RESET}`)
    log('setup', 'Shared on your local network only (no password): use it on a trusted Wi-Fi, not a public one.')
    log('setup', 'Press Ctrl+C to stop sharing.')
  } else {
    log('setup', `\x1b[32mReady. Open ${webUrl}  (API docs: ${apiUrl}/docs). Press Ctrl+C to stop both.${RESET}`)
  }
}
