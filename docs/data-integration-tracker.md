# Data integration tracker

Living checklist for v2: live NASA data and selecting variables for any place. Update the status
column when something changes, and add a line to the log at the bottom.

Status keys: ✅ verified working · 🟡 partly working or untested · ⬜ not started · ⛔ not usable / parked

## 1. Words we use

| Word | Meaning | Example |
|---|---|---|
| Mission / platform | The satellite (or model) | Aqua, Terra, Aura, GPM, MERRA-2 |
| Instrument | The sensor on the satellite | AIRS (on Aqua), MODIS (on Terra and Aqua), OMI (on Aura), IMERG (GPM's merged product) |
| Model | A computer model that mixes many observations into complete maps | MERRA-2 (atmosphere), GLDAS (land and soil water) |
| Product / collection | One dataset from an instrument or model at one time step and grid | `AIRS3STM` = AIRS Level-3 standard monthly, 1° grid |
| **Variable** | **One measured quantity inside a product. This is what we trend** | `SurfAirTemp_A` = surface air temperature, daytime pass |
| Giovanni ID | product + version + variable | `AIRS3STM_7_0_SurfAirTemp_A` |
| Catalog card | Our entry for one variable (`catalog/variables.yaml`): kid name, definition, units, known problems, themes | `airs_t_surf_day` |

MODIS, AIRS, GPM, OMI are instruments. MERRA-2 and GLDAS are models. Each holds many variables.
The Giovanni cloud service alone exposes 867 variable IDs across 34 products.

## 2. Resources and where they are used

Pipeline steps: **Catalog** (which candidates exist) → **Availability** (does this place have
data) → **Context** (what kind of place it is) → **Expectation** (cited reason to expect change)
→ **Fetch** (monthly series) → engine (existing).

| # | Resource | Access | Auth | Step | Serves | Status | Notes / next step |
|---|---|---|---|---|---|---|---|
| 1 | Giovanni cloud time series `api.giovanni.earthdata.nasa.gov/timeseries` | REST, CSV, **one point per call** | Earthdata token (`backend/.env`) | Fetch, Availability | R1 R2 R3 | ✅ | ~3 s per call for 20 to 45 years. Response header gives the snapped grid cell, units, fill value and mean. Ocean points return the fill value |
| 2 | Giovanni list of configured variables `api.giovanni.earthdata.nasa.gov/configured-variables/` | Public JSON | none | Catalog | R1 | ✅ | 867 IDs. Use as a check: a catalog card is "live" only if its ID is in this list |
| 3 | Giovanni quota `api.giovanni.earthdata.nasa.gov/quota` | REST | token | Fetch | R6 | ✅ | Monthly fraction used; 6 calls ≈ 2e-9. Check before precompute runs |
| 4 | Giovanni area average via Harmony (box mean) | Async job, CSV | token | Fetch (pre-loaded boxes) | R2 R3 | ⬜ | Needed for fine grids (GPM 0.1°, GLDAS 0.25°) over boxes. Time-box a 30 min test; fall back to #5 |
| 5 | Giovanni web UI (manual CSV export) | Browser | Earthdata login | Fetch (offline pre-loaded data) | R2 R3 | 🟡 | Only `cajamarca_west` AIRS humidity exists in `data/raw/`. The **only** path for MODIS AOD, MOPITT CO and MERRA-2 monthly aerosols (not in #2) |
| 6 | NASA POWER `power.larc.nasa.gov` | REST, JSON | none | Fetch, Context | R2 R3 | ✅ | Live in the app (T2M, PRECTOTCORR, RH2M). Response includes **model-grid elevation** (Cajamarca: 1 566 m vs ~2 700 m real), so don't show it as a precise number |
| 7 | IPCC AR6 WGI reference regions (GeoJSON, `IPCC-WG1/Atlas` repo) | One file, offline | none | Context | R1 | ⬜ | Point-in-polygon lookup: which of the 46 land regions the place is in |
| 8 | IPCC AR6 WGI regional assessments (Ch. 11 tables, Atlas, Ch. 12) | Read and transcribe by hand | none | Expectation, "what scientists found" | R1 R4 | ⬜ | No API. Each entry needs a person who opened the table and wrote down page/table + confidence |
| 9 | Köppen–Geiger rules (Beck et al. 2018, *Scientific Data*) | Formula from monthly T and P | none | Context | R1 R5 | ⬜ | Main climate group (tropical / dry / temperate / cold / polar) from POWER climatology. A person must check the thresholds against the paper |
| 10 | Published papers already in the catalog (Vuille & Bradley 2000) | n/a | none | Expectation | R1 | ✅ | Pre-loaded regions only |
| 11 | CMR search (`cmr.earthdata.nasa.gov`) | Public REST | none | Catalog | R1 | ⛔ not needed | Gives collection coverage (almost all global), not "has data here". #2 + the probe answer availability better |
| 12 | Hydrology Data Rods (GES DISC) | REST, point | Earthdata | Fetch | — | ⛔ not needed | GLDAS already comes through #1 |
| 13 | AppEEARS | Async REST | Earthdata | — | — | ⛔ parked | Land products (NDVI, land cover). Parking lot |
| 14 | NOAA Climate Data Online | REST | NOAA token | — | — | ⛔ parked | Station overlay is in the parking lot |
| 15 | KNMI Climate Explorer | Web only | none | Manual cross-check | R4 | ⛔ | No usable API |
| 16 | CSA: RADARSAT, Geo.ca, SWOT, SAR tutorial | various | various | — | — | ⛔ | Not long monthly records (SWOT starts 2022) |
| 17 | SeaWiFS chlorophyll trend paper (NTRS 20090042747) | PDF | none | References slide | R6 | ⬜ | Methods reference for time series plus significance |

## 3. Catalog variables vs live sources

| Catalog id | Giovanni ID today | In cloud list (#2)? | Live test | Plan |
|---|---|---|---|---|
| airs_t_surf_day | AIRS3STM_7_0_SurfAirTemp_A | ✅ | ✅ 3.1 s, 232 months | Live |
| airs_t_surf_night | AIRS3STM_7_0_SurfAirTemp_D | ✅ | — | Live |
| airs_rh_surf_day | AIRS3STM_7_0_RelHumSurf_A | ✅ | — | Live |
| airs_rh_surf_night | AIRS3STM_7_0_RelHumSurf_D | ✅ | — | Live |
| gpm_precip | GPM_3IMERGM_07_precipitation | ✅ | ✅ 2.4 s, 304 months (mm/hr) | Live. Check unit scale on the card |
| gldas_soil_moist | GLDAS_NOAH025_M_2_1_SoilMoi0_10cm_inst | ✅ | ✅ 2.6 s. Ocean point → fill value | Live. Land only |
| gldas_evap | GLDAS_NOAH025_M_2_1_Evap_tavg | ✅ | — | Live. Land only |
| merra2_t2m | M2TMNXSLV_5_12_4_T2M | ❌ | ✅ via **M2IMNXASM_5_12_4_T2M** 2.7 s, 552 months | Switch ID (monthly mean of instantaneous fields). Note it on the card |
| merra2_precip | M2TMNXFLX_5_12_4_PRECTOTCORR | ❌ (hourly only) | — | Drop live. POWER PRECTOTCORR is already MERRA-2 based |
| modis_aqua_aod / modis_terra_aod | MYD08/MOD08_M3 | ❌ | — | Offline only (web export #5) or drop |
| merra2_aod / sulfate / oc | M2TMNXAER | ❌ (hourly only) | — | Offline only or drop |
| mopitt_co | MOP03JM | ❌ | — | Offline only or drop |
| power_t2m / power_precip / power_rh2m | POWER | n/a | ✅ in app | Live |
| *new* omi_aod (candidate) | OMAERUVd_003_FinalAerosolOpticalDepth500 | ✅ daily | — | Air theme live. Monthly mean declared on the card. Row anomaly needs a cited note |
| *new* omi_no2 (candidate) | OMNO2d_003_ColumnAmountNO2TropCloudScreened | ✅ daily | ✅ 3.4 s, 7 280 days | Air theme live (city air). Same row-anomaly note |
| *new* gldas_swe (candidate) | GLDAS_NOAH025_M_2_1_SWE_inst | ✅ | — | Only where it freezes (context rule) |

## 4. Instruments we show (source tag on every card + "Where our data comes from" page)

| Source | Kind | On | Since | What it gives us | How it measures (kid line) | Live? |
|---|---|---|---|---|---|---|
| AIRS | Satellite instrument | Aqua | 2002 | Air temperature and humidity near the ground, day and night | "Reads the heat glow of the air from space, twice a day" | ✅ Giovanni |
| GPM IMERG | Satellite rainfall product (many satellites + rain gauges) | GPM Core + partners | 2000 | Rainfall | "Many satellites watch clouds and rain, checked against rain gauges" | ✅ Giovanni |
| OMI | Satellite instrument | Aura | 2004 | Haze (aerosol), NO₂ gas | "Looks at sunlight bouncing off the air to see haze and gases" | ✅ Giovanni (daily) |
| MERRA-2 | Computer model fed with observations (reanalysis) | — | 1981 (POWER) | Temperature, rainfall, humidity | "A computer rebuilds past weather from millions of measurements" | ✅ via NASA POWER |
| GLDAS | Land computer model | — | 2000 | Soil water, evaporation, snow | "A computer works out how wet the ground is" | ✅ Giovanni |
| MODIS | Satellite instrument | Terra, Aqua | 2000 / 2002 | Haze (aerosol) | — | ⛔ not in Giovanni cloud |
| MOPITT | Satellite instrument | Terra | 2000 | Carbon monoxide | — | ⛔ not in Giovanni cloud |

NASA POWER is a **delivery service**, not an instrument. Its tag reads "MERRA-2 computer model, via NASA POWER".

## 5. How each kind of dataset is treated (declared on the card before any result)

Shared core (exists): de-seasonalise with the monthly climatology → Sen's slope + Mann–Kendall
(Hamed–Rao) + OLS with n_eff, both must agree at α = 0.05 → persistence-corrected 95% range →
Benjamini–Hochberg across the scan → leave-one-year-out → years to detection.

| Data property | Variables | Risk if ignored | Treatment (new = ⬜) |
|---|---|---|---|
| Monthly native | AIRS, GPM, GLDAS, POWER | — | Use as is |
| Daily native | OMI AOD, OMI NO₂ | Months with few cloud-free days are noisy and biased | ⬜ Monthly mean of valid days; month counts only with ≥ `min_valid_days` (declared, e.g. 10). Completeness gate runs on months |
| Skewed, positive, spiky (fires, dust, storms) | OMI AOD, NO₂, rainfall | Outliers drive the OLS slope | Rank tests (MK, Sen) are robust; both-must-agree keeps it conservative. No log transform (keeps plain units). State it in Method details |
| Many zero months | Rainfall in dry places | Ties make MK and Sen degenerate (slope 0) | ⬜ Gate: if more than a declared share of months are zero, "It hardly ever rains here, so monthly numbers can't show a trend" |
| Bounded 0–100 | Humidity | Trend near a bound flattens | ⬜ Caution chip if the mean is within 5 points of 0 or 100 |
| Land only | GLDAS | Ocean cells are fill values | Probe drops it ("no data here"). Boxes: average valid cells only; need ≥ 50% valid |
| Grid cells of different sizes | GPM 0.1°, GLDAS 0.25°, MERRA-2 0.5°, AIRS 1° | A "point" means a different area per instrument | ⬜ Show the cell size in Scientific view; contrasts mention the footprint difference |
| Box over several cells | All Giovanni | Unweighted means over-count high latitudes | ⬜ cos(latitude)-weighted mean of cell centres; record cells used; check snapped cells sit inside the region (data rule) |
| Satellite pass-time drift | AIRS surface (and clouds) | Fake trend after 2021 | Cut 2022+ (exists) |
| Sensor degradation | OMI row anomaly (from 2007) | Fewer valid pixels | ⬜ Flag chip **only once a source is cited**; coverage handled by min_valid_days |
| Model input changes | MERRA-2, GLDAS-2.1 | Small artificial shifts | General "computer model estimate" label (exists). Specific break dates only with a citation |
| Different record lengths | All | Long records look more "sure" | Shared window in the scan (exists); contrasts use the overlap only |
| Units | GPM mm/hr, OMI molecules/cm², K | Wrong numbers | Card scale/offset (slope uses scale only, exists). GPM ×24 → mm/day. Kid wording uses fractions for NO₂/AOD ("about a quarter less"), never percentages |

## 6. Comparing instruments (the "second opinion")

Compare **only the same quantity** from different instruments, over their overlapping years, in the same
place. Different quantities (rain vs soil water) are the parked "coupling" check.

| Quantity | Pair | Note |
|---|---|---|
| Temperature | POWER (MERRA-2) ↔ AIRS day / night | AIRS is a 1:30 pm/am snapshot, POWER a daily mean: compare **direction**, not size |
| Rainfall | POWER (MERRA-2) ↔ GPM IMERG | Same quantity, different footprint |
| Humidity | POWER RH2M ↔ AIRS RH day / night | Snapshot vs daily mean, as above |
| Haze | OMI AOD ↔ (MODIS, offline only if a CSV exists) | — |

Outcome words: **"Two instruments agree"** (same direction, both sure) · "Same direction, one not sure yet" ·
"They disagree" (opposite, both sure) · "Only one instrument here". Never merge the two into one number.
`power_t2m` and `merra2_t2m` are the same model, so they never count as a pair.

## 7. Contradictions resolved (project rules win over the design brief)

| # | Conflict | Decision |
|---|---|---|
| 1 | Brief targets 16–20 year olds and puts "+0.32 °C / decade" in the headline | R5 wins: child audience; headline = answer + then-vs-now whole numbers; slope and range in Scientific view |
| 2 | Brief: "don't change engine or data" | Superseded: v2 changes data and adds per-type treatments. Verdict categories stay |
| 3 | Cajamarca demo runs on `cajamarca_west` (mixes coast desert and mountains; region rule 1 says one climate) | Demo moves to `cajamarca_highlands` once live AIRS data is precomputed; `cajamarca_west` leaves the UI |
| 4 | Wisconsin demo lands on Air with no data | Precompute OMI for Wisconsin; demo ends on a variable with a real result |
| 5 | "Sure it's real" next to "Not a good fit here" | One "Can we trust this?" panel: Data quality / Long enough record / Second opinion / Matches published science. When the record is short but the result is still sure: "This record is short for a typical change, but the change here is bigger than typical" |
| 6 | "less than 1 … less than 1. That's not enough years" | Kid amounts must not hide the comparison: compare in tenths internally, say "smaller than we can spot yet" |
| 7 | Water list shows temperature ("driver" role) | Drivers belong to the parked process check: remove from Water |
| 8 | Rainy-season chart shows the all-months yearly dots | Bug (R3): chart must plot `season_series` when a season is chosen |
| 9 | Brief: compare places / trend map | Parked (trend map is in the parking lot). Ask the user before building |
| 10 | Brief: more preset biomes (desert, rainforest, city) | Parked ("new regions"). Cheap option once live data works: 3 example **points**, no pre-loading. Needs the user's OK |
| 11 | Brief: search a place by name | Geocoding would be a new external service. Default: offline list of world cities shipped with the app |
| 12 | Model value narrated as "what the satellite measured" | Narration and labels come from the instrument table (section 4) |

## 8. v2 checklist

Feature freeze: **16:00 Peru, Sun Nov 15**. After that, only R5 fixes, deploy and submission.

### Track 1: data and engine (backend)
| ID | Task | Serves | Status |
|---|---|---|---|
| A1 | `sources/giovanni_api.py`: point fetch, header check, fill → NaN, disk cache, offline mode, token from env, timeout → fallback | R2 R3 | ✅ |
| A2 | Boxes: cos(lat)-weighted mean of cell centres, valid-cell share; Harmony test for fine grids (30 min max), else cap cells | R2 R3 | ✅ (cell averaging; Harmony not needed) |
| A3 | Catalog: drop `merra2_t2m`/`merra2_precip` as candidates; hide offline-only cards with no CSV; add `omi_aod`, `omi_no2`; remove drivers from Water; card fields `cadence`, `min_valid_days`, `domain`, `instrument_id` | R1 | ✅ |
| A4 | Treatments from section 5 marked ⬜ (daily → monthly, zero-rain gate, bounded chip) with tests | R3 R4 | ✅ |
| A5 | Instrument contrast (section 6) into `robustness.cross_check` | R4 | ✅ |
| A6 | Precompute both pre-loaded regions into the cache and commit (offline demo) | R2 R3 R6 | 🟡 cache warm running (Wisconsin GPM last) |
| B1 | Availability probe for a picked place, with kid reasons | R1 R2 | ✅ |

### Track 2: interface (frontend)
| ID | Task | Serves | Status |
|---|---|---|---|
| U1 | Remove internal labels; "Can we trust this?" panel (#5, #6); renames | R1 R5 | ✅ |
| U2 | Verdict gauge with one marker; one icon set, no emoji | R5 | ✅ |
| U3 | Charts: y-axis with units, visible band, "left out" annotation; season chart bug (#8) | R3 | ✅ |
| U4 | Findings: results first, verdict chip + sparkline, "Not available here (N)" collapsed row, summary line | R1 | ✅ |
| U5 | Source tag with instrument on every card; "Where our data comes from" page from `catalog/instruments.yaml` | R1 R6 | ✅ |
| U6 | Start: question inline after place, area size shown, "use my location", offline city search | R2 | ✅ |
| U7 | Loading / empty / error states for live fetches | R2 | ✅ |
| U8 | Demo: narration matches screen, spotlight, ends on a real result (#3, #4) | R5 | ⬜ after A6 stage 1 |
| U9 | Visual refresh (contrast AA, fewer borders, self-hosted fonts); 390 px check | R5 | ✅ |
| L0 | Every UI string through `web/src/i18n` (`t()`, `tx()` for backend Text) in U1–U7 | R5 | ✅ |
| L1 | Spanish for backend text: optional `simple_es` / `scientific_es` on `Text`; Spanish in catalog YAML (names, definitions, glossary, themes, instruments, regions) and engine sentence templates (verdict, selection, gates, contrast, place) | R5 | 🟡 last strings (contrast, availability, custom place) |
| W1 | "Where else?" strip: same variable across the 5 ready-made places (user approved) | R4 R5 | ✅ UI; data from A6 |
| LB | Variable vs instrument labels on cards, result header, sources page, legend, glossary | R1 R5 | ✅ |
| L2 | Spanish UI: fill `web/src/i18n/es.ts`, EN/ES toggle in the header (English default, remembered per browser), Spanish dates/numbers, R5 kid rules applied in Spanish | R5 | ✅ |

### Track 3: people (sources, no code)
| ID | Task | Serves | Status |
|---|---|---|---|
| H1 | Check AR6 regional statements for the demo questions; record table/page + confidence | R1 R4 | 🟡 sources-research running |
| H2 | Check Köppen thresholds (Beck et al. 2018) | R1 | ✅ (place-profile agent, Beck 2018 Table 2) |
| H3 | Find citations: OMI row anomaly; GLDAS-2.1 forcing change | R3 | 🟡 sources-research running |

### After Track 1
| ID | Task | Serves | Status |
|---|---|---|---|
| C1 | Place profile: AR6 region, climate group, "high up" | R1 R5 | ✅ wired into scans |
| C2 | `catalog/expectations.yaml` from H1/H2 | R1 | 🟡 waiting on H1 |
| C3 | "What scientists found here" line (agrees / differs / too soon) | R4 R5 | ⬜ |
| C4 | Declared seasons for picked places from climatology | R3 | 🟡 wet/dry months computed, not yet used as seasons |
| D1 | R5 read-aloud pass on every Simple screen | R5 | ⬜ |
| E1 | Deploy (needs the user's OK + hosting choice); token as server secret | R6 | ⬜ needs user OK + hosting |
| E2 | Video or ≤ 7 slides, references, AI disclosure, logged-out check | R6 | ⬜ |

## 9. Log

| When (Peru) | What | Result |
|---|---|---|
| Nov 15 00:08 | Giovanni quota + AIRS point (Cajamarca −6.5, −78.5) | ✅ HTTP 200, 3.1 s, 232 months, snapped cell in header |
| Nov 15 00:09 | GPM, GLDAS (land + ocean), OMI NO2 (Lima), MERRA-2 M2IMNXASM T2M | ✅ all 2.4 to 3.4 s. GLDAS over ocean returns fill value (works as an availability signal) |
| Nov 15 01:20 | NASA POWER parameter catalog | ✅ POWER serves MERRA-2 aerosol optical depth monthly (`AOD_55`) and GPM IMERG rainfall (`IMERG_PRECTOT`) |
| Nov 15 01:40 | Giovanni hourly MERRA-2 aerosol (`M2T1NXAER_5_12_4_SO4SMASS`) at a point | ✅ 1 year in 3.6 s, 10 years (87 664 rows) in 5.4 s → sulfate and organic carbon can be live (hourly → monthly) |
| Nov 15 01:45 | MODIS aerosol, MOPITT CO | ⛔ no live route (not in Giovanni cloud list, not in POWER) → manual export, see `docs/offline-downloads.md` |
| Nov 15 01:15 | v2 base commit `eaf5da3` (contract, instruments catalog); 9 agents launched in parallel worktrees | 🟡 running |
| Nov 15 00:10 | Audit of `web/public/data/results` | ⚠️ All 15 Giovanni-based results for Cajamarca highlands and Wisconsin are "No series loaded". `data/raw/` holds only 2 CSVs (cajamarca_west humidity). Only the 3 POWER variables work today |
