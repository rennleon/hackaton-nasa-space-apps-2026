"""Region homogeneity: "is this box one kind of place?", computed BEFORE any trend.

Why: averaging a box that mixes regimes (dry coast and rainy mountains, say) can cancel opposite trends, so the
average says "no change" while every part is changing. The check uses only long-term means (NASA POWER climatology,
MERRA-2 based), never a trend, so it is allowed as a selection fact (CLAUDE.md).

Data: NASA POWER climatology, regional endpoint (one parameter per call; box 2 to 10 degrees per side):
`https://power.larc.nasa.gov/api/temporal/climatology/regional`. Cells are 0.5 x 0.625 degrees; each feature is
[lon, lat, model elevation m] with monthly means JAN..DEC and ANN. Fetched: PRECTOTCORR (mm/day) and T2M (degrees C).
Responses are cached as JSON under data/cache/power/ (`clim_regional_<PARAM>_<W>_<S>_<E>_<N>.json`) so the
pre-loaded regions work offline. Offline with no cache gives None, and any failure gives None: never breaks a scan.

Koppen-Geiger main group per cell: `place.koppen_geiger` (Beck et al. 2018, Table 2; see its docstring).

The four "mixed" rules below are PROJECT HEURISTICS. The literature gives no thresholds; the idea (check that the
cells of a region are alike before pooling them) follows Hosking & Wallis 1993 regional homogeneity.
"""

from __future__ import annotations

import json
import logging
import math
import os
import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np

from .contract import Homogeneity, HomogeneityReason, HomogeneitySuggestion, Text
from .place import DAYS_IN_MONTH, HIGH_UP_M, koppen_geiger
from .sources import power as P
from .sources.base import LiveSourceUnavailable

log = logging.getLogger(__name__)

ENDPOINT = "https://power.larc.nasa.gov/api/temporal/climatology/regional"
PARAMS = ("PRECTOTCORR", "T2M")
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
CELL_LAT = 0.5
CELL_LON = 0.625

# PROJECT HEURISTICS (declared before any result is seen; never tuned to a trend)
GROUP_SHARE = 0.20  # (a) two or more Koppen main groups each with at least this share of the cells
ELEV_RANGE_M = 1000.0  # (b) model elevation range above this
PRECIP_RATIO = 2.0  # (c) wettest / driest annual precipitation above this ...
PRECIP_DIFF = 0.5  # ... and the difference above this (mm/day)
T2M_RANGE_C = 5.0  # (d) annual T2M range above this: SUPPORTING only, never "mixed" on its own (see _mixing)
# Why (d) is supporting only: box means average each cell's departure from its OWN seasonal cycle
# (sources/base.py area_mean), so a steady warm/cool offset between cells cannot cancel a trend. What can cancel
# trends is mixing regimes (different processes): Koppen group, high vs low ground, wet vs dry -- rules (a)-(c).
# A smooth temperature gradient inside one climate group (e.g. 4-5 degrees of latitude) is not a regime change.
SUPPORTING_ONLY = {"temperature"}
SUGGEST_MIN_CELLS = 4
SUGGEST_MAX = 3
HEURISTIC_EN = "Rules are project heuristics (concept after Hosking & Wallis 1993), not literature thresholds."
HEURISTIC_ES = ("Las reglas son heurísticas del proyecto (el concepto sigue a Hosking y Wallis 1993), "
                "no umbrales de la literatura.")

Kind = Literal["one_kind", "mixed", "single_spot"]


@dataclass(frozen=True)
class Cell:
    lon: float
    lat: float
    elev: float  # model-grid elevation, m
    precip: float  # annual mean, mm/day
    t2m: float  # annual mean, degrees C
    group: str  # Koppen main group letter A..E


# ---------------------------------------------------------------- fetching and cache

def _fnum(x: float) -> str:
    return f"{x:.2f}"


def request_box(bbox: list[float]) -> list[float]:
    """The box to ask POWER for: each side at least 2 degrees, the user's box centred in it."""
    w, s, e, n = bbox
    if e - w < P.MIN_REGIONAL_SPAN_DEG:
        c = (w + e) / 2
        w, e = c - P.MIN_REGIONAL_SPAN_DEG / 2, c + P.MIN_REGIONAL_SPAN_DEG / 2
    if n - s < P.MIN_REGIONAL_SPAN_DEG:
        c = (s + n) / 2
        s, n = c - P.MIN_REGIONAL_SPAN_DEG / 2, c + P.MIN_REGIONAL_SPAN_DEG / 2
    return [round(x, 2) for x in (w, s, e, n)]


