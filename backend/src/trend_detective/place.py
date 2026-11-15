"""Place profile: what kind of place is this? Facts known before any trend is computed.

Everything here comes from maps and long-term means, never from a trend (CLAUDE.md, variable selection).

Sources
-------
* IPCC AR6 WGI reference regions v4 (Iturbide et al. 2020, Earth Syst. Sci. Data 12:2959,
  https://doi.org/10.5194/essd-12-2959-2020), `catalog/ar6_reference_regions.geojson`, looked up with a
  pure-Python point-in-polygon test at the region centre (the point, or the box centre).
* Koppen-Geiger main group, from the 12 monthly climatological means of NASA POWER T2M (MERRA-2 based) and
  PRECTOTCORR over the full record. Rules: Beck, H.E., Zimmermann, N.E., McVicar, T.R., Vergopolan, N.,
  Berg, A., Wood, E.F. (2018), "Present and future Koppen-Geiger climate classification maps at 1-km
  resolution", Scientific Data 5:180214, https://doi.org/10.1038/sdata.2018.214. The criteria are in the
  paper's **Table 2** ("Overview of the Koppen-Geiger climate classes including the defining criteria",
  adapted from Peel et al. 2007). (Table 1 of that paper lists the input datasets.) Implemented as
  printed, including: B takes precedence over A/C/D/E; Pthreshold = 2*MAT if more than 70% of the yearly
  precipitation falls in winter, 2*MAT + 28 if more than 70% falls in summer, else 2*MAT + 14; summer
  (winter) is the six-month period that is warmer (colder) of Apr-Sep and Oct-Mar, which makes the rule
  hemisphere-aware without looking at latitude; C and D are split at Tcold = 0 degrees C; the s and w
  sub-types are mutually exclusive (s when more precipitation falls in winter than in summer, else w).
* High up: POWER's model-grid elevation (`geometry.coordinates[2]`); >= 1500 m counts as high up. It is the
  height of the model grid cell, not of the ground, so it is shown only as "model grid height".
"""

from __future__ import annotations

import calendar
import json
import logging
import math
from functools import lru_cache
from pathlib import Path

import numpy as np

from .catalog import RegionCard
from .contract import PlaceProfile, Text
from .sources import power as P
from .sources.base import LiveSourceUnavailable

log = logging.getLogger(__name__)

HIGH_UP_M = 1500.0
WET_SPAN = 4  # wettest run of consecutive months
DRY_SPAN = 3  # driest run of consecutive months
SEASONAL_RATIO = 2.0  # declared rule: wettest-4 mean >= 2 x driest-3 mean means "has seasons"
MIN_YEARS_PER_MONTH = 10
DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]  # PRECTOTCORR is mm/day

AR6_FILE = "ar6_reference_regions.geojson"
GROUP_OF_MAIN = {"A": "tropical", "B": "dry", "C": "temperate", "D": "cold", "E": "polar"}


# ---------------------------------------------------------------- AR6 region lookup

def _ring_contains(ring: list[list[float]], x: float, y: float) -> bool:
    """Ray casting: is (x, y) inside this ring? (Edge cases on the border are a coin toss; fine at this scale.)"""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _polygon_contains(poly: list[list[list[float]]], x: float, y: float) -> bool:
    """poly = [outer ring, hole, hole, ...]."""
    if not poly or not _ring_contains(poly[0], x, y):
        return False
    return not any(_ring_contains(hole, x, y) for hole in poly[1:])


@lru_cache(maxsize=1)
def _load_regions(path: str) -> tuple[dict, ...]:
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    out = []
    for f in doc["features"]:
        props = f["properties"]
        geom = f["geometry"]
        polys = [geom["coordinates"]] if geom["type"] == "Polygon" else list(geom["coordinates"])
        xs = [c[0] for poly in polys for c in poly[0]]
        ys = [c[1] for poly in polys for c in poly[0]]
        out.append({
            "code": props["Acronym"], "name": props["Name"], "type": props["Type"],
            "polys": polys, "bbox": (min(xs), min(ys), max(xs), max(ys)),
        })
    return tuple(out)


def default_regions_path() -> Path:
    return Path(__file__).resolve().parents[3] / "catalog" / AR6_FILE


