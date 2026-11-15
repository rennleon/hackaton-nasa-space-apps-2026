# Sources checked (v2 research pass)

Opened and read on **2026-11-15** by the sources-research unit (an agent). Status of every line below: *agent-checked,
needs human confirmation before it goes on a slide*. Page numbers for IPCC AR6 are the printed report page numbers
(the Cambridge University Press volume), taken from the final chapter PDFs on ipcc.ch (no "Do Not Cite" drafts).
Direct quotes are kept under 15 words; everything else is paraphrase. Serves R1, R4, R6.

Contents: 1. AR6 reference regions - 2. Published findings (summary of `catalog/expectations.yaml`) -
3. Instrument caveats - 4. Instrument card check - 5. References - 6. Could not open / open issues.

## 1. AR6 reference region of each place

Method: point-in-polygon on `IPCC-WGI-reference-regions-v4.geojson` from github.com/IPCC-WG1/Atlas (the official file
behind Iturbide et al. 2020). For the Cajamarca and Wisconsin boxes all four corners and the centre were tested.

| Place | Point / box | AR6 region | Name |
|---|---|---|---|
| Cajamarca highlands | box W-79 S-8 E-77 N-5 | **NWS** | N.W.South-America (all corners and centre fall inside it) |
| Wisconsin | box in `catalog/regions.yaml` (-92.9, 42.5, -86.8, 47.1) | **CNA and ENA** | C.North-America (west of about 90 W) and E.North-America (east of about 90 W); the state straddles the boundary, roughly half and half |
| Delhi | 28.61, 77.21 | **SAS** | S.Asia |
| Central Amazon near Manaus | -3.10, -60.02 | **NSA** | N.South-America |
| Sahara near Tamanrasset | 22.79, 5.52 | **SAH** | Sahara |

Note for C1 (place profile): a user-picked point near 90 W in Wisconsin flips between CNA and ENA; AR6 assesses both
the same way for the variables we use, except meteorological drought (CNA: medium confidence in fewer droughts;
ENA: low confidence, inconsistent).

## 2. Published findings (what AR6 says, by place)

Full entries, with simple and scientific wording, table or section, page and URL, are in `catalog/expectations.yaml`
(39 entries: 12 `unclear`, 3 `either`, 18 `up`, 6 `down`). Summary of the observed-change assessments:

| Place (region) | Temperature | Rainfall | Soil water / drought | Haze / NO2 |
|---|---|---|---|---|
| Cajamarca (NWS) | Hot extremes likely up (Table 11.13, pp. 1667-1668). Andes warming, strongest inland and high up, high confidence (Atlas.7.2.2, p. 1995) | Mean: no uniform pattern in the northern Andes (Atlas p. 1995). Heavy rain: low confidence, insufficient data (Table 11.14, p. 1673) | Low confidence, mixed (Table 11.15, pp. 1676-1677) | no AR6 regional statement |
| Wisconsin (CNA, ENA) | Mean: very likely warming across North America (Ch. 12 p. 1828, Atlas p. 2004). **Hot extremes: weak and inconsistent trends, low confidence** (Table 11.19, pp. 1695-1696) | Mean: positive trends over parts of CNA and ENA, high confidence (Atlas p. 2004). Heavy rain: high confidence up (Table 11.20, p. 1699) | CNA: fewer meteorological droughts, medium confidence (Table 11.21, p. 1702); agricultural/ecological: low confidence, mixed (p. 1703). ENA: low confidence (p. 1703) | AOD down since 2000 over the USA, high confidence (Ch. 2 pp. 309-310). NO2 down over the USA since the mid-1990s, high confidence (Ch. 6 p. 839) |
| Delhi (SAS) | Hot extremes: high confidence up (Table 11.7, p. 1637). India warming about 0.6 degC per century 1901-2018 (Atlas p. 1979) | Mean: decrease over most of eastern and central north India, high confidence (Atlas p. 1979), not stated whether Delhi is inside. Heavy rain: high confidence up (Table 11.8, p. 1643) | Meteorological drought up, medium confidence (Table 11.9, p. 1653); agricultural/ecological low confidence; Indo-Gangetic Plain aridity fell 1979-2018 partly from irrigation (Ch. 12 p. 1800) | AOD up over South Asia since 2000, high confidence, OMI agrees (Ch. 2 pp. 309-310). NO2 up about 50% 2005-2015, medium confidence, parts of India reversed after 2011 (Ch. 6 p. 839; Krotkov et al. 2016, NASA OMI study) |
| Manaus (NSA) | Hot extremes likely up (Table 11.13, p. 1668). Amazonia warmer, about 0.6-0.7 degC over about 40 years, high confidence (Atlas p. 1995) | Mean: wet season wetter in northern and central Amazon since the 1980s, dry season drier in the south, not significant over longer periods (Ch. 8 p. 1082). Heavy rain: low confidence (Table 11.14, p. 1673) | Low confidence, mixed (Table 11.15, p. 1677) | no AR6 regional statement used |
| Tamanrasset (SAH) | Hot extremes likely up (Table 11.4, p. 1614). Africa-wide warming, all regions, high confidence (Atlas p. 1968) | Mean: too few data (Atlas p. 1968). Heavy rain: insufficient data, low confidence (Table 11.5, p. 1620) | Low confidence, limited evidence (Table 11.6, pp. 1624-1625) | no AR6 regional statement |
| Any land (humidity) | Relative humidity very likely down over much of global land since 2000; pattern by latitude, not assessed by AR6 region (Ch. 2 p. 330) | | | |

