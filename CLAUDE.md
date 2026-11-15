# Earth System Trend Detective: project rules

NASA Space Apps 2026, challenge "Be An Earth System Trend Detective!". Deadline: **Sun Nov 15 2026, 11:59 p.m.
Peru time (UTC−5)**. These rules exist to keep every agent and teammate on the goals. Read them before any task.

## The goals (the only things we are judged on)

Every change must serve one of these. If it serves none, it is parked (see "Parking lot").

| # | Requirement | Done when (check it in the running app) |
|---|---|---|
| R1 | Identify variables worth investigating for a trend | A user picks a plain question (heat, water, air) and sees which variables can answer it in their region, each with a one-line definition and a reason ("expected to change because…", or why it can't answer here). No Giovanni IDs on screen in the Simple view |
| R2 | Acquire the data for a particular region | A user chooses a region and data for it appears. Pre-loaded regions are the fallback; a user-chosen place (NASA POWER point/box) closes the requirement |
| R3 | Time series + visualization, long enough for statistics | A chart of many years for the chosen variable and region, with the seasonal cycle removed and the trend line drawn |
| R4 | Rate of change + significance test | The result states what, where, how much (per 10 years, plain units, with a 95% range) and whether it is significant (Mann–Kendall and t-test, or confidence interval) |
| R5 | Understandable by a primary-school child (team requirement) | A 9-year-old can read the Simple view and say, in their own words, what is changing and how sure we are (rules below) |
| R6 | Submission is eligible | Public link that works logged out, 30-second video or at most 7 slides, everything in English, references listed, AI use disclosed, no NASA logos |

## Build order (do not skip ahead)

1. One region and one variable working end to end: data → engine → result → chart → verdict, in the browser.
2. All four objectives R1–R4 working for both pre-loaded regions (Cajamarca highlands, Wisconsin).
3. R5 pass on every screen the user sees in the Simple view.
4. R2 user-chosen place (NASA POWER live source).
5. Deploy and check the public link logged out (R6). Deploying needs the user's explicit OK.
6. Only then: anything from the parking lot, one item at a time, with the user's OK.

Before starting any task, state which requirement (R1–R6) it serves. If a task would take more than about an hour
and isn't in steps 1–5, stop and ask the user.

## Parking lot (do not build unless the user moves an item out)

AI variable suggestions · full process check (sign check, coupling, mirror region, evidence ladder) · trend map ·
significance simulator · NOAA station overlay · "predict, then test" · pressure levels · AppEEARS land variables ·
CSV upload · spatial neighbour-box check (the old `cajamarca_west` box shares 3 of the highlands' 6 cells and mixes
in coastal desert, so it proves nothing either way; only a non-overlapping box in the same climate would count) ·
new themes or regions beyond the two pre-loaded ones.

## Plain-language rules (R5): the Simple view

The Simple view is the default view, and it is written for a primary-school child (about 8–11 years old).
The Scientific view keeps the full numbers. Every claim on screen must exist in both views, and say the same thing.

- **Answer first, in one short sentence**: "Yes, afternoons in Cajamarca are getting more humid." Then "how sure
  are we", then "how much". Everything else sits behind "Tell me more".
- **Short words and sentences**: at most about 12 words per sentence, everyday words. Banned in the Simple view:
  p-value, significant, decade, anomaly, autocorrelation, percentage points, confidence interval, statistically,
  trend test names, raw units such as K, kg m⁻² s⁻¹ or %RH.
- **No decimals, no negative numbers, no percentages** in the headline area. Round to a whole number; prefer
  "then vs now" ("In 2003 a normal afternoon was this damp; in 2021 it was this damp") over a slope.
- **"How sure are we" as a picture**: a three-step meter with words: "Sure it's real" / "Maybe, not sure yet" /
  "Too soon to tell". Never colour alone; always icon + word.
- **Not significant is never "no change"**: say "Too soon to tell. We need to watch for about N more years."
- **Comparisons kids know**: one familiar comparison per result where it is honest (for example, "about as much
  warmer as moving from X to Y"). Never invent a comparison the numbers don't support.
- **Simple chart by default**: one dot per year (yearly average of the de-seasonalised values) plus one arrow or
  line. The monthly series and the 95% band belong in the Scientific view or "Tell me more".
- **Every term the child sees** has a dictionary entry (`catalog/glossary.yaml`) in kid words.
- **Check it**: read each Simple screen aloud. If a sentence needs an adult to explain it, rewrite it.

## Statistics rules (R3, R4): never break these

- Remove the seasonal cycle before testing. Report the slope per 10 years in student units (°C, mm/day, %).
- Significant only when both persistence-aware tests agree (Mann–Kendall Hamed–Rao and the OLS t-test with
  effective sample size) at α = 0.05. Seasonal Mann–Kendall is context only.
- The 95% range for Sen's slope uses the persistence-corrected variance; the chart band and the verdict range come
  from the same calculation.
- Seasons, derived series and windows are declared in the catalog before results are seen. Never pick the version
  that comes out significant.
- The scan compares variables over one shared window; the variable page may show the full record.
- Variable selection (R1) uses only things known before the trend is computed: the question, a cited reason to
  expect change, fitness (coverage, monthly, cells, no known break), and the minimum detectable trend from noise
  and persistence. The significance scan is a result, never a selection rule.
- Drift: cut 2022 onward only for variables sensitive to the satellite's pass time (AIRS surface humidity and
  temperature, clouds); other Aqua and Terra series keep the full record with a warning.
- Never write "caused by", "proves" or "no change".

## Data rules

- Every number on screen comes from NASA data (Giovanni exports, NASA POWER). Name the mission or model.
- Pre-loaded data must work with no network, so the demo never depends on a live NASA service.
- Check the "Data Bounding Box" or shape line in every Giovanni CSV header against the region before using it.
- Model outputs are labelled "computer model estimate" in the Simple view.

## Working rules

- Specs live in the team doc (MVP spec tab); these rules win if the two disagree, and the doc should then be fixed.
- Tests: run only the tests related to the change while developing; run the full suite once before reporting done.
- Do not push, deploy, or add a new external service the app depends on without the user's OK. Reading public
  web pages for research is fine.
- User decisions (Nov 14):
  - NASA POWER (power.larc.nasa.gov) is approved, for development and at app runtime.
  - Commits on a feature branch are approved (never on `main`, no push).
  - The hosting choice is deferred until the requirements are done.
- User decisions (Nov 15, v2):
  - Giovanni cloud API (api.giovanni.earthdata.nasa.gov) approved at app runtime with the user's Earthdata token
    (server-side only, `backend/.env`, never in the browser or the repo). NASA POWER stays the no-login fallback.
  - Open-Meteo geocoding approved for place search (browser, typed text only).
  - Moved out of the parking lot: three example points (Delhi, Amazon near Manaus, Sahara near Tamanrasset) and a
    "Where else?" strip (same variable's verdict across the ready-made places). Trend map stays parked.
  - Spanish as a second UI language (EN/ES toggle, English default; submission materials stay in English).
  - v2 work lives on `feat/v2-live-data`. Progress and resources: `docs/data-integration-tracker.md`.
- Never invent a citation. Every "expected to change because…" line needs a source someone opened and checked.
- When reporting status, list each requirement R1–R6 as done, partial or not started, with what the user should
  click to see it.