def ar6_region_at(lon: float, lat: float, path: Path | None = None) -> tuple[str, str] | None:
    """(code, name) of the AR6 land region containing the point, or None (ocean, or outside every land region).

    "Land" regions are tried first, then the three "Land-Ocean" ones (CAR, MED, SEA). Longitude is
    wrapped into [-180, 180); the file already merges regions that cross the dateline into one shape.
    """
    if not (math.isfinite(lon) and math.isfinite(lat)):
        return None
    x = ((lon + 180.0) % 360.0) - 180.0
    regions = _load_regions(str(path or default_regions_path()))
    for kind in ("Land", "Land-Ocean"):
        for r in regions:
            if r["type"] != kind:
                continue
            w, s, e, n = r["bbox"]
            if not (w <= x <= e and s <= lat <= n):
                continue
            if any(_polygon_contains(poly, x, lat) for poly in r["polys"]):
                return r["code"], r["name"]
    return None


# ---------------------------------------------------------------- Koppen-Geiger (Beck et al. 2018, Table 2)

def koppen_geiger(temp_c: list[float], precip_mm: list[float]) -> str:
    """Three-letter Koppen-Geiger code (two for A/B/E where the table has only two levels) from 12 monthly
    climatological means (January..December): air temperature in degrees C, precipitation in mm per month."""
    t = np.asarray(temp_c, dtype=float)
    p = np.asarray(precip_mm, dtype=float)
    if t.shape != (12,) or p.shape != (12,) or not (np.isfinite(t).all() and np.isfinite(p).all()):
        raise ValueError("need 12 finite monthly temperature and precipitation means")
    mat = float(t.mean())
    map_ = float(p.sum())
    t_hot, t_cold = float(t.max()), float(t.min())
    tmon10 = int((t > 10).sum())

    apr_sep = [3, 4, 5, 6, 7, 8]
    oct_mar = [9, 10, 11, 0, 1, 2]
    if t[apr_sep].mean() >= t[oct_mar].mean():
        summer, winter = apr_sep, oct_mar
    else:
        summer, winter = oct_mar, apr_sep
    p_sdry, p_swet = float(p[summer].min()), float(p[summer].max())
    p_wdry, p_wwet = float(p[winter].min()), float(p[winter].max())
    p_dry = float(p.min())
    sum_s, sum_w = float(p[summer].sum()), float(p[winter].sum())

    if map_ > 0 and sum_w / map_ > 0.7:
        p_thr = 2 * mat
    elif map_ > 0 and sum_s / map_ > 0.7:
        p_thr = 2 * mat + 28
    else:
        p_thr = 2 * mat + 14

    if map_ < 10 * p_thr:  # B: arid, takes precedence
        return "B" + ("W" if map_ < 5 * p_thr else "S") + ("h" if mat >= 18 else "k")
    if t_cold >= 18:  # A: tropical
        if p_dry >= 60:
            return "Af"
        return "Am" if p_dry >= 100 - map_ / 25 else "Aw"
    if t_hot <= 10:  # E: polar
        return "ET" if t_hot > 0 else "EF"
    main = "C" if t_cold > 0 else "D"  # Thot > 10 here; C needs 0 < Tcold < 18
    dry_s = p_sdry < 40 and p_sdry < p_wwet / 3
    dry_w = p_wdry < p_swet / 10
    if dry_s and dry_w:  # mutually exclusive: s when more rain falls in winter than in summer, else w
        dry_s, dry_w = (True, False) if sum_w > sum_s else (False, True)
    second = "s" if dry_s else "w" if dry_w else "f"
    if t_hot >= 22:
        third = "a"
    elif tmon10 >= 4:
        third = "b"
    elif main == "D" and t_cold < -38:
        third = "d"
    else:
        third = "c"
    return main + second + third


# ---------------------------------------------------------------- wet and dry months

def _best_run(values: np.ndarray, span: int, pick_max: bool) -> list[int]:
    """Start month (0-based, circular) of the run of `span` consecutive months with the highest/lowest sum."""
    sums = [float(sum(values[(i + k) % 12] for k in range(span))) for i in range(12)]
    best = max(range(12), key=lambda i: sums[i]) if pick_max else min(range(12), key=lambda i: sums[i])
    return [((best + k) % 12) + 1 for k in range(span)]