Period: Table 11.1 (p. 1532) frames the Chapter 11 observed trends as "since 1950"; the regional tables give no separate
period, so entries say so.

Answers to the lead's specific asks:
- **Aerosol and NO2 over South Asia**: yes, both found and opened. AR6 Ch. 2 Section 2.2.6 (pp. 309-310) says AOD kept rising over southern Asia
  and that OMI UV retrievals show similar trends (high confidence). AR6 Ch. 6 Section 6.3.3.1 (p. 839) says tropospheric NO2 rose by 50% over
  Southern Asia from 2005 (medium confidence) with a reversal since 2011 in many parts of India. The NASA-led OMI paper (Krotkov et al. 2016,
  abstract) gives more than 50% for NO2 over India, 2005-2015 (SO2 more than 100%).
- **Honest "we don't know"**: 12 entries have `direction: unclear` and the Simple text says it is too soon to tell.

## 3. Instrument caveats (H3)

Each caveat: Simple note (R5 wording) / Scientific note / where it is.

### a) OMI row anomaly (OMAERUV haze, OMNO2 NO2)

- **Simple**: "Since 2007, part of this satellite's view has been blocked. So some days have no data for your place."
- **Scientific**: A physical obstruction in the sensor view began to appear on **25 June 2007** (cross-track positions
  53 and 54, counting from 0) and spread to 37-42 from **11 May 2008**; by 2009 many rows were affected and the anomaly now affects
  about half of OMI's 60 viewing positions. Worldwide coverage that took one day now takes about two days. The expansion slowed
  after July 2011. Affected pixels are flagged and, in OMNO2 version 4.0, NO2 is not retrieved in them (fill values).
  Because OMI still samples a place about every other day, the authors expect no loss of statistical weight in averages,
  but they warn that retrievals using only part of the swath can behave differently if the algorithm assumes the full
  angle range; the aerosol record needed algorithm fixes (dust, cloud treatment) to stay consistent. For us: count
  valid days per month (`min_valid_days`), and expect fewer valid months for OMI than for monthly-native sets.
- **Sources (opened)**:
  1. Torres, O., Bhartia, P.K., Jethva, H., Ahn, C., 2018: Impact of the ozone monitoring instrument row anomaly on the
     long-term record of aerosol products. Atmos. Meas. Tech. 11, 2701-2715, https://doi.org/10.5194/amt-11-2701-2018.
     Location: abstract; Section 1 (Introduction), pp. 2701-2702; Section 2 "Row anomaly", pp. 2702-2703 (June 2007 start,
     50% of rows, July 2011 slowdown, every-other-day sampling argument). Full PDF read.
  2. OMI Algorithm Team, OMNO2 README, data product version 4.0, document version 9.0, Dec 2019,
     https://acdisc.gesdisc.eosdis.nasa.gov/data/Aura_OMI_Level3/OMNO2d.003/doc/README.OMNO2.pdf. Location: Section 2.1 (launch 15 July 2004,
     equator crossing 13:45, science data from 1 Oct 2004) and Section 2.4 "Row anomaly" (25 June 2007, 11 May 2008, fill values in v4.0).
     Caveat: the file served under the `OMNO2d.003` path describes **version 4.0**; Giovanni uses `OMNO2d_003` (version 003), whose
     row-anomaly handling may differ (flagged pixels rather than fill values). Not checked.

### b) GLDAS-2.1 monthly (Noah): forcing changes

