# Earth System Trend Detective

NASA Space Apps 2026: a guided tool that helps students and the public find out what is changing in a place,
by how much, and whether the change is real, using NASA Earth-science data. Every result can be read in a
**Simple** view (kid-friendly words, backed by a dictionary) or a **Scientific** view.

## Run it

From the repo root (needs Node ≥ 20 and [uv](https://docs.astral.sh/uv/)):

```bash
npm install && npm run dev
```

This syncs the dependencies, regenerates the static results, starts the API (http://localhost:8000, docs at
`/docs`) and the web app (http://localhost:5173) with `[api]` / `[web]` logs, and stops both on Ctrl+C.
Run one side alone with `npm run dev:api` or `npm run dev:web`.

**Use it from other devices on your network** (phone, tablet, another laptop):

```bash
npm run lan
```

It builds the app and serves it on your private LAN address only (e.g. `http://192.168.0.6:4173`). It serves the
production build, not the dev server; the API stays on `127.0.0.1` and is reached only through the web server's
`/api` proxy, so it is never exposed to the network. There is no password: use it on a trusted Wi-Fi, not a public
one. If another device can't connect, allow TCP port 4173 from your local network in your firewall. Set `LAN_HOST`
to choose the address, or `API_PORT` / `WEB_PORT` to change ports (e.g. while `npm run dev` is also running). The pre-loaded regions also work without the
API (static files), so the demo never depends on a live NASA service.

## Versions and rollback

The current version is in `VERSION` (also shown in the app footer and at `/health`). Releases are git tags
`vX.Y.Z` with a GitHub Release each; cut one with `npm run release -- patch|minor|major`. See
[RELEASING.md](RELEASING.md) for releasing and rolling back, and [CHANGELOG.md](CHANGELOG.md) for what changed.

## Repo layout (monorepo)

```text
catalog/    variable, theme, region and glossary cards (YAML, hand-written)
contract/   JSON Schema of the result objects (generated from backend/contract.py)
data/raw/   Giovanni CSV exports, one folder per region id
backend/    Python: analysis engine + FastAPI (uv project)
web/        React + Vite + TypeScript front end
```

## Backend (details)

```bash
cd backend
uv sync                                              # install (Python >= 3.12)
uv run pytest -q                                     # tests
uv run python scripts/precompute.py                  # write static results to web/public/data
uv run python scripts/export_schema.py               # refresh contract/*.schema.json
uv run uvicorn trend_detective.api:app --reload      # API on http://localhost:8000 (docs at /docs)
```

Docker (deploy image, built from the repo root so it includes `catalog/` and `data/`):

```bash
docker build -f backend/Dockerfile -t trend-detective-api .
docker compose up api
```

## Deploying

- Set `EARTHDATA_TOKEN` as a server secret (host environment variable), never in the repo or the web build.
- `TD_GIOVANNI_OFFLINE=1` makes the server use only the committed Giovanni cache: no calls to NASA Giovanni.
- The live endpoints (`/custom/scan`, `/custom/variables/*`) are rate limited in-process (per server process, reset
  on restart; no Redis). Over the limit the API answers HTTP 429 with `Retry-After` and a plain message in
  `detail` (English) and `detail_es` (Spanish). Cached answers do not use the global live budget.

| Variable | Default | Meaning |
|---|---|---|
| `TD_RATE_PER_MIN` | `20` | Requests per minute per client IP (steady rate) |
| `TD_RATE_BURST` | `10` | Requests one client IP can make at once before waiting |
| `TD_LIVE_PER_MIN` | `60` | All clients together: new (uncached) live computations per minute |
| `TD_TRUST_PROXY` | unset | `1` = take the client IP from the last `X-Forwarded-For` entry. Set it only behind a proxy you control, which must add that header |

Set a limit to `0` to turn it off.

## How the analysis works

One fixed protocol (see the MVP spec in the team doc): default window = full record, ending in Dec 2021 for
Aqua instruments (orbit drift) → remove the seasonal cycle → Sen's slope with a 95% range → two decisive tests
(Mann–Kendall with Hamed–Rao correction, OLS with effective sample size), seasonal Mann–Kendall for context →
robustness checks (leave one year out, drift years, cross-check source, neighbouring box) → years to detect →
a mechanical verdict label, written in both registers. Scans across a theme use Benjamini–Hochberg.

## Adding data

1. Download a Giovanni "Time Series, Area-Averaged" monthly CSV for the region (use the region's exact box).
2. Drop it into `data/raw/<region_id>/` with Giovanni's file name.
3. Make sure the variable has a card in `catalog/variables.yaml` (the Giovanni id must match).
4. Run `uv run python scripts/precompute.py`.

Data access goes through `SeriesSource` (`backend/src/trend_detective/sources/`), so a live Giovanni fetcher
can replace step 1 without touching the engine.

## Submission

**Demo video (29 s):** https://rennleon.github.io/hackaton-nasa-space-apps-2026/ (file: `docs/trend-detective-demo.mp4`).
The video was scripted, recorded and captioned with Claude Code; an AI-disclosure line is burned into every frame.

**What it does.** Earth System Trend Detective helps students and the public find out what is changing in a place,
by how much, and whether the change is real. A user picks a plain question (heat, water, air), sees which NASA
variables can answer it, chooses a place, and gets a many-year chart with the seasonal cycle removed, the rate of
change per 10 years with a 95% range, and an honest "how sure are we" verdict. A real change can be saved to a local
"detective notebook" and shared as a plain-text report or JSON file (nothing is sent to a server).

**Run it locally.** Needs Node ≥ 20 and [uv](https://docs.astral.sh/uv/). From the repo root:

```bash
npm install && npm run dev
```

The web app is at http://localhost:5173 and the API at http://localhost:8000. The pre-loaded places (Cajamarca
highlands, Wisconsin and the example points) work offline, from static files, so the demo never depends on a live
NASA service. See "Run it" above for `npm run lan` and the other options.

**AI use.** The team used AI coding assistants (Claude Code by Anthropic) to help write code and text. The app
itself uses no AI. All numbers come from NASA data and our statistics code. This is also disclosed on the app's Sources page.

**Data credits.** Every number comes from NASA satellite instruments and models (Giovanni, GES DISC, NASA POWER).
Instruments, datasets and links are on the app's Sources page (`#/sources`), and the references we checked are in
[`docs/sources-checked.md`](docs/sources-checked.md).

This is a NASA Space Apps Challenge project. It is not endorsed by NASA.