def wet_dry_months(precip_mm: list[float]) -> tuple[list[int], list[int]]:
    """(wet months, dry months), 1..12, sorted. Empty lists when the place has no clear rainy season.

    Declared rule: wet = the 4 consecutive months (circular) with the highest mean precipitation, dry = the 3
    consecutive months with the lowest; both are reported only when the wettest-4 mean is at least 2 x the
    driest-3 mean and the two runs do not overlap. Long-term means only, never a trend.
    """
    p = np.asarray(precip_mm, dtype=float)
    if p.shape != (12,) or not np.isfinite(p).all():
        return [], []
    wet = _best_run(p, WET_SPAN, True)
    dry = _best_run(p, DRY_SPAN, False)
    wet_mean = float(np.mean([p[m - 1] for m in wet]))
    dry_mean = float(np.mean([p[m - 1] for m in dry]))
    if set(wet) & set(dry) or wet_mean <= 0 or wet_mean < SEASONAL_RATIO * dry_mean:
        return [], []
    return sorted(wet), sorted(dry)


# ---------------------------------------------------------------- POWER climatology and elevation

def _power_source(ctx) -> P.PowerSource | None:
    return next((s for s in getattr(ctx.sources, "sources", []) if isinstance(s, P.PowerSource)), None)


def _climatology(src: P.PowerSource, param: str, kind: str, bbox: list[float]):
    """(12 calendar-month means over the full record, elevations of the grid points, first year, last year)."""
    endpoint, c = src._plan(kind, bbox)
    loaded = src._load(endpoint, param, c, P.FIRST_YEAR, src.end_year or P.last_complete_year())
    if loaded is None:
        return None
    doc, _url = loaded
    by_month, _coords = P.parse_power(doc, param)
    feats = doc.get("features") if doc.get("type") == "FeatureCollection" else [doc]
    elev = [float(f["geometry"]["coordinates"][2]) for f in feats or []
            if len(f.get("geometry", {}).get("coordinates", [])) > 2]
    per_cal: list[list[float]] = [[] for _ in range(12)]
    years: list[int] = []
    for key, vals in by_month.items():
        arr = np.asarray(vals, dtype=float)
        arr = arr[np.isfinite(arr)]
        if arr.size:
            per_cal[int(key[5:7]) - 1].append(float(arr.mean()))
            years.append(int(key[:4]))
    if not years or any(len(v) < MIN_YEARS_PER_MONTH for v in per_cal):
        return None
    return [float(np.mean(v)) for v in per_cal], elev, min(years), max(years)


# ---------------------------------------------------------------- words

MONTH_NAMES = [calendar.month_name[m] for m in range(1, 13)]


MONTH_NAMES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
                  "octubre", "noviembre", "diciembre"]


def _rain_span_es(months: list[int]) -> str:
    """'de diciembre a marzo' for a circular run of consecutive months."""
    s = set(months)
    start = next(m for m in months if ((m - 2) % 12) + 1 not in s)
    end = next(m for m in months if (m % 12) + 1 not in s)
    return f"de {MONTH_NAMES_ES[start - 1]} a {MONTH_NAMES_ES[end - 1]}"


def _simple_feel_es(code: str | None) -> str | None:
    if not code:
        return None
    if code == "Af":
        return "cálido y lluvioso todo el año"
    if code[0] == "A":
        return "cálido, con una época de lluvia y otra seca"
    if code[0] == "B":
        return ("muy seco" if code[1] == "W" else "seco") + (" y cálido" if code[2] == "h" else " y fresco")
    if code[0] == "C":
        return "templado, ni muy caliente ni muy frío"
    if code[0] == "D":
        return "frío, con un invierno largo y frío"
    return "muy frío todo el año"


def _rain_span(months: list[int]) -> str:
    """'December to March' for a circular run of consecutive months."""
    s = set(months)
    start = next(m for m in months if ((m - 2) % 12) + 1 not in s)
    end = next(m for m in months if (m % 12) + 1 not in s)
    return f"{MONTH_NAMES[start - 1]} to {MONTH_NAMES[end - 1]}"


def _simple_feel(code: str | None) -> str | None:
    if not code:
        return None
    if code == "Af":
        return "hot and rainy all year"
    if code[0] == "A":
        return "hot, with a rainy time and a dry time"
    if code[0] == "B":
        return ("very dry" if code[1] == "W" else "dry") + (" and hot" if code[2] == "h" else " and cool")
    if code[0] == "C":
        return "mild, not too hot and not too cold"
    if code[0] == "D":
        return "cold, with a long cold winter"
    return "very cold all year"