- **Simple**: "This is a computer model. Its weather inputs changed over the years. Small jumps can show up in the long record."
- **Scientific**: GLDAS-2.1 is forced by a mix of model analyses and observation-based data from 2000 to now (it is not a single
  homogeneous forcing like GLDAS-2.0, which stops in 2014). Forcing history: GDAS analysis plus disaggregated GPCP v1.3 daily precipitation
  from Jan 2000; **AGRMET radiation added from 1 Mar 2001**; AGRMET radiation was bias-corrected to SRB with scale factors from the
  2002-2007 overlap and for 2008 onward. The README states that this scaling **cannot correct an apparent shift of unknown origin in the AGRMET
  climatology after 2011**. The AGRMET cloud input (WWMCA) ended and radiation switched to **GALWEM on 9 June 2025**. The README also warns that
  combining GLDAS 2.0, 2.1 and 2.2 in one series can create discontinuities, and that forcing datasets can contain their own breaks.
  Implication: trends over 2000 to now from GLDAS-2.1 (soil moisture, evaporation) can carry small forcing-driven jumps around
  2001, 2011 and mid-2025; do not splice with GLDAS-2.0.
- **Source (opened)**: Rui, H. and Beaudoing, H., README for NASA GLDAS Version 2 Data Products, GES DISC, last revised 13 Aug 2025,
  https://hydro1.gesdisc.eosdis.nasa.gov/data/GLDAS/GLDAS_NOAH025_M.2.1/doc/README_GLDAS2.pdf. Location: Section 1.2.3 "GLDAS-2.1"
  (pp. 8-9), Section 1.5.3 "What are the differences between GLDAS-1 and GLDAS-2.1?" (pp. 14-15, the post-2011 shift), Section 1.6
  "Quality Issues" (p. 15).

### c) GPM IMERG V07 (rainfall)

- **Simple**: "This rain record joins two satellite eras. Small jumps are possible around 2014."
- **Scientific**: IMERG V07 merges the TRMM era (1998-2015) and the GPM era (2014 onward) in one record; it is a "High Resolution
  Precipitation Product", built to give the best estimate at each time using whatever inputs exist, **not** a climate data record. Its release notes
  say studies using it for trends or interannual variability should check the time series for artifacts from an evolving satellite constellation.
  Documented jumps: the CORRA and GPROF inputs jump at the TRMM orbit boost (Aug 2001), at the TRMM-to-GPM shift (**June 2014**) and
  at the GPM orbit boost (Nov 2023); CORRA tropical values fell about 6% over ocean and 4% over land across the 2001 boost, and the team had not fixed it in V07 (the Final Run gauge
  adjustment mitigates it over land). Time series of means are described as consistent, but extremes and rain-detection frequency
  differ between TRMM and GPM calibration. Calibration outside 37 N-S is more approximate in the TRMM era. The record was extended back to Jan 1998
  on 7 Nov 2024; **Jan 1998 to May 2000 is lower quality** (GridSat-B1 IR instead of CPC IR): the team recommends avoiding it. The monthly Final Run is
  adjusted with the GPCC gauge analysis. Our Giovanni series should therefore start no earlier than June 2000 and the note should say "two eras".
- **Sources (opened)**:
  1. Huffman, G.J. et al., IMERG V07 Release Notes, 20 Nov 2024, https://gpm.nasa.gov/sites/default/files/2024-12/IMERG_V07_ReleaseNotes_241126.pdf.
     Location: "Changes from V06 to V07" (p. 3, extension to Jan 1998), "Known issues" (pp. 3-4, jumps in CORRA and GPROF, TRMM-era issues,
     "climate-scale consistency" bullet), Appendix 4 (p. 23, January 1998 to May 2000).
  2. NASA GPM, IMERG page, "Data FAQ", question "In what sense is the entire record for each Run processed consistently?"
     https://gpm.nasa.gov/data/imerg (constellation and overpass-time changes can cause slight variations in quality over time; less
     critical for means, more for extremes).
  3. Huffman, G.J. et al., IMERG V07 ATBD, 12 July 2023, https://gpm.nasa.gov/sites/default/files/2023-07/IMERG_V07_ATBD_final_230712.pdf.
     Location: Section 2.5 (gauges, GPCC), Section 3.4 (microwave intercalibration to CORRA), Section 3.6 (microwave-calibrated IR), Section 3.8
     (satellite-gauge combination), Table 2 (0.1 degree).

### d) MERRA-2 (the model behind NASA POWER temperature, rain and humidity)

