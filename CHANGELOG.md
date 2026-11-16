# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Each release is a git tag `vX.Y.Z`; see RELEASING.md
for how to release and how to roll back.

## [Unreleased]

### Changed
- Header: shorter name "Trend Detective" / "Detective de tendencias" with a statistics logo (bars and a rising
  trend line). Simple/Scientific, EN/ES and dark mode are on/off switches whose knob shows an icon (smiley /
  flask, globe, sun / moon); language and dark mode sit in a settings menu (hamburger) at the top right. The
  header uses fixed sizes and each label keeps the width of its longer language, so switching language no longer
  moves or resizes it (one row above 980px, two rows below, chosen by width only).
- Start page title "Earth trends, measured and tested" / "Tendencias de la Tierra, medidas y comprobadas", with a
  Simple and a Scientific description. Switching language cross-fades the page softly (view transitions; instant
  with reduced motion or in browsers without support).
- Start page: the "Free · Every number comes from NASA" pill is gone; the hero title uses Space Grotesk; a quiet
  dotted Earth turns slowly behind the hero (one turn every 90 s) (canvas, land points baked from Natural Earth 1:110m by
  `web/scripts/make-globe-dots.mjs`; still for reduced motion, paused off-screen).
- Footer organised into columns (name and tagline, Explore, NASA data with links to Giovanni and POWER, Credits
  with the OpenStreetMap copyright link) and a bottom line with the challenge and, in the Scientific view, the
  version. One logo component for header and footer.
- Ready-made places: 3 x 2 grid (2 columns on tablets, 1 on phones); the category is a coloured badge next to the
  icon; long captions are clamped to four lines (full text kept in the page and on hover); each card ends with
  where the data comes from (saved / live NASA POWER) and an arrow.
- Shortlist cards show each variable's reason ("Why look at this" / "Rationale"): a cited statement or what the
  record can detect (R1).
- "Watch a demo" buttons in the start-page hero, always visible (replace the chips that only showed on two tabs).
- More space in the start-page hero between the title, the demo buttons and the place form (scales with width).
- Place tabs: Search, On the map, Coordinates, then Ready-made places (last).
- Question cards (step 2): title on one row with the icon, smaller fonts, chips and padding (chips keep 44px tap
  height); chips sit right under the question.
- Findings page: Climate and Area (and height / rainy months when known) are icon chips under the place title,
  model-based ones say "computer model estimate" in their tooltip; the "All but the area…" note is gone. Smaller
  summary with each count beside its label. "How we worked this out" stages are no longer links: each opens a
  floating list of its steps (one at a time, closes on outside click or Escape). The instruments strip is a
  highlighted card with icon + satellite/computer model chips.
- Measurement cards: smaller verdict chip with an arrow-only direction badge beside it (green up, red down; the
  words stay for screen readers and in the tooltip), calmer spacing, a larger chart with a "years used / left out"
  key (replaces "Years used here"), full definitions, and a clean "Worked out by / Measured by" row with an icon.
- Pre-loaded regions read their saved results first (scan, default and declared-season results); the API is asked
  only for missing files or other periods. Identical in-flight requests are shared, so a scan is fetched once.
- A user-chosen point or box no longer says "NASA POWER grid cell": each variable uses its own source's grid.

### Added
- "You found a real change!" panel on "Sure it's real" results, a detective notebook of saved finds (kept in
  the browser only), and "Copy report" / "Download JSON" to share a find.
- AI-use disclosure and "not endorsed by NASA" line on the Sources page; README submission section.

### Fixed
- Map hint colours follow the pin, the box and the view (up to four 10° windows), are easier to see, and say
  honestly when they cover only part of the map or need internet.

## [2.1.0] - 2026-11-15

### Changed
- New look (v3 design): warm light theme by default; the dark theme keeps the deep-space navy palette (follows the system, or the
  switch now in the top bar); Bricolage Grotesque headings, Inter text, JetBrains Mono for years. Header with
  page links and segmented Simple/Scientific and EN/ES switches.
- Start page is one card: a three-step progress bar, then tabs to pick a place (Search, Ready-made places, On
  the map, Coordinates), then the questions in the same card.
- Results page: labelled "Change what you see" form, summary with a count per "how sure" level, cleaner
  finding cards, "Years of data" shown open, and a "How we worked this out" strip with the four stages linking
  into "How it works" (also on the variable page).