def _texts(code, ar6, elev, high_up, wet, dry, years) -> Text | None:
    feel = _simple_feel(code)
    simple: list[str] = []
    if feel:
        simple.append(f"Your place is {feel}.")
    if high_up:
        simple.append("It is high up above the sea.")
    if wet:
        simple.append(f"Most rain comes from {_rain_span(wet)}.")
    if feel:
        simple.append("This is a computer model estimate.")
    sci: list[str] = []
    if code and years:
        sci.append(f"Köppen–Geiger {code} (Beck et al. 2018 rules on NASA POWER {years[0]}–{years[1]} "
                   "climatology, MERRA-2 based)")
    if ar6:
        sci.append(f"IPCC AR6 region {ar6[0]} ({ar6[1]})")
    if elev is not None:
        sci.append(f"model-grid elevation {elev:.0f} m" + (" (high up: 1500 m or more)" if high_up else ""))
    if wet:
        sci.append(f"wet months {_rain_span(wet)}, dry months {_rain_span(dry)} (long-term monthly means)")
    if not simple and not sci:
        return None
    if not simple:
        simple = ["We could not tell what kind of place this is."]
    # Spanish twin, built from the same facts
    feel_es = _simple_feel_es(code)
    simple_es: list[str] = []
    if feel_es:
        simple_es.append(f"Tu lugar es {feel_es}.")
    if high_up:
        simple_es.append("Está en un lugar alto, sobre el nivel del mar.")
    if wet:
        simple_es.append(f"La mayor parte de la lluvia cae {_rain_span_es(wet)}.")
    if feel_es:
        simple_es.append("Esto es una estimación de un modelo de computadora.")
    sci_es: list[str] = []
    if code and years:
        sci_es.append(f"Köppen–Geiger {code} (reglas de Beck et al. 2018 sobre la climatología de NASA POWER "
                      f"{years[0]}–{years[1]}, basada en MERRA-2)")
    if ar6:
        sci_es.append(f"región IPCC AR6 {ar6[0]} ({ar6[1]})")
    if elev is not None:
        sci_es.append(f"elevación de la rejilla del modelo {elev:.0f} m" + (" (zona alta: 1500 m o más)" if high_up else ""))
    if wet:
        sci_es.append(f"meses húmedos {_rain_span_es(wet)}, meses secos {_rain_span_es(dry)} (medias mensuales de largo plazo)")
    if not simple_es:
        simple_es = ["No pudimos saber qué tipo de lugar es."]
    return Text(
        simple=" ".join(simple), scientific="; ".join(sci) + "." if sci else "No place facts available.",
        simple_es=" ".join(simple_es),
        scientific_es="; ".join(sci_es) + "." if sci_es else "No hay datos del lugar disponibles.",
    )


# ---------------------------------------------------------------- entry point

def profile_place(ctx, region: RegionCard) -> PlaceProfile:
    """Profile for a region card (point or box). Never raises on missing data: unknown fields stay None."""
    geom = region.geometry
    w, s, e, n = geom.bbox
    ar6 = ar6_region_at((w + e) / 2, (s + n) / 2)

    code = group = elev = high_up = None
    wet: list[int] = []
    dry: list[int] = []
    years: tuple[int, int] | None = None
    src = _power_source(ctx)
    if src is not None:
        try:
            P.validate_geometry(geom.kind, geom.bbox)
            t_cl = _climatology(src, "T2M", geom.kind, geom.bbox)
            p_cl = _climatology(src, "PRECTOTCORR", geom.kind, geom.bbox)
        except (ValueError, LiveSourceUnavailable) as exc:
            log.warning("place profile: no POWER climatology (%s)", exc)
            t_cl = p_cl = None
        if t_cl is not None:
            if t_cl[1]:
                elev = round(float(np.mean(t_cl[1])), 0)
                high_up = elev >= HIGH_UP_M
            years = (t_cl[2], t_cl[3])
        if t_cl is not None and p_cl is not None:
            precip = [v * d for v, d in zip(p_cl[0], DAYS_IN_MONTH)]
            code = koppen_geiger(t_cl[0], precip)
            group = GROUP_OF_MAIN[code[0]]
            wet, dry = wet_dry_months(precip)
    return PlaceProfile(
        ar6_region_code=ar6[0] if ar6 else None,
        ar6_region_name=ar6[1] if ar6 else None,
        climate_group=group,
        climate_code=code,
        high_up=high_up,
        elevation_m_model=elev,
        wet_months=wet,
        dry_months=dry,
        text=_texts(code, ar6, elev, high_up, wet, dry, years),
    )
