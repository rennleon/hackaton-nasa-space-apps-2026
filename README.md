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
