# Offline downloads (Giovanni website)

Two instruments have **no live route** that the app can call. Their variables only exist as CSV exports from
the Giovanni website, which we store in `data/raw/<region>/` so the app works offline (data rule).

| Variable (catalog id) | Instrument / platform | Giovanni variable ID | Record starts |
|---|---|---|---|
| Aerosol optical depth at 550 nm (`modis_aqua_aod`) | MODIS on Aqua | `MYD08_M3_6_1_AOD_550_Dark_Target_Deep_Blue_Combined_Mean_Mean` | 2002-07 |
| Aerosol optical depth at 550 nm (`modis_terra_aod`) | MODIS on Terra | `MOD08_M3_6_1_AOD_550_Dark_Target_Deep_Blue_Combined_Mean_Mean` | 2000-03 |
| Total-column carbon monoxide, daytime (`mopitt_co`) | MOPITT on Terra | `MOP03JM_10_RetrievedCOTotalColumnDay` | 2000-03 |

Checked on Nov 15: none of these three IDs is in the Giovanni cloud list
(`https://api.giovanni.earthdata.nasa.gov/configured-variables/`), and NASA POWER does not serve them.
MERRA-2 aerosols **are** live (hourly product averaged to months, and `AOD_55` via NASA POWER), so they need no download.

## Regions (exact boxes, W, S, E, N)

| Region id | Box |
|---|---|
| `cajamarca_highlands` | −79.0, −8.0, −77.0, −5.0 |
| `wisconsin` | −92.9, 42.5, −86.8, 47.1 |

## Steps (one CSV per variable × region = 6 files)

The person must sign in to Earthdata themselves. An agent must never type the password.

1. Open https://giovanni.gsfc.nasa.gov/giovanni/ and sign in with Earthdata Login (top right).
2. Plot type: **Time Series → Area-Averaged**.
3. Dates: from the record start in the table above to the latest month offered (end of 2025 or later).
   Monthly products: pick the first day of the start month and the last day of the end month.
4. Region: type the box exactly as in the table into the bounding-box field (W, S, E, N).
5. Variables: search the Giovanni variable ID from the table and tick only that one.
6. Click **Plot Data**. When the plot is ready: **Downloads → CSV**.
7. Keep the original file name (it looks like
   `g4.areaAvgTimeSeries.MYD08_M3_6_1_AOD_550_Dark_Target_Deep_Blue_Combined_Mean_Mean.20020701-20251231.79W_8S_77W_5S.csv`)
   and save it to `data/raw/<region id>/` in the repo.
8. Open the CSV and check the header line with the data bounding box matches the region box (data rule in `CLAUDE.md`).
   If it doesn't, redo step 4.

## After the files are in place (developer)

1. In `catalog/variables.yaml` set `listed: true` on the cards that now have CSVs.
2. Recompute the pre-loaded results: `cd backend && uv run python scripts/precompute.py`.
3. The MODIS variable then pairs with OMI aerosol as a second opinion (same quantity, different instrument).
   MODIS Aqua and Terra are the same instrument type: they never count as a pair for each other.