- **Simple**: "This computer model uses more satellites as years pass. That can shift its numbers a little."
- **Scientific**: MERRA-2 runs one fixed model and analysis system, but the observations it assimilates change a lot through time, and
  the authors state that this can cause discontinuities in the gridded fields. Specific, documented items: AMSU-A radiances from NOAA-15 and -16
  in the late 1990s and the loss of SSM/I radiances in the late 2000s (MERRA-2 is less sensitive than MERRA, but not immune); marked
  changes in humidity analysis increments after the first SSM/I in mid-1987 and AMSU-B in 1998; EOS Aura MLS and OMI ozone, GPS radio
  occultation and ATMS, IASI, CrIS added from 2004 on. Land precipitation is steered toward gauge-based products, which have their own
  discontinuities (Myanmar and South America are named). Streams are spliced, with discontinuities across consecutive production streams,
  especially in high-latitude land variables. **Second-opinion caveat**: AIRS and AMSU-A radiances from Aqua are assimilated in MERRA-2 from
  1 Sep 2002, so MERRA-2 (POWER) and AIRS are not fully independent when we compare their temperature or humidity trends. No temperature-specific
  break date is given for 2 m temperature; no break dates are claimed here beyond those in the sources.
- **Sources (opened)**:
  1. Gelaro, R. et al., 2017: The Modern-Era Retrospective Analysis for Research and Applications, Version 2 (MERRA-2). J. Climate 30(14), 5419-5454,
     https://doi.org/10.1175/JCLI-D-16-0758.1 (read as the PMC author manuscript, https://pmc.ncbi.nlm.nih.gov/articles/PMC6999672/, which has no page
     numbers). Location: Abstract (reduced spurious trends and jumps vs MERRA, remaining deficiencies); Section 2 Table 1 (observing systems with dates);
     Section 2f (AMSU-A 1998 and water balance); Section 2g (corrected precipitation and gauge-product discontinuities); Section 2i (stream discontinuities);
     Section 3b (humidity increments, SSM/I 1987, AMSU-B 1998); Section 5a (precipitation sensitivity).
  2. McCarty, W. et al., 2016: MERRA-2 Input Observations: Summary and Assessment. NASA/TM-2016-104606 Vol. 46,
     https://ntrs.nasa.gov/citations/20160014544. Location: Abstract (p. i) and Section 1 (p. 1): the observing system changes over time and
     discontinuities in gridded fields or observation feedbacks can and will result.
  3. NASA POWER, Methodology (https://power.larc.nasa.gov/docs/methodology/) and "Meteorological source details"
     (https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/): POWER meteorology comes from MERRA-2 (starting 1981, about 0.5 x 0.625 degree
     grid); precipitation is the observation-corrected PRECTOTCORR; daily-rain validation is weak, monthly better.

### e) Extra caveat found: Aqua orbit drift (supports the 2022 cut already in CLAUDE.md)

- **Simple**: "This satellite now passes over a bit later each year."
- **Scientific**: NASA's Aqua mission page says Aqua is in free-drift and slowly moving to later local crossing times and lower altitude.
  The AIRS Level-3 guide gives the nominal crossing as 13:30 (ascending) and 01:30 (descending). Source: https://science.nasa.gov/mission/aqua/ (mission
  status text) and AIRS V7 Level 3 Product User Guide (Tian et al., JPL, April 2020), Section 1.5 "L3 Product Nodes". The page text does not state the
  date drift began; the CLAUDE.md "cut 2022 onward" rule is not contradicted, but this pass did not independently confirm the year.

## 4. Instrument card check (`catalog/instruments.yaml`)

Legend: OK = confirmed in an opened source; FIX = correction; ? = could not be confirmed from an opened source. The file was not edited.