- Data sources page grouped into satellite instruments, computer models and "Not used yet".

### Added
- "How it works" reads as one process: a bar with the four stages on top (sticks under the top bar on wide
  screens, marks the stage you are reading, click to jump there; two rows of boxes on phones), then one line down
  the page with a numbered stop for each of the 16 steps, a milestone where each stage starts, and "You get your
  answer." at the end.
- Finer questions: seven sub-topics under the three main ones (heat: hot afternoons, warm nights; water: rain,
  damp air, wet ground; air: smoke and haze, burning fuel). A sub-topic is a theme with a `parent`; its members
  are declared on the variable cards before any result and must also belong to the parent. Each is scanned on
  its own shared window with Benjamini–Hochberg inside it, so a variable's label can differ from the same
  variable's label in the parent question. The start page and the question picker show the sub-topics as
  buttons beside each main card, the question menu on the shortlist groups them, and the shortlist header
  shows "Water › Rain". The "helps answer the … question" check now uses the theme's own kid name (EN and ES).
- "Your years" box on the result page: typed-in years are labelled as the user's choice and the declared
  window's answer is shown beside it, so a period picked after looking cannot pass as the main finding.
- "What if we start in another year?" panel on the result page: the same trend tests re-run for start years
  from the first full year to the last one that still leaves 15 years (window end fixed). Context only: the
  headline stays on the declared window. New `start_years` field on the result (not for declared seasons or
  when no trend is computed). Cites Liebmann et al. (2010), doi:10.1175/2010BAMS3030.1.
- "Do the parts of your box agree?": for a box, the result page counts how many grid cells go the same way
  as the box average, and how many go the opposite way with a sure trend of their own (Benjamini–Hochberg
  FDR across the cells; Wilks 2016). It tests whether the box mixes opposite changes that cancel out. Counts
  only, no map; shown in "Tell me more", skipped in the scan, and never changes the verdict.
- New pre-loaded region `cajamarca_high_only` ("Cajamarca, high mountains only"): a highland-only twin of `cajamarca_highlands` (79.0-77.3°W, 7.3-6.3°S) where every NASA POWER (MERRA-2) cell is at model elevation 2348-2771 m, for a before/after comparison with the mixed lowland and highland box. Raw NASA data is cached under `data/cache/` so it works offline; AIRS variables report the 4-cell gate there.
- "How it works" page (`#/how`): the whole data pipeline as a step-by-step flow, in both views and
  both languages.
- "The change is bigger in some months than in others": an info chip (context only, never changes the
  verdict) from a Welch test on the 12 per-month slopes, naming the months with the smallest and largest
  change. It compares trend sizes, so months with more noise do not make equal changes look unequal.
