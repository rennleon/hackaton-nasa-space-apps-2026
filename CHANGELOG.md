# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Each release is a git tag `vX.Y.Z`; see RELEASING.md
for how to release and how to roll back.

## [Unreleased]

## [2.0.0] - 2026-11-15

### Added
- Live NASA data for any place: the Giovanni cloud API (server-side Earthdata token, never in the
  browser) alongside NASA POWER, for points and boxes (latitude-weighted cell mean, at least half the
  cells valid, call cap), with daily and hourly data turned into monthly values. A committed cache
  and offline mode (`TD_GIOVANNI_OFFLINE=1`, `TD_POWER_OFFLINE=1`) keep the ready-made places
  working with no network.
- Place search (Open-Meteo geocoding, typed text only), "Use my location", and five ready-made
  places: Cajamarca highlands, Wisconsin, Delhi, the Amazon near Manaus, the Sahara near Tamanrasset.
- Instrument catalog (`catalog/instruments.yaml`): every variable card names the instrument and
  platform and gets an availability label (available, no data here, too short, too many gaps,
  fetch failed, box too large) with a reason.
- Second opinion: cross-check pairs (POWER/AIRS temperature and humidity, POWER/IMERG rain,
  OMI/POWER haze) over a shared window, with a note when the two sources share data.
- Place profile (IPCC AR6 region, Köppen climate, wet/dry months, high ground) and published
  findings from `catalog/expectations.yaml` (39 AR6 statements, awaiting human confirmation).
- "Can we trust this?" panel, "Where else?" strip (same variable across the ready-made places),
  sources page, and two guided demos (Cajamarca water, Delhi air).
- Spanish user interface (EN/ES toggle, English default).
- Per-IP rate limit on the API (`TD_RATE_PER_MIN`, `TD_RATE_BURST`, `TD_LIVE_PER_MIN`,
  `TD_TRUST_PROXY`) and an LRU engine cache. README "Deploying" section.

### Changed
- Result contract: Spanish text fields, instrument references, scan availability, yearly series,
  cross-check, place profile and published findings (`contract/*.schema.json`; old clients
  cannot read new results, hence the major version).
- Duplicate MERRA-2 cards, MODIS AOD and MOPITT CO are unlisted until their data can be served.
- Gates: series that are mostly zero months, values near a physical bound, and all-fill series are
  reported instead of tested.
- CI and the release script never call Giovanni (offline mode).

## [0.1.0] - 2026-11-14

First release of the Earth System Trend Detective (NASA Space Apps 2026).

### Added
- Analysis engine: seasonal cycle removed, Sen's slope with a persistence-corrected 95% range
  (Gilbert 1987, Hamed–Rao variance), two decisive tests (Mann–Kendall Hamed–Rao, OLS with
  effective sample size), years to detection (Weatherhead 1998), robustness checks
  (leave one year out, satellite drift years, cross-check source), mechanical verdict labels.
- Stage-1 variable selection before any trend: question fit, cited expectation, fitness,
  known breaks and minimum detectable trend; stage-2 scan over one shared window with
  Benjamini–Hochberg.
- Data: Giovanni CSV exports (pre-loaded regions) and NASA POWER live data for any place
  (point or box up to 10°×10°), behind one `SeriesSource` interface, with an offline cache.
- Web app (React + Vite): Simple view for primary-school children (answer first, three-step
  "how sure" meter, whole-number then-vs-now, one dot per year) and a full Scientific view;
  dictionary of terms; "choose any place" on the map; guided demos.
- FastAPI service, precompute job for static results, Docker image for the API.
- `npm run dev` (whole app, one command) and `npm run lan` (share on the local network).