def cache_path(cache_dir: Path, param: str, box: list[float]) -> Path:
    return cache_dir / ("clim_regional_" + param + "_" + "_".join(_fnum(x) for x in box) + ".json")


def _url(param: str, box: list[float]) -> str:
    w, s, e, n = box
    return (f"{ENDPOINT}?parameters={param}&community=ag&longitude-min={w}&longitude-max={e}"
            f"&latitude-min={s}&latitude-max={n}&format=json")


# The check is context only and runs inside the live custom scan: one short try, and a failure is remembered for a
# few minutes, so a hanging climatology endpoint can never hold a scan (or every retry) for minutes.
QUICK_TIMEOUT_S = 10
FAIL_MEMORY_S = 300.0
_recent_failures: dict[str, float] = {}


def _quick_get(url: str) -> dict:
    import urllib.error
    import urllib.request

    if time.monotonic() - _recent_failures.get(url, -1e9) < FAIL_MEMORY_S:
        raise LiveSourceUnavailable("NASA POWER climatology failed recently; not asking again yet")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": P.USER_AGENT})
        with urllib.request.urlopen(req, timeout=QUICK_TIMEOUT_S) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        _recent_failures[url] = time.monotonic()
        if 400 <= exc.code < 500:
            raise P.PowerRequestRejected(f"NASA POWER rejected the request: HTTP {exc.code}") from exc
        raise LiveSourceUnavailable(f"NASA POWER climatology failed: {exc}") from exc
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        _recent_failures[url] = time.monotonic()
        raise LiveSourceUnavailable(f"NASA POWER climatology failed: {exc}") from exc


def _load_doc(cache_dir: Path, offline: bool, param: str, box: list[float]) -> dict | None:
    path = cache_path(cache_dir, param, box)
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            log.warning("unreadable POWER climatology cache file %s", path.name)
    if offline:
        return None
    try:
        doc = _quick_get(_url(param, box))
    except (P.PowerRequestRejected, LiveSourceUnavailable) as exc:
        log.warning("homogeneity: no POWER climatology (%s)", exc)
        return None
    if not isinstance(doc.get("features"), list) or not doc["features"]:
        log.warning("homogeneity: POWER climatology returned no data")
        return None
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(f".{os.getpid()}.tmp")
        tmp.write_text(json.dumps(doc), encoding="utf-8")
        os.replace(tmp, path)  # atomic
    except OSError as exc:
        log.warning("could not write POWER climatology cache: %s", exc)
    return doc


# ---------------------------------------------------------------- cells

def _monthly(feature: dict, param: str) -> list[float] | None:
    series = ((feature.get("properties") or {}).get("parameter") or {}).get(param)
    if not series:
        return None
    try:
        vals = [float(series[m]) for m in MONTHS]
    except (KeyError, TypeError, ValueError):
        return None
    return vals if all(math.isfinite(v) and v > -990.0 for v in vals) else None


def cells_from_docs(precip_doc: dict, t2m_doc: dict, bbox: list[float]) -> list[Cell]:
    """Cells of the two climatology documents whose centre is inside `bbox` (W, S, E, N), with their Koppen
    group. If the box is smaller than one cell, the cell nearest to its centre is used."""
    w, s, e, n = bbox
    t_by_pos: dict[tuple[float, float], tuple[float, list[float]]] = {}
    for f in t2m_doc.get("features") or []:
        try:
            lon, lat, elev = (float(v) for v in f["geometry"]["coordinates"][:3])
        except (KeyError, TypeError, ValueError):
            continue
        t = _monthly(f, "T2M")
        if t is not None:
            t_by_pos[(round(lon, 4), round(lat, 4))] = (elev, t)
    cells: list[Cell] = []
    for f in precip_doc.get("features") or []:
        try:
            lon, lat = (float(v) for v in f["geometry"]["coordinates"][:2])
        except (KeyError, TypeError, ValueError):
            continue
        p = _monthly(f, "PRECTOTCORR")
        hit = t_by_pos.get((round(lon, 4), round(lat, 4)))
        if p is None or hit is None:
            continue
        elev, t = hit
        mm = [v * d for v, d in zip(p, DAYS_IN_MONTH)]  # POWER is mm/day; Koppen wants mm per month
        group = koppen_geiger(t, mm)[0]
        cells.append(Cell(lon, lat, elev, float(np.mean(p)), float(np.mean(t)), group))
    inside = [c for c in cells if w <= c.lon <= e and s <= c.lat <= n]
    if inside or not cells:
        return inside
    cx, cy = (w + e) / 2, (s + n) / 2
    return [min(cells, key=lambda c: (c.lon - cx) ** 2 + (c.lat - cy) ** 2)]


