# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Each release is a git tag `vX.Y.Z`; see RELEASING.md
for how to release and how to roll back.

## [Unreleased]

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