| Card | Claim | Result | Evidence |
|---|---|---|---|
| airs | Platform Aqua, since 2002 | OK | Launch 4 May 2002 (science.nasa.gov/mission/aqua; airs.jpl.nasa.gov). AIRS L3 data start Aug 2002 (AIRS V7 L3 User Guide, intro) |
| airs | Twice daily, about 13:30 and 01:30 local | OK | L3 User Guide Section 1.5: ascending 1:30 PM, descending 1:30 AM equator crossing (outside polar zones, day and night). Add the drift note (3e) |
| airs | Level-3 monthly 1 degree grid | OK | L3 User Guide (360 x 180 cells); DOI title "AIRS-only 1 degree x 1 degree V7.0" |
| airs | 2378 channels | OK | airs.jpl.nasa.gov (2,378 spectral channels) |
| airs | "Retrievals from cloud-cleared radiances" | ? | Not found in the opened L3 guide or the AIRS homepage; likely true for V7 but not verified here |
| airs | Link `https://airs.jpl.nasa.gov/` | OK | Opens |
| gpm_imerg | `since: 2000` | FIX (clarify) | V07B record now starts 1 Jan 1998 (extended 7 Nov 2024), but Jan 1998-May 2000 is low quality (Release Notes p. 3, App. 4). Keep "2000" only if the series is cut at June 2000, say so |
| gpm_imerg | Gauge-adjusted (Final Run), monthly 0.1 degree | OK | DOI 10.5067/GPM/IMERG/3B-MONTH/07 title "L3 1 month 0.1 degree x 0.1 degree V07" (DataCite); ATBD Table 2; GPCC in ATBD Section 2.5 and 3.8 |
| gpm_imerg | "TRMM era before 2014, GPM era after" | OK (nuance) | Release Notes p. 4: TRMM-to-GPM shift June 2014. The IMERG page words it as TRMM 1998-2015 and GPM 2014-present, an overlap |
| gpm_imerg | "Intercalibrated to the GPM core radar/radiometer" | OK (nuance) | Microwave estimates are intercalibrated to CORRA (combined radar-radiometer of the TRMM and GPM cores); infrared is calibrated to the microwave, not to the core directly (ATBD Section 3.4, 3.6) |
| gpm_imerg | Bias-adjusted with GPCC gauges | OK | ATBD Section 2.5; IMERG page FAQ. Applies to the Final Run only |
| omi | Platform Aura, since 2004 | OK | Launch 15 July 2004; science-quality data 1 Oct 2004 (OMNO2 README Section 2.1). science.nasa.gov/mission/aura/ gives the launch date |
| omi | "Daily Level-3 0.25 degree grids" | **FIX** | True for OMNO2d (0.25 degree). **OMAERUVd is a 1 x 1 degree grid** (DOI 10.5067/Aura/OMI/DATA3003 title "Daily L3 Global 1x1 deg"). Change to "0.25 degree (NO2) and 1 degree (aerosol)". Native footprint is about 13 x 24 km at nadir to 24 x 160 km at the swath edge (README Section 2.1) |
| omi | Not stated: overpass time | Add | Local equator crossing 13:45 +/- 0:15, ascending (README Section 2.1) |
| omi | Measures AOD, tropospheric NO2, SO2, ozone | OK | Aura page: ozone, aerosols and key gases; Krotkov et al. 2016 (SO2 and NO2); Torres et al. 2018 (aerosol) |
| omi | "UV-visible imaging spectrometer measuring backscattered solar radiance" | ? | Consistent with the Torres and README text (UV backscattered radiance); no sentence found that says exactly this |
| omi | Link `https://aura.gsfc.nasa.gov/omi.html` | FIX | Permanently redirects to `https://science.nasa.gov/mission/aura/`, which does not mention OMI. Prefer the OMNO2 README or the DOI landing page |
| omi | Missing: row anomaly | Add | See 3a. Card should carry the one-line caveat |
| merra2 | Since 1980 | OK | Product starts 1 Jan 1980 (Gelaro et al. 2017, Section 2). Via POWER it starts 1981 (POWER methodology page), as the tracker says |
| merra2 | 0.5 x 0.625 degree | OK | Gelaro et al. 2017, Section 2; POWER methodology |
| merra2 | GEOS-5 with 3D-Var assimilation | OK | GEOS-5.12.4 with the GSI analysis, a 3D-Var scheme on a 6-hour cycle (Gelaro et al. 2017, Section 2). Version 5.12.4 matches the Giovanni ID M2IMNXASM_5_12_4 |
| merra2 | "Assimilating ... aerosol optical depth" | OK | Abstract lists assimilation of aerosol observations as a key advance |
| merra2 | "Observing-system changes can shift long-term values" | OK | Gelaro et al. 2017 and McCarty et al. 2016 (3d). Add "AIRS is assimilated since Sep 2002" to the second-opinion note |
| gldas | Since 2000 | OK | GLDAS-2.1 runs from 1 Jan 2000 (README Table 1, Section 1.2.3) |
| gldas | **"Noah land-surface model v2.1"** | **FIX** | 2.1 is the GLDAS **version**; the land model is **Noah 3.6** (README Table 1: Noah-3.6, CLSM-F2.5, VIC-4.1.2). Write "GLDAS 2.1 (Noah 3.6)" |
| gldas | Monthly 0.25 degree, land only | OK | DOI 10.5067/SXAVCZFAQLNO title "Noah ... monthly 0.25 x 0.25 degree, Version 2.1"; latitude extent 60 S to 90 N (README Table 1) |
| gldas | Soil moisture, evapotranspiration, snow water equivalent, runoff | OK | Variable names in Giovanni IDs; SWE accumulates without a glacier model in permanent snow regions (README Section 1.6): mask them |
| gldas | "Forced by observation-based meteorology and precipitation" | OK (nuance) | GDAS analysis plus GPCP precipitation plus AGRMET radiation, i.e. model analysis and observation-based mix (README Section 1.2.3) |
| modis | Terra and Aqua, since 2000 | OK (second hand) | Terra launched 18 Dec 1999 (science.nasa.gov/mission/terra), Aqua 4 May 2002 (science.nasa.gov/mission/aqua); LAADS: first MODIS 1999, second 2002 |
| modis | 36 bands | OK | ladsweb.modaps.eosdis.nasa.gov MODIS page: 36 bands, 0.4-14.4 micrometre; 250 m, 500 m, 1 km; swath about 2330 km; Terra 10:30 descending, Aqua 13:30 ascending |
| modis | Monthly 1 degree grid | OK | MOD08_M3 LAADS page: 1 x 1 degree, DOI 10.5067/MODIS/MOD08_M3.061 |
| modis | AOD 550 nm "Dark Target / Deep Blue combined" | ? | Field name only seen in a search-result summary; LAADS product page did not mention it. Not verified |
| mopitt | Terra, since 2000 | OK | Terra launched Dec 1999; MOPITT measurements began 3 Mar 2000 (www2.acom.ucar.edu/mopitt) |
| mopitt | Total-column CO, monthly 1 degree | ? | Product is MOP03JM "J" = joint thermal and near-infrared retrieval (search-result summary); 1 degree grid not confirmed from an opened page |
| mopitt | "Gas-correlation radiometer, thermal and near-infrared" | ? | UCAR page calls it a correlated radiometer; thermal and near-infrared channels seen only in a search summary |