# ---------------------------------------------------------------- rules

def _reasons(cells: list[Cell]) -> list[HomogeneityReason]:
    """The declared rules (project heuristics) that say the cells are mixed. Empty list means one kind."""
    n = len(cells)
    out: list[HomogeneityReason] = []
    counts = Counter(c.group for c in cells)
    big = sorted(g for g, k in counts.items() if k / n >= GROUP_SHARE)
    if len(big) > 1:
        shares = ", ".join(f"{g} {counts[g] / n:.0%}" for g in big)
        out.append(HomogeneityReason(code="climate_groups", text=Text(
            simple="Parts of this box have different kinds of weather.",
            scientific=f"More than one Köppen main group covers at least {GROUP_SHARE:.0%} of the cells ({shares}).",
            simple_es="Partes de este cuadro tienen distintos tipos de clima.",
            scientific_es=f"Más de un grupo principal de Köppen cubre al menos el {GROUP_SHARE:.0%} de las celdas ({shares}).",
        )))
    elev = [c.elev for c in cells]
    if max(elev) - min(elev) > ELEV_RANGE_M:
        out.append(HomogeneityReason(code="elevation", text=Text(
            simple="Some parts are high up and some are low.",
            scientific=f"Model elevation range {max(elev) - min(elev):.0f} m (above {ELEV_RANGE_M:.0f} m).",
            simple_es="Algunas partes están en lo alto y otras en lo bajo.",
            scientific_es=f"Rango de elevación del modelo {max(elev) - min(elev):.0f} m (más de {ELEV_RANGE_M:.0f} m).",
        )))
    pr = [c.precip for c in cells]
    lo, hi = min(pr), max(pr)
    if hi - lo > PRECIP_DIFF and hi > PRECIP_RATIO * lo:
        out.append(HomogeneityReason(code="rain", text=Text(
            simple="Some parts get much more rain than others.",
            scientific=(f"Annual precipitation {lo:.2f}–{hi:.2f} mm/day: wettest cell more than {PRECIP_RATIO:g}x the "
                        f"driest and more than {PRECIP_DIFF:g} mm/day apart."),
            simple_es="Algunas partes reciben mucha más lluvia que otras.",
            scientific_es=(f"Precipitación anual {lo:.2f}–{hi:.2f} mm/día: la celda más húmeda es más de {PRECIP_RATIO:g} "
                           f"veces la más seca y se separan más de {PRECIP_DIFF:g} mm/día."),
        )))
    tt = [c.t2m for c in cells]
    if max(tt) - min(tt) > T2M_RANGE_C:
        out.append(HomogeneityReason(code="temperature", text=Text(
            simple="Some parts are much warmer than others.",
            scientific=f"Annual T2M range {max(tt) - min(tt):.1f} °C (above {T2M_RANGE_C:g} °C).",
            simple_es="Algunas partes son mucho más cálidas que otras.",
            scientific_es=f"Rango anual de T2M {max(tt) - min(tt):.1f} °C (más de {T2M_RANGE_C:g} °C).",
        )))
    return out


def _mixing(reasons: list[HomogeneityReason]) -> bool:
    """Mixed when at least one regime rule (a)-(c) applies; (d) alone does not make a box mixed."""
    return any(r.code not in SUPPORTING_ONLY for r in reasons)


def _round_all(x: float | None, d: int) -> float | None:
    return None if x is None else round(float(x), d)


# ---------------------------------------------------------------- suggestions