- "Is this one kind of place?" check on the shortlist page (R1/R2/R5): before any trend, the box's NASA POWER
  climatology (one value per 0.5 x 0.625 degree cell) is checked for mixing. Four project-heuristic rules (more
  than one Koppen main group with 20% or more of the cells; model elevation range over 1000 m; wettest cell more
  than 2x the driest and over 0.5 mm/day apart; an annual T2M range over 5 C is listed as a supporting reason but never
  makes a box mixed on its own, because box means use each cell's departure from its own seasonal cycle). A mixed box says so, in kid words,
  and offers up to three smaller parts that are each one kind of place. Long-term means only, never a trend.
- "Where does it happen?" map layers on the place chooser: shade the map by the long-term average of
  temperature, rain or haze (NASA POWER climatology, `GET /climatology/grid`) so a spot can be picked
  inside one colour instead of a box that mixes very different places. Precomputed windows around the
  ready-made places keep it working offline.

### Fixed
- Simple view: every sentence the engine writes into a result is now at most 14 words, in English and Spanish
  (was about 155 EN and 260 ES over); variable definitions, glossary entries and UI copy were shortened too.
  The headline answer stays one sentence (place last; a second "We looked in …" sentence only when it can't fit),
  amounts read "In 10 years it may change less than …", humidity amounts add "The scale goes from 0 to 100.",
  several known breaks in one window are one line ("How this was measured changed in 2001, 2008 and 2012."),
  and the highland-only twin is "Cajamarca, high mountains only". Shorter kid labels (humidity, soil water,
  NO₂, carbon in Spanish) and a new glossary entry for "scale". A one-off step (model input change) in the
  window's first month no longer counts; a lasting break (frozen emissions, row anomaly, drift) counts whenever
  the window reaches it, so a window starting after MERRA-2's freeze is never "Sure" either. New test builds every variable × region × season verdict and checks sentence length.
- MERRA-2 sulfate and carbon particles now carry a known break ("frozen_emissions"): MERRA-2 persists its
  anthropogenic emissions after 2008 (SO₂) / 2006 (SO₄, OC, BC), drops volcanic eruptions after 2010 and switches
  fire inventories in 2010 (Randles et al. 2017, Table 1). A window across the date gets a warning chip, so a
  "Sure it's real" there becomes "Maybe, not sure yet" (user decision).
  The same now applies to model input changes (GLDAS forcing 2001/2008/2012/2025, IMERG TRMM-to-GPM 2014) and
  the OMI row anomaly (2007) and MODIS orbit drift (Terra 2020, Aqua 2022; the full record is still kept). The Delhi demo's sulfate steps now explain the "Maybe" instead of showing opposite sure trends.
- "Since 2002 it went up by about 1 degree" for a 0.3-degree change: any change under 1 unit now reads "less than
  1", the same threshold as every other Simple amount. Spanish says "alrededor de 1 punto", never "unos 1 punto".
- NASA POWER haze (`power_aod`) grid is 1° (SYN1deg), not 0.5°; "Where else?" units carry the kid scale.
- Simple-view amounts on scaled units were off by the kid scale: "We can see changes under 1 point on the haze
  scale" was 0.031 AOD read as points, while the haze scale is AOD × 100 (about 3 points). Detectability,
  "Tell me more" ("about 1 point on the haze scale every 10 years", no decimals), the details list and the Simple
  charts now all use the kid scale and label (haze ×100, sulfate/carbon/NO₂ ×10). `UnitsInfo` carries
  `kid_scale`, `kid_label`, `kid_label_es`. Labels and slopes are unchanged.
- "We need to watch for about N more years" is now "If it keeps going like this, we'd know in about N more
  years": Weatherhead's n* assumes the observed slope and noise persist, so it is not a forecast.
- The second-instrument row no longer says "Only one instrument has data for this place" when the partner has
  data that failed our checks (e.g. OMI over the Andes, 22% complete); it says why, and calls it a "source"
  (the partner can be a model).
- "No known instrument or input changes" is now "Our list has no changes to how this was measured in these
  years": it reports what we checked, not that no change exists.
- Sulfate headline no longer says "pollution from factories and power plants": MERRA-2 sulfate also comes from
  volcanoes and the ocean. It now reads "sulfate particles in the air".
- The Simple chart caption says why grey rings were left out (the list's shared years, satellite drift, or
  the years you chose), and "Where else?" says each place uses all its years.
- Start-year panel: "We are sure in 0" is now "None of them is sure yet" (and "sure in N of them").
- Facts audit: every claim on screen checked against NASA data or an opened source. Haze (POWER AOD_55) is
  CERES SYN1deg, not MERRA-2; unsourced claims removed (Wisconsin wildfire smoke, sulfate from coal and oil,
  organic carbon "mostly fires"); "watch N more years" only while N is plausible; "rainiest months" instead of
  "most rain"; mixed boxes are not described as one place; IPCC agreement only when our years cover at least
  half of the statement's period; then-vs-now numbers fall back to the size of the change when rounding would
  distort it; Aqua drift dated per NASA (last manoeuvre Dec 2021).
- Box means no longer depend on which grid cells happen to report: each cell is fitted as the box
  series plus its own monthly offset, estimated over the months it shares with the box, so a cell that
  drops out can neither create a trend nor shrink a real one (exactly the cos(latitude)-weighted mean
  when every cell reports). Shared by the Giovanni API and NASA POWER sources. The saved AIRS boxes were
  rebuilt (only Wisconsin night humidity changed, by at most 0.09); the other saved boxes have no
  missing months or fail the completeness gate (OMI), and pick up the method when next fetched.
- NASA POWER box means are now cos(latitude)-weighted, like the Giovanni API source.
- NASA POWER units are checked against the catalog card. A unit mismatch from any source now shows as
  its own "units are not what we expected" result instead of "NASA is unreachable".

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