Tracker items to apply: OMAERUV DOI is **10.5067/Aura/OMI/DATA3003** (version 003, DataCite record, 1 x 1 degree daily L3).
Giovanni variable IDs were not re-checked here (not in scope).

## 5. References (for the submission, R6)

DOIs below were checked against the DOI registries (Crossref or DataCite record, title and authors match). Datasets are cited as
"data accessed through NASA Giovanni / NASA POWER on 2026-11-15"; the version used is part of each title.

### Datasets (cite the DOI; NASA data are open, no NASA logos on slides)

1. AIRS Project (2020), Aqua/AIRS L3 Monthly Standard Physical Retrieval (AIRS-only) 1 degree x 1 degree V7.0 (AIRS3STM), NASA GES DISC,
   https://doi.org/10.5067/UBENJB9D3T2H
2. Huffman, G.J., Stocker, E.F., Bolvin, D.T., Nelkin, E.J. (2023), GPM IMERG Final Precipitation L3 1 month 0.1 degree x 0.1 degree V07
   (GPM_3IMERGM), NASA GES DISC, https://doi.org/10.5067/GPM/IMERG/3B-MONTH/07
3. Beaudoing, H., Rodell, M., NASA/GSFC/HSL (2020), GLDAS Noah Land Surface Model L4 monthly 0.25 x 0.25 degree, Version 2.1 (GLDAS_NOAH025_M 2.1),
   NASA GES DISC, https://doi.org/10.5067/SXAVCZFAQLNO. Also cite the primary reference: Rodell, M. et al. (2004), The Global Land Data Assimilation System,
   Bull. Amer. Meteor. Soc. 85(3), 381-394, https://doi.org/10.1175/BAMS-85-3-381
4. Krotkov, N.A. (2013), OMI/Aura NO2 Cloud-Screened Total and Tropospheric Column Daily L3 Global 0.25 degree Lat/Lon Grid (OMNO2d V003),
   NASA GES DISC, https://doi.org/10.5067/Aura/OMI/DATA3007
5. Torres, O. (2008), OMI/Aura Near UV Aerosol Optical Depth and Single Scattering Albedo Daily L3 Global 1 x 1 deg Lat/Lon Grid (OMAERUVd V003),
   NASA GES DISC, https://doi.org/10.5067/Aura/OMI/DATA3003 (DataCite record; the year is the DOI registration year)
6. Global Modeling and Assimilation Office (GMAO) (2015), MERRA-2 instM_2d_asm_Nx: 2d, Monthly mean, Single-Level, Assimilation, Single-Level Diagnostics V5.12.4
   (M2IMNXASM), NASA GES DISC, https://doi.org/10.5067/5ESKGQTZG7FO. Model paper: Gelaro, R. et al. (2017), J. Climate 30(14), 5419-5454,
   https://doi.org/10.1175/JCLI-D-16-0758.1