def _part_name(group: str, high: bool, mean_t: float) -> Text:
    if high:
        cool = mean_t < 15.0
        return Text(
            simple="the high, cool part" if cool else "the high part",
            scientific=f"Köppen {group}, model elevation 1500 m or more",
            simple_es="la parte alta y fresca" if cool else "la parte alta",
            scientific_es=f"Köppen {group}, elevación del modelo de 1500 m o más",
        )
    word, word_es = {
        "A": ("the hot, rainy low part", "la parte baja, cálida y lluviosa"),
        "B": ("the dry low part", "la parte baja y seca"),
        "C": ("the mild low part", "la parte baja y templada"),
        "D": ("the cold low part", "la parte baja y fría"),
        "E": ("the very cold low part", "la parte baja y muy fría"),
    }[group]
    return Text(simple=word, scientific=f"Köppen {group}, model elevation below 1500 m",
                simple_es=word_es, scientific_es=f"Köppen {group}, elevación del modelo bajo 1500 m")


def suggest_parts(cells: list[Cell], bound: list[float] | None = None) -> list[HomogeneitySuggestion]:
    """Up to 3 smaller boxes, largest first, each itself one kind of place (project heuristic).

    Cells are grouped by (Koppen main group, high up = model elevation >= 1500 m). A group with at least 4 cells gets
    the bounding box of its cell centres plus half a cell on each side; the rules are re-run on every cell inside
    that box, and the box is kept only if the answer is "one kind". `bound` (the user's box) clips each suggestion so
    it never reaches outside the box the user chose."""
    groups: dict[tuple[str, bool], list[Cell]] = {}
    for c in cells:
        groups.setdefault((c.group, c.elev >= HIGH_UP_M), []).append(c)
    found: list[tuple[int, list[float], Text]] = []
    for (group, high), members in groups.items():
        if len(members) < SUGGEST_MIN_CELLS:
            continue
        w = min(c.lon for c in members) - CELL_LON / 2
        e = max(c.lon for c in members) + CELL_LON / 2
        s = min(c.lat for c in members) - CELL_LAT / 2
        n = max(c.lat for c in members) + CELL_LAT / 2
        if bound is not None:
            w, s, e, n = max(w, bound[0]), max(s, bound[1]), min(e, bound[2]), min(n, bound[3])
        inside = [c for c in cells if w <= c.lon <= e and s <= c.lat <= n]
        if len(inside) < SUGGEST_MIN_CELLS or _mixing(_reasons(inside)):
            continue
        mean_t = float(np.mean([c.t2m for c in members]))
        found.append((len(inside), [round(w, 2), round(s, 2), round(e, 2), round(n, 2)],
                      _part_name(group, high, mean_t)))
    found.sort(key=lambda f: (-f[0], f[1]))  # largest first; ties west to east
    out: list[HomogeneitySuggestion] = []
    seen_boxes: set[tuple[float, ...]] = set()
    seen_names: set[str] = set()
    for k, box, name in found:
        if tuple(box) in seen_boxes or name.simple in seen_names:
            continue  # same box twice, or two parts a child could not tell apart
        seen_boxes.add(tuple(box))
        seen_names.add(name.simple)
        out.append(HomogeneitySuggestion(bbox=box, name=name, n_cells=k))
        if len(out) == SUGGEST_MAX:
            break
    return out


# ---------------------------------------------------------------- verdict

def _sci_numbers(cells: list[Cell], counts: Counter) -> tuple[str, str]:
    pr, tt, el = [c.precip for c in cells], [c.t2m for c in cells], [c.elev for c in cells]
    groups = ", ".join(f"{g} {k}" for g, k in sorted(counts.items()))
    en = (f"{len(cells)} grid cells; Köppen main groups {groups}; model elevation {min(el):.0f}–{max(el):.0f} m; "
          f"annual precipitation {min(pr):.2f}–{max(pr):.2f} mm/day; annual T2M {min(tt):.1f}–{max(tt):.1f} °C "
          "(NASA POWER climatology, MERRA-2 based)")
    es = (f"{len(cells)} celdas; grupos de Köppen {groups}; elevación del modelo {min(el):.0f}–{max(el):.0f} m; "
          f"precipitación anual {min(pr):.2f}–{max(pr):.2f} mm/día; T2M anual {min(tt):.1f}–{max(tt):.1f} °C "
          "(climatología de NASA POWER, basada en MERRA-2)")
    return en, es


