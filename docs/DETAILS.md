# Trend Detective: Earth trends, measured and tested

**NASA Space Apps Challenge 2026 · Challenge: "Be An Earth System Trend Detective!"**

Trend Detective is a guided web app that helps anyone find out **what is changing in a place, by how much, and
whether the change is real**, using NASA Earth-science data. Pick a place and a plain question (heat, water or air);
the app chooses the NASA variables that can answer it, removes the seasonal cycle, measures the rate of change per
10 years with a 95% range, and tests whether that change is statistically significant. Every answer can be read in
a **Simple** view written for a 9-year-old or a **Scientific** view with the full numbers, in **English or Spanish**.

> This is a NASA Space Apps Challenge project. It is not endorsed by NASA.

**Contents:** [NASA Space Apps](#nasa-space-apps-challenge) ·
[The challenge](#the-challenge-be-an-earth-system-trend-detective) ·
[How we meet the objectives](#how-we-meet-the-objectives) · [Features](#features) · [The science](#the-science) ·
[NASA data used](#nasa-data-used) · [Limitations](#limitations-and-future-work) · [Run it](#run-it) ·
[Developer guide](#developer-guide) · [Credits, AI use and references](#credits-ai-use-and-references)

---

## NASA Space Apps Challenge

The NASA Space Apps Challenge is a hackathon run by NASA in which teams build solutions to challenges set by NASA,
using NASA's open data. It is funded by NASA's Science Mission Directorate. This repository is our team's
submission to the 2026 edition.

## The challenge: "Be An Earth System Trend Detective!"

[Challenge page](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/?tab=details) ·
difficulty: Advanced · subjects: Earth Science, Software.

Earth's interconnected system is always changing, and when a change runs in one direction (rising or falling,
thickening or thinning) the measured variables reflect it. But there are so many Earth-science variables that it is
hard to choose the ones that could show change, and a variable can trend one way in one region and the opposite
way in another, even when the same process drives both. The challenge asks for a tool that can **select variables
measured by Earth-science missions or produced by models, visualize how they change over time, and determine what
is changing, where, how much, and whether the change is "significant"**.

The four objectives:

1. **Identify** Earth-science variables of interest that can be investigated for potential trends.
2. **Acquire** the data variables for a particular region (most trends are not global).
3. **Generate and visualize a time series** for that variable and region, long enough for statistical analysis.
4. **Analyze** the series: the rate of change over time and a significance test (t-test, Mann–Kendall or
   confidence intervals).

The challenge suggests high-school and college students and the scientifically curious public as the audience,
simple definitions of variables, a short series of questions to guide the user, and a couple of demonstration
examples to watch. It notes that trends can hide behind the seasonal cycle, that linear trends are a great start,
and that a trend which is not yet significant is still interesting, because it may only need a longer record.

## Our solution

Trend Detective turns that brief into three steps: **pick a place → ask a question → see what changed**.

- **For two audiences.** Our team added its own requirement: a primary-school child should be able to read the
  answer. The Simple view gives the answer first in one short sentence, then "how sure are we" as a three-step
  meter (*Sure it's real* / *Maybe, not sure yet* / *Too soon to tell*), then "then vs now" in whole numbers.
  The Scientific view keeps the slope, 95% interval, p-values, effective sample size and test names for students.
  Both views always make the same claim.
- **Honest by design.** "Not significant" is never "no change": the app says *Too soon to tell* and estimates how
  many more years would be needed at the observed rate. Known instrument and model breaks lower the certainty. The
  variables are chosen before any trend is computed, so the tool cannot "go fishing" for significant results.
- **Works offline for the demo.** The ready-made places run from saved NASA results, so the demo never depends on
  a live NASA service. Any other place on Earth uses live NASA data through our API.

## How we meet the objectives

| Objective | What the app does | Where to see it |
|---|---|---|
| **1. Identify variables** | A plain question (heat, water, air, plus 7 narrower sub-questions such as *Rain* or *Warm nights*) selects the NASA variables declared for it in the catalog. Each card shows a one-line definition, why it is worth a look (a published finding or what the record can detect), its mission or model, and the minimum change the record could detect. Variables that cannot answer here are listed with the reason (no data, too short, too many gaps, box too large…). | Start page step 2 → findings page cards |
| **2. Acquire data for a region** | Six ready-made places (Cajamarca highlands and its highland-only twin in Peru, Wisconsin, Delhi, the Amazon near Manaus, the Sahara near Tamanrasset) or **any place**: search a town, click the map (a point or a box up to 10° × 10°), or type coordinates. Data comes from NASA Giovanni and NASA POWER. A "Is this one kind of place?" check warns when a box mixes different climates whose changes could cancel out. | Start page step 1 (Search, On the map, Coordinates, Ready-made places) |
| **3. Time series and visualization** | At least 15 years of monthly data per variable. The seasonal cycle is removed before testing. The Simple chart shows one dot per year with the trend line; the Scientific view adds the monthly series, the de-seasonalised series and the 95% band. A coverage timeline shows the years each record covers and the years left out. | Findings page sparklines and "Years of data"; variable page charts |
| **4. Rate of change and significance** | Sen's slope per 10 years in plain units with a persistence-corrected 95% range. Significant only when **both** a Mann–Kendall test (Hamed–Rao correction) and an OLS t-test with effective sample size agree at α = 0.05. Robustness checks: leave one year out, other start years, a second instrument, cell agreement, known breaks. | Variable page verdict, "Can we trust this?" panel, Scientific view test table |
| **Audience and definitions** | Simple and Scientific views, a kid-word dictionary for every term on screen, English and Spanish. | Switches in the header; dotted-underlined terms |
| **Guiding questions** | Pick a place, then one of three questions or a sub-question. | Start page |
| **Demonstrations to watch** | Two guided demos with a spotlight and captions, from saved data: *The mountains of Peru* (water) and *A big city, Delhi* (air). | "Watch a demo" in the start-page hero |
| **Opposite trends in different regions** | "Where else?" compares the same variable across the ready-made places and says when it goes up in one place and down in another. "Do the parts of your box agree?" counts grid cells that go the opposite way. | Variable page |
| **Not significant yet** | *Too soon to tell. If it keeps going like this, we'd know in about N more years.* (Weatherhead et al. 1998) | Variable page verdict |

## Features

### Start page
- Hero with a slowly turning dotted Earth (drawn on the device, still for reduced motion) and **Watch a demo** buttons.
- A three-step progress bar and a place picker with four tabs:
  - **Search**: place search (Open-Meteo geocoding, typed text only) and *Use my location*.
  - **On the map**: click once for a point or twice for a box; optional map layers shade the long-term average of
    temperature, rain or haze (NASA POWER climatology) so you can pick a spot inside one kind of place.
  - **Coordinates**: a point or a box, with N/S and E/W pickers.
  - **Ready-made places**: six cards that work offline.
- Step 2: the chosen place with its size, then the Heat, Water and Air questions with their sub-questions.

### Findings page (one place, one question)
- Place title with chips for climate group, area, height and rainy months (model-based values say so).
- **"Is this one kind of place?"**: before any trend, the box's NASA POWER climatology is checked for mixing
  (Köppen groups, elevation range, rainfall contrast) and, if mixed, up to three smaller one-kind parts are offered.
- A form to change place, question, years and time of year (whole year, rainy season, dry season).
- A summary sentence with a count per certainty level, all variables compared over **one shared window**.
- "How we worked this out": the four stages of the method, each opening a list of its steps.
- The instruments in the list (satellite or computer model) and one card per variable: verdict, direction, chart,
  reason, source. Then the "Years of data" timeline and the variables that can't answer here, with reasons.

### Variable page (one variable, one place)
- **Verdict**: answer first, the three-step "how sure" meter (icon + word, never colour alone), then vs now, and
  *Tell me more* with the full numbers.
- Charts: yearly dots (Simple) and monthly / de-seasonalised series with the 95% band (Scientific).
- **Time of year and your own years**: declared seasons, or typed-in years, shown as *your choice* beside the
  declared window's answer so a period picked after looking cannot pass as the main finding.
- **What if we start in another year?**: the same tests for every start year that still leaves 15 years.
- **Can we trust this?**: data quality and known breaks, record length, a **second opinion** from another
  instrument or model over the shared years, **do the parts of your box agree?**, and **what scientists found
  here** (published findings for the place's IPCC AR6 region).
- **Where else?**: the same variable's verdict in the other ready-made places.
- **You found a real change!**: on *Sure it's real*, save the find to your **detective notebook**.

### Detective notebook
- Saved finds (place, variable, window, slope per 10 years, 95% range, test results, mission and dataset) are kept
  **in your browser only**; nothing is sent to a server.
- Share a find with **Copy report** (plain text) or **Download JSON**, with a link to the NASA Earthdata Forum.

### Learning pages
- **How it works**: the whole method as one path of 16 numbered steps in four stages (get the data, clean it, find
  the trend, check and explain), in both views.
- **Data sources**: every satellite instrument and model with its mission, product and link, the AI-use disclosure
  and the no-endorsement line.

### Everywhere
- Simple / Scientific switch, English / Spanish switch (soft cross-fade), light / dark mode; all remembered.
- Dictionary of kid-word definitions on hover, focus or tap.
- Accessibility: skip link, keyboard-friendly tabs and menus, focus management, screen-reader labels, reduced-motion
  support, large tap targets, certainty always shown with an icon and a word.
- Responsive layout from phones to wide screens.

## The science

One fixed protocol, declared before results are seen (backend `trend_detective`):

1. **Select** (before any trend): the question, a cited reason to expect change, fitness (coverage ≥ 90% of
   months, ≥ 15 years, enough grid cells, no known break) and the **minimum detectable trend** from the record's
   noise and persistence.
2. **Prepare**: daily or hourly data become monthly values; box values are cos(latitude)-weighted means in which
   each grid cell keeps its own monthly offset, so cells dropping in and out cannot create a trend; the
   **seasonal cycle is removed** by subtracting each calendar month's mean over the window.
3. **Trend**: **Sen's slope** per 10 years with a 95% interval (Gilbert 1987) using the **Hamed–Rao**
   persistence-corrected variance. The same calculation draws the chart band and the verdict range.
4. **Test**: **Mann–Kendall with the Hamed–Rao correction** and an **OLS t-test with effective sample size**
   (n_eff from the lag-1 autocorrelation). *Significant* only when both agree at α = 0.05; one of two is
   *borderline*. Seasonal Mann–Kendall and a Welch test of per-month slopes are context only.
5. **Check**: leave one year out, other start years (Liebmann et al. 2010), a second source, cell agreement with
   Benjamini–Hochberg (Wilks 2016), and **known breaks** (satellite orbit drift, OMI row anomaly, model input and
   frozen-emission changes such as MERRA-2's, Randles et al. 2017): a window across a break is never *Sure it's real*.
6. **Explain**: a mechanical verdict label written in both views; a scan across a question uses
   **Benjamini–Hochberg** across its variables; *Too soon to tell* includes years-to-detect (Weatherhead et al. 1998).

The app never writes "caused by", "proves" or "no change".

## NASA data used

| Instrument / model | Mission / provider | Variables | Questions |
|---|---|---|---|
| AIRS | Aqua satellite | Surface air temperature (day, night), surface relative humidity (day, night) | Heat, Water |
| GPM IMERG | Global Precipitation Measurement | Precipitation | Water |
| GLDAS Noah | NASA land data assimilation model | Soil moisture 0–10 cm, evapotranspiration | Water |
| MERRA-2 | NASA reanalysis model | Sulfate and organic carbon particles | Air |
| OMI | Aura satellite | Aerosol optical depth (UV), nitrogen dioxide | Air |
| NASA POWER | Built on MERRA-2 (and CERES SYN1deg for haze) | Temperature, precipitation, humidity, aerosol optical depth, climatology maps | Heat, Water, Air |

Data is served through **NASA Giovanni** (GES DISC; the cloud API with a server-side Earthdata token, plus saved
exports and a committed cache) and **NASA POWER**. MODIS aerosol and MOPITT carbon monoxide cards exist but stay
unlisted until their data can be served, as do MERRA-2 aerosol optical depth and the duplicate MERRA-2 temperature
and rain cards (their NASA POWER versions are used instead). Every number on screen comes from these datasets, and model outputs are
labelled "computer model estimate" in the Simple view.

## Limitations and future work

- Land and lower-atmosphere variables only: no ocean or pressure-level variables yet.
- Linear (monotonic) trends only; no change-point or curved-trend analysis.
- Records must be at least 15 years long; AIRS is cut at the end of 2021 because of Aqua's orbit drift.
- MODIS and MOPITT need manual Giovanni downloads before they can be listed.
- The published findings (39 IPCC AR6 statements plus one NASA OMI study) were opened and summarised during
  research and still need a final human check (see `docs/sources-checked.md`).
- No AI variable suggestions: the app uses no AI; the question flow and catalog choose the variables.

## Run it

Needs **Node ≥ 20** and **[uv](https://docs.astral.sh/uv/)**. From the repo root:

```bash
npm install && npm run dev
```

This syncs the dependencies and starts the API (http://localhost:8000, docs at `/docs`) and the web app
(http://localhost:5173) with `[api]` / `[web]` logs; Ctrl+C stops both. It uses the committed results; after
changing the catalog or the engine, run `npm run precompute` to rebuild them. Run one side alone with
`npm run dev:api` or `npm run dev:web`.

**Without the API** (static files only) the demos, the ready-made places, declared seasons, "Where else?" and the
notebook all work; search, the map, coordinates, custom places and custom year ranges need the API.

**Live Giovanni data** needs an Earthdata token: copy `backend/.env.example` to `backend/.env` and set
`EARTHDATA_TOKEN` (server-side only, git-ignored). Without it, NASA POWER is the no-login fallback.

**Use it from other devices on your network** (phone, tablet, another laptop):

```bash
npm run lan
```

It builds the app and serves it on your private LAN address only (e.g. `http://192.168.0.6:4173`). The API stays on
`127.0.0.1` and is reached only through the web server's `/api` proxy, so it is never exposed to the network. There
is no password: use it on a trusted Wi-Fi. If another device can't connect, allow TCP port 4173 from your local
network in your firewall. Set `LAN_HOST` to choose the address, or `API_PORT` / `WEB_PORT` to change ports.

## Developer guide

### Tech stack
- **Frontend**: React 19, TypeScript, Vite, Leaflet (maps), Plotly (charts), Vitest.
- **Backend**: Python ≥ 3.12, FastAPI, NumPy, SciPy, pymannkendall, uv, pytest.

### Repo layout

```text
catalog/    variable, theme, region, instrument, expectation and glossary cards (YAML, hand-written)
contract/   JSON Schema of the result objects (generated from backend/contract.py)
data/       Giovanni CSV exports (raw/) and the committed NASA data cache (cache/)
backend/    Python analysis engine + FastAPI (uv project)
web/        React + Vite + TypeScript front end; saved results in web/public/data
docs/       research notes: sources checked, data integration tracker, offline downloads
scripts/    dev, release and version helpers
```

### Backend

```bash
cd backend
uv sync                                              # install (Python >= 3.12)
uv run pytest -q                                     # tests
uv run python scripts/precompute.py                  # write static results to web/public/data
uv run python scripts/export_schema.py               # refresh contract/*.schema.json
uv run uvicorn trend_detective.api:app --reload      # API on http://localhost:8000 (docs at /docs)
```

Main endpoints: `/health`; `/regions`, `/themes`, `/variables`, `/glossary` (catalog);
`/regions/{region}/scan?theme=` and `/regions/{region}/variables/{variable}` (with `/analyze?start&end&season` for
a custom window); `/custom/scan` and `/custom/variables/{variable}` (any point or box up to 10° × 10°);
`/climatology/grid` (map layers).

Docker (API image, built from the repo root so it includes `catalog/` and `data/`):

```bash
docker build -f backend/Dockerfile -t trend-detective-api .
docker compose up api
```

### Configuration
- `EARTHDATA_TOKEN`: server secret, never in the repo or the web build.
- `TD_GIOVANNI_OFFLINE=1` / `TD_POWER_OFFLINE=1`: use only the committed cache, no calls to NASA.
- The live endpoints are rate limited in-process (per server process, reset on restart). Over the limit the API
  answers HTTP 429 with `Retry-After` and a plain message in `detail` (English) and `detail_es` (Spanish). Cached
  answers do not use the global live budget.

| Variable | Default | Meaning |
|---|---|---|
| `TD_RATE_PER_MIN` | `20` | Requests per minute per client IP (steady rate) |
| `TD_RATE_BURST` | `10` | Requests one client IP can make at once before waiting |
| `TD_LIVE_PER_MIN` | `60` | All clients together: new (uncached) live computations per minute |
| `TD_MAP_PER_MIN` / `TD_MAP_BURST` | `60` / `30` | Same limits for the map climatology layer |
| `TD_TRUST_PROXY` | unset | `1` = take the client IP from the last `X-Forwarded-For` entry; only behind a proxy you control |
| `TD_ALLOWED_ORIGINS` | | CORS origins allowed to call the API |
| `TD_GIOVANNI_MAX_CALLS` | `36` | Cap on Giovanni calls for one interactive request |

Set a rate limit to `0` to turn it off.

### Adding data
1. Download a Giovanni "Time Series, Area-Averaged" monthly CSV for the region (use the region's exact box).
2. Drop it into `data/raw/<region_id>/` with Giovanni's file name.
3. Make sure the variable has a card in `catalog/variables.yaml` (the Giovanni id must match).
4. Run `npm run precompute`.

Data access goes through `SeriesSource` (`backend/src/trend_detective/sources/`), so new sources plug in without
touching the engine.

### Tests, CI and releases
- `npm test` runs the backend (pytest) and web (Vitest) suites: about 300 backend and 300 web tests, including
  checks that every Simple-view sentence follows the plain-language rules in both languages.
- CI (`.github/workflows/ci.yml`) checks the version, lints, runs an engine smoke test and builds the web app; it
  never calls Giovanni.
- The version is in `VERSION` (shown in the footer in the Scientific view and at `/health`). Releases are git tags
  `vX.Y.Z` with a GitHub Release each: `npm run release -- patch|minor|major`. See [RELEASING.md](../RELEASING.md)
  and [CHANGELOG.md](../CHANGELOG.md).
**Demo video (29 s):** https://rennleon.github.io/hackaton-nasa-space-apps-2026/ (file: `docs/trend-detective-demo.mp4`).
The video was scripted, recorded and captioned with Claude Code; an AI-disclosure line is burned into every frame.

**What it does.** Earth System Trend Detective helps students and the public find out what is changing in a place,
by how much, and whether the change is real. A user picks a plain question (heat, water, air), sees which NASA
variables can answer it, chooses a place, and gets a many-year chart with the seasonal cycle removed, the rate of
change per 10 years with a 95% range, and an honest "how sure are we" verdict. A real change can be saved to a local
"detective notebook" and shared as a plain-text report or JSON file (nothing is sent to a server).

## Credits, AI use and references

**Data.** NASA Giovanni (GES DISC), NASA POWER, and the missions and models listed above. Map tiles ©
OpenStreetMap contributors. Place search by Open-Meteo. Globe land outline from Natural Earth (public domain) via
`world-atlas`. IPCC AR6 reference regions from Iturbide et al. (2020); see `catalog/ar6_reference_regions.SOURCE.md`.

**Software.** React, Vite, Leaflet, Plotly, FastAPI, NumPy, SciPy, pymannkendall; fonts Space Grotesk, Bricolage
Grotesque, Inter and JetBrains Mono (via Fontsource).

**AI use.** The team used AI coding assistants (Claude Code by Anthropic) to help write code and text. The app
itself uses no AI: every number comes from NASA data and our statistics code. This is also disclosed on the app's
Data sources page.

**References** (methods): Gilbert (1987) for Sen's slope intervals; Hamed & Rao (1998) for the
autocorrelation-corrected Mann–Kendall test; Weatherhead et al. (1998) for years to detect a trend; Benjamini &
Hochberg (1995) for false discovery rate; Wilks (2016) for field significance; Liebmann et al. (2010) for start-year
sensitivity; Randles et al. (2017) for MERRA-2 aerosol inputs. Published regional findings come from IPCC AR6
Working Group I and Krotkov et al. (2016). Full references, pages and links are in
[`docs/sources-checked.md`](sources-checked.md) and `catalog/expectations.yaml`.

**Disclaimer.** This is a NASA Space Apps Challenge project. It is not endorsed by NASA, and it uses no NASA logos.