7. NASA Langley Research Center, Prediction Of Worldwide Energy Resources (POWER) Project, https://power.larc.nasa.gov/. POWER's own referencing
   guide (https://power.larc.nasa.gov/docs/referencing/, opened) asks for two statements and the service name, version number and access date:
   "The data was obtained from National Aeronautics and Space Administration (NASA) Langley Research Center's Prediction Of Worldwide Energy Resources (POWER)
   project funded through the NASA Earth Science Division." and "The data was obtained from the POWER Project's Hourly 2.x.x version on YYYY/MM/DD." Fill in the real version
   and date from the API response header (not checked here). POWER meteorology is based on MERRA-2.
8. Only if MODIS is shown (offline files): MODIS Atmosphere Science Team (2017), MODIS/Terra Aerosol Cloud Water Vapor Ozone Monthly L3 Global 1Deg CMG
   (MOD08_M3 061), https://doi.org/10.5067/MODIS/MOD08_M3.061 and the Aqua twin https://doi.org/10.5067/MODIS/MYD08_M3.061.
9. Giovanni: the data are accessed through NASA's Giovanni service; its recommended acknowledgement was not checked in this pass (open item).

### Statistics methods

10. Mann, H.B. (1945), Nonparametric tests against trend, Econometrica 13(3), 245-259, https://doi.org/10.2307/1907187
11. Hamed, K.H. and Rao, A.R. (1998), A modified Mann-Kendall trend test for autocorrelated data, Journal of Hydrology 204(1-4), 182-196,
    https://doi.org/10.1016/S0022-1694(97)00125-X
12. Sen, P.K. (1968), Estimates of the regression coefficient based on Kendall's tau, J. Amer. Statist. Assoc. 63(324), 1379-1389,
    https://doi.org/10.1080/01621459.1968.10480934
13. Benjamini, Y. and Hochberg, Y. (1995), Controlling the false discovery rate: a practical and powerful approach to multiple testing, J. Roy. Statist. Soc. B 57(1), 289-300,
    https://doi.org/10.1111/j.2517-6161.1995.tb02031.x
14. Weatherhead, E.C. et al. (1998), Factors affecting the detection of trends: statistical considerations and applications to environmental data,
    J. Geophys. Res. 103(D14), 17149-17161, https://doi.org/10.1029/98JD00995

(Kendall's tau-based tests also cite Mann 1945 above; no other statistics sources were added.)

### Climate science and regions

15. IPCC (2021), Climate Change 2021: The Physical Science Basis. Contribution of Working Group I to the Sixth Assessment Report [Masson-Delmotte, V. et al. (eds.)],
    Cambridge University Press, https://doi.org/10.1017/9781009157896. Chapters used (final PDFs from ipcc.ch):
    Ch. 2 (Gulev et al.) .004; Ch. 6 (Szopa et al.) .008; Ch. 8 (Douville et al.) .010; Ch. 11 (Seneviratne et al.) .013; Ch. 12 (Ranasinghe et al.) .014; Atlas (Gutierrez et al.) .021.
    PDFs: https://www.ipcc.ch/report/ar6/wg1/downloads/report/IPCC_AR6_WGI_Chapter11.pdf (and Chapter02, Chapter06, Chapter08, Chapter12, Atlas).
16. Iturbide, M. et al. (2020), An update of IPCC climate reference regions for subcontinental analysis of climate model data: definition and aggregated datasets,
    Earth Syst. Sci. Data 12, 2959-2970, https://doi.org/10.5194/essd-12-2959-2020. Region polygons: https://github.com/IPCC-WG1/Atlas (reference-regions folder, v4).
17. Beck, H.E. et al. (2018), Present and future Koppen-Geiger climate classification maps at 1-km resolution, Scientific Data 5, 180214,
    https://doi.org/10.1038/sdata.2018.214
18. Vuille, M. and Bradley, R.S. (2000), Mean annual temperature trends and their vertical structure in the tropical Andes, Geophys. Res. Lett. 27(23), 3885-3888,
    https://doi.org/10.1029/2000GL011871
19. Krotkov, N.A. et al. (2016), Aura OMI observations of regional SO2 and NO2 pollution changes from 2005 to 2015, Atmos. Chem. Phys. 16, 4605-4629,
    https://doi.org/10.5194/acp-16-4605-2016
20. Torres, O. et al. (2018), Impact of the ozone monitoring instrument row anomaly on the long-term record of aerosol products, Atmos. Meas. Tech. 11, 2701-2715,
    https://doi.org/10.5194/amt-11-2701-2018
21. McCarty, W. et al. (2016), MERRA-2 Input Observations: Summary and Assessment, NASA/TM-2016-104606 Vol. 46, https://ntrs.nasa.gov/citations/20160014544
22. IMERG V07 documents: Huffman, G.J. et al., Algorithm Theoretical Basis Document (12 July 2023) and Release Notes (20 Nov 2024), NASA GPM, https://gpm.nasa.gov/data/imerg
23. GLDAS-2 README, GES DISC (revised 13 Aug 2025), https://hydro1.gesdisc.eosdis.nasa.gov/data/GLDAS/GLDAS_NOAH025_M.2.1/doc/README_GLDAS2.pdf

Reference status caveat: for items 10-14, 17 and 18 only the bibliographic record (title, authors, journal, volume, pages, year) was verified against Crossref;
the papers themselves are paywalled or were not read in this pass. Use them as method citations; do not paraphrase their content on slides without a human reading them.

## 6. Could not open / open issues

Could not open (so not relied on, except where noted):
- **KNMI OMI row anomaly page** `projects.knmi.nl/omi/research/product/rowanomaly-background.php`: certificate expired. Replaced by Torres et al. 2018 and the OMNO2 README.
- **GES DISC dataset landing pages** (`disc.gsfc.nasa.gov/datasets/...`): script-rendered, fetch returned only "GES DISC". DOIs were checked against DataCite instead.
- **modis.gsfc.nasa.gov** pages (about, specifications): fetch failed. Used the LAADS MODIS and MOD08_M3 pages. MODIS AOD field name unverified.
- **MOPITT** instrument and L3 specification pages (ASDC, acom.ucar.edu/mopitt/about): 404 or redirect to a dead link. Only the acom.ucar.edu mission summary was read.
- **GMAO MERRA-2 FAQ** (`gmao.gsfc.nasa.gov/reanalysis/MERRA-2/FAQ/`): 404. Gelaro et al. via PMC and McCarty et al. via NTRS used instead.
- **AMS journal page for Gelaro et al. 2017**: HTTP 403; used the PMC author manuscript (no printed page numbers; sections given instead).
- **POWER meteorology methodology page** (`.../methodology/meteorology/`): 404; used the methodology index and the sources page.
- **AR6 Interactive Atlas** and the studies AR6 itself cites (for example Dunn et al. 2020, Dereczynski et al. 2020, Lavado et al. 2013, Georgoulias et al. 2019):
  not opened. Statements in `expectations.yaml` are attributed to AR6, never to those primary papers.
- Some web pages were read through a summarising fetch tool (AIRS homepage, science.nasa.gov mission pages, LAADS, acom.ucar.edu, power.larc.nasa.gov, gpm.nasa.gov/data/imerg
  first pass); for IMERG, AIRS L3, OMNO2, GLDAS, Torres 2018, Gelaro 2017, McCarty 2016 and the AR6 chapters the full text was downloaded and searched, and the quoted facts were
  checked against that text. A human should re-open the summarised ones (AIRS 2378 channels, MODIS bands, MOPITT start date) before a slide uses them.

Open issues for the lead:
1. `catalog/instruments.yaml` needs three fixes: OMAERUV grid (1 degree), GLDAS "Noah 3.6" (not "v2.1"), OMI link (redirects). Plus IMERG "since" wording and the OMI and Aqua-drift caveats (sections 3 and 4).
2. Wisconsin is split between CNA and ENA; `expectations.yaml` has both. The place profile (C1) should show the region for the picked point, and a point exactly on 90 W needs a tie rule.
3. Simple-text terms that may need `catalog/glossary.yaml` entries in kid words: "heavy rain storms", "dry spells", "polluting gas", "haze". Not edited here (not owned).
4. The Simple wording maps IPCC confidence to "quite sure" (high or very likely), "think so" (likely or medium) and "not sure / too soon to tell" (low). If the app shows the "how sure" meter next to published findings, keep these two scales visibly separate: the meter is about our own result, the words here are about AR6.
5. Wisconsin temperature: AR6 says warming across North America but low confidence for *hot extremes* in CNA/ENA, while the NOAA summary in `regions.yaml` says summers warmed little. Our Simple text for the demo should not say "hotter summers" as an expectation.
6. A human must confirm every entry (field `checked_by` says so) and the AI-use disclosure and Giovanni acknowledgement text (R6) are not covered here.