def evaluate(cells: list[Cell], bound: list[float] | None = None) -> Homogeneity:
    """The homogeneity verdict for these cells (long-term means only). `bound`: the user's box, to clip suggestions."""
    if not cells:
        raise ValueError("no cells")
    counts = Counter(c.group for c in cells)
    pr, tt, el = [c.precip for c in cells], [c.t2m for c in cells], [c.elev for c in cells]
    common = {
        "n_cells": len(cells), "precip_min": _round_all(min(pr), 2), "precip_max": _round_all(max(pr), 2),
        "t2m_min": _round_all(min(tt), 1), "t2m_max": _round_all(max(tt), 1),
        "elev_min": _round_all(min(el), 0), "elev_max": _round_all(max(el), 0), "climate_groups": dict(sorted(counts.items())),
    }
    sci_en, sci_es = _sci_numbers(cells, counts)
    if len(cells) == 1:
        return Homogeneity(kind="single_spot", **common, text=Text(
            simple="This is one map square. We can't see differences inside it.",
            scientific=f"Single grid cell, so no mixing inside the box is possible ({sci_en}).",
            simple_es="Esto es un solo cuadrado del mapa. No vemos diferencias dentro de él.",
            scientific_es=f"Una sola celda, así que no hay mezcla dentro del cuadro ({sci_es}).",
        ))
    reasons = _reasons(cells)
    if not _mixing(reasons):
        warm = " The temperature range rule applies, but alone it is not a regime change." if reasons else ""
        warm_es = " Se cumple la regla del rango de temperatura, pero sola no es un cambio de régimen." if reasons else ""
        return Homogeneity(kind="one_kind", **common, text=Text(
            simple="This box is one kind of place.",
            scientific=f"One kind of place: none of the regime rules (climate group, elevation, rain) applies ({sci_en}).{warm} {HEURISTIC_EN}",
            simple_es="Este cuadro es un solo tipo de lugar.",
            scientific_es=f"Un solo tipo de lugar: no se cumple ninguna regla de régimen (grupo climático, elevación, lluvia) ({sci_es}).{warm_es} {HEURISTIC_ES}",
        ))
    suggestions = suggest_parts(cells, bound)
    codes = ", ".join(r.code for r in reasons)
    return Homogeneity(kind="mixed", reasons=reasons, suggestions=suggestions, **common, text=Text(
        simple="This box mixes different kinds of places. Their changes can cancel out.",
        scientific=(f"Mixed (rules met: {codes}; {sci_en}). Averaging across regimes can cancel opposite trends. "
                    f"{HEURISTIC_EN}"),
        simple_es="Este cuadro mezcla distintos tipos de lugar. Sus cambios pueden anularse.",
        scientific_es=(f"Mezclado (reglas que se cumplen: {codes}; {sci_es}). Promediar regímenes distintos puede "
                       f"anular tendencias opuestas. {HEURISTIC_ES}"),
    ))


def single_spot() -> Homogeneity:
    """A point: one grid cell, nothing to mix. No network needed."""
    return Homogeneity(kind="single_spot", n_cells=1, text=Text(
        simple="This is one map square. We can't see differences inside it.",
        scientific="Single grid cell, so no mixing inside the box is possible.",
        simple_es="Esto es un solo cuadrado del mapa. No vemos diferencias dentro de él.",
        scientific_es="Una sola celda, así que no hay mezcla dentro del cuadro.",
    ))


def compute_homogeneity(cache_dir: Path, offline: bool, kind: str, bbox: list[float]) -> Homogeneity | None:
    """Homogeneity of a point or box region, or None when POWER climatology is unavailable (offline and not cached,
    network error, rejected request). Never raises."""
    try:
        if kind == "point":
            return single_spot()
        P.validate_geometry(kind, bbox)
        box = request_box(bbox)
        docs = [_load_doc(Path(cache_dir), offline, p, box) for p in PARAMS]
        if docs[0] is None or docs[1] is None:
            return None
        cells = cells_from_docs(docs[0], docs[1], bbox)
        return evaluate(cells, list(bbox)) if cells else None
    except Exception as exc:  # noqa: BLE001 - context only; a failure here must never break a scan
        log.warning("homogeneity check failed: %s", exc)
        return None
