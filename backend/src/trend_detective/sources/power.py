"""Live source: NASA POWER monthly data (MERRA-2-based), for any point or box up to 10° x 10°.

Network rules: stdlib HTTP only, 60 s timeout, one retry, never raises into the engine
(failures are logged and `fetch` returns None). Raw JSON responses are cached on disk so
pre-loaded regions work offline. `TD_POWER_OFFLINE=1` means cache only.

POWER behaviour (checked live): the regional endpoint needs a box of at least 2° in each
direction and allows one parameter per request; smaller boxes use the point endpoint at the
box centre (said so in the provenance title). The annual value is stored under key YYYY13
and is dropped. Fill value is -999.
"""

from __future__ import annotations

import http.client
import json
import logging
import math
import os
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

import numpy as np

from ..catalog import RegionCard, VariableCard
from ..contract import Provenance
from .base import LiveSourceUnavailable, RawSeries, area_mean, check_unit

log = logging.getLogger(__name__)

BASE = "https://power.larc.nasa.gov/api/temporal/monthly"
USER_AGENT = "trend-detective/0.1"
TIMEOUT_S = 60
MAX_SPAN_DEG = 10.0
MIN_REGIONAL_SPAN_DEG = 2.0
MIN_POINT_SHARE = 0.5  # a month needs at least half the grid points with a value (same rule as Giovanni boxes)
FIRST_YEAR = 1981


def default_cache_dir() -> Path:
    root = os.environ.get("TD_REPO_ROOT")
    base = Path(root) if root else Path(__file__).resolve().parents[4]
    return base / "data" / "cache" / "power"


class PowerRequestRejected(Exception):
    """NASA POWER answered 4xx: the request itself is not servable (treated as 'no data')."""


def _http_get_json(url: str) -> dict:
    last: Exception | None = None
    for attempt in range(2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            last = exc
            if 400 <= exc.code < 500:
                raise PowerRequestRejected(f"NASA POWER rejected the request: HTTP {exc.code}") from exc
        except (urllib.error.URLError, TimeoutError, OSError, ValueError, http.client.HTTPException) as exc:
            last = exc  # network error, timeout, truncated or garbled reply
        if attempt == 0:
            time.sleep(1.0)
    raise LiveSourceUnavailable(f"NASA POWER request failed: {last}")


def validate_geometry(kind: str, bbox: list[float]) -> None:
    if len(bbox) != 4 or not all(math.isfinite(x) for x in bbox):
        raise ValueError("bbox must be four finite numbers: W, S, E, N")
    w, s, e, n = bbox
    if not (-180 <= w <= 180 and -180 <= e <= 180):
        raise ValueError("longitude must be between -180 and 180")
    if not (-90 <= s <= 90 and -90 <= n <= 90):
        raise ValueError("latitude must be between -90 and 90")
    if kind == "point":
        if (w, s) != (e, n):
            raise ValueError("a point needs lon,lat,lon,lat")
        return
    if not w < e or not s < n:
        raise ValueError("box needs west < east and south < north")
    if e - w > MAX_SPAN_DEG or n - s > MAX_SPAN_DEG:
        raise ValueError(f"box is too big: at most {MAX_SPAN_DEG:g} degrees in each direction")


def last_complete_year() -> int:
    return date.today().year - 1


def parse_power_points(doc: dict, param: str) -> list[tuple[float, float, dict[str, float]]]:
    """[(lon, lat, {month: value})] per grid point; fill values become NaN, the annual YYYY13 is dropped."""
    fill = float((doc.get("header") or {}).get("fill_value", -999.0))
    feats = doc.get("features") if doc.get("type") == "FeatureCollection" else [doc]
    points: list[tuple[float, float, dict[str, float]]] = []
    for f in feats or []:
        series = ((f.get("properties") or {}).get("parameter") or {}).get(param)
        if not series:
            continue
        lon, lat = f["geometry"]["coordinates"][:2]
        vals: dict[str, float] = {}
        for key, v in series.items():
            if len(key) != 6 or key.endswith("13"):
                continue
            v = float(v)
            if v == fill or v <= -990.0 or not math.isfinite(v):
                v = float("nan")
            vals[f"{key[:4]}-{key[4:]}"] = v
        points.append((float(lon), float(lat), vals))
    return points


def parse_power(doc: dict, param: str) -> tuple[dict[str, list[float]], list[list[float]]]:
    """Return ({month: [value per grid point]}, [[lon, lat] per point]); fill values become NaN, YYYY13 dropped."""
    by_month: dict[str, list[float]] = {}
    coords: list[list[float]] = []
    for lon, lat, vals in parse_power_points(doc, param):
        coords.append([lon, lat])
        for m, v in vals.items():
            by_month.setdefault(m, []).append(v)
    return by_month, coords


def reported_unit(doc: dict, param: str) -> str | None:
    """The unit NASA POWER states for the parameter (e.g. 'C', 'mm/day', '%', 'dimensionless')."""
    info = (doc.get("parameters") or {}).get(param) or {}
    return info.get("units") if isinstance(info, dict) else None


class PowerSource:
    kind = "nasa_power"

    def __init__(self, cache_dir: Path | None = None, offline: bool | None = None, end_year: int | None = None):
        self.cache_dir = Path(cache_dir) if cache_dir else default_cache_dir()
        self._offline = offline
        self.end_year = end_year

    @property
    def offline(self) -> bool:
        return self._offline if self._offline is not None else os.environ.get("TD_POWER_OFFLINE") == "1"

    # -- request building -------------------------------------------------
    @staticmethod
    def _plan(kind: str, bbox: list[float]) -> tuple[str, list[float]]:
        """('point', [lon, lat]) or ('regional', [W, S, E, N])."""
        w, s, e, n = bbox
        if kind == "point":
            return "point", [round(w, 2), round(s, 2)]
        if e - w < MIN_REGIONAL_SPAN_DEG or n - s < MIN_REGIONAL_SPAN_DEG:
            return "point", [round((w + e) / 2, 2), round((s + n) / 2, 2)]
        return "regional", [round(x, 2) for x in bbox]

    @staticmethod
    def _url(endpoint: str, param: str, c: list[float], start: int, end: int) -> str:
        if endpoint == "point":
            where = f"latitude={c[1]}&longitude={c[0]}"
        else:
            where = f"latitude-min={c[1]}&latitude-max={c[3]}&longitude-min={c[0]}&longitude-max={c[2]}"
        return (f"{BASE}/{endpoint}?parameters={param}&community=RE&{where}"
                f"&start={start}&end={end}&format=JSON")

    def _stem(self, endpoint: str, param: str, c: list[float]) -> str:
        return f"{endpoint}_{param}_" + "_".join(f"{x:.2f}" for x in c)

    def cache_path(self, endpoint: str, param: str, c: list[float], start: int, end: int) -> Path:
        return self.cache_dir / f"{self._stem(endpoint, param, c)}_{start}_{end}.json"

    def _load(self, endpoint: str, param: str, c: list[float], start: int, end: int) -> tuple[dict, str] | None:
        path = self.cache_path(endpoint, param, c, start, end)
        url = self._url(endpoint, param, c, start, end)
        if not path.exists() and self.offline:
            # any cached span for the same place and parameter will do; take the latest end year
            hits = sorted(self.cache_dir.glob(f"{self._stem(endpoint, param, c)}_*_*.json"),
                          key=lambda p: p.stem.rsplit("_", 1)[1])
            if hits:
                path = hits[-1]
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8")), url
            except (OSError, ValueError):
                log.warning("unreadable POWER cache file %s", path.name)
        if self.offline:
            return None
        try:
            doc = _http_get_json(url)
        except PowerRequestRejected as exc:
            log.warning("%s", exc)
            return None
        # LiveSourceUnavailable propagates on purpose: it must not be cached as 'no data'.
        if "features" not in doc and doc.get("type") != "Feature":
            log.warning("NASA POWER returned no data: %s", str(doc.get("messages"))[:200])
            return None
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(f".{os.getpid()}.tmp")
            tmp.write_text(json.dumps(doc), encoding="utf-8")
            os.replace(tmp, path)  # atomic: concurrent readers never see a half-written file
        except OSError as exc:
            log.warning("could not write POWER cache: %s", exc)
        return doc, url

    # -- SeriesSource -----------------------------------------------------
    def fetch(self, variable: VariableCard, region: RegionCard) -> RawSeries | None:
        param = variable.power_param
        if not param:
            return None
        geom = region.geometry
        validate_geometry(geom.kind, geom.bbox)
        endpoint, c = self._plan(geom.kind, geom.bbox)
        end = self.end_year or last_complete_year()
        loaded = self._load(endpoint, param, c, FIRST_YEAR, end)
        if loaded is None:
            return None
        doc, url = loaded
        unit = reported_unit(doc, param)
        if unit is not None:  # a different unit is an error, never a silent conversion
            check_unit("NASA POWER", variable.id, variable.units.native, unit)
        try:
            points = parse_power_points(doc, param)
        except (KeyError, TypeError, ValueError) as exc:
            log.warning("could not parse NASA POWER response: %s", exc)
            return None
        if not points:
            return None
        coords = [[lon, lat] for lon, lat, _ in points]
        # Same cos(latitude)-weighted, composition-robust mean as the Giovanni API source (base.area_mean).
        months, vals = area_mean(
            [(lat, list(v), np.array(list(v.values()), dtype=np.float64)) for _, lat, v in points],
            n_total=len(points), min_share=MIN_POINT_SHARE)
        if not months:
            return None
        lons = [p[0] for p in coords]
        lats = [p[1] for p in coords]
        title = f"NASA POWER monthly {param} (MERRA-2-based)"
        if geom.kind != "point" and endpoint == "point":
            title += f"; box smaller than {MIN_REGIONAL_SPAN_DEG:g} degrees, so the grid cell at its centre was used"
        elif endpoint == "regional":
            title += f"; cos(latitude)-weighted mean of {len(coords)} grid points"
            if geom.kind == "shape":
                title += " over the shape's bounding box"
        return RawSeries(
            months=months,
            values=vals,
            provenance=Provenance(
                source_kind=self.kind,
                source_ref=url,
                title=title,
                requested_bbox=list(geom.bbox),
                data_bbox=[min(lons), min(lats), max(lons), max(lats)],
                n_cells=len(coords),
            ),
        )


# --- long-term averages on a map ("where does it happen?"): the POWER climatology regional endpoint ---

CLIMATOLOGY_BASE = "https://power.larc.nasa.gov/api/temporal/climatology/regional"

# param -> units NASA POWER reports, units we show, [lat, lon] cell size in degrees, source label.
# T2M and PRECTOTCORR are MERRA-2 (0.5 x 0.625 degree grid); AOD_55 is CERES SYN1deg (1 x 1 degree grid).
# Checked live: all three answer on this endpoint.
CLIMATOLOGY_PARAMS: dict[str, dict] = {
    "T2M": {"reported": "C", "units": "°C", "cell_deg": [0.5, 0.625],
            "source": "NASA POWER (MERRA-2 computer model), long-term average"},
    "PRECTOTCORR": {"reported": "mm/day", "units": "mm/day", "cell_deg": [0.5, 0.625],
                    "source": "NASA POWER (MERRA-2 computer model), long-term average"},
    "AOD_55": {"reported": "dimensionless", "units": "", "cell_deg": [1.0, 1.0],
               "source": "NASA POWER (CERES SYN1deg computer estimate), long-term average"},
}
MIN_CLIMATOLOGY_SPAN_DEG = 2.0


def climatology_cache_path(param: str, bbox: list[float] | tuple[float, ...], cache_dir: Path | None = None) -> Path:
    """data/cache/power/clim_regional_<P>_<W>_<S>_<E>_<N>.json, numbers as %.2f (other code shares these files)."""
    base = Path(cache_dir) if cache_dir else default_cache_dir()
    return base / (f"clim_regional_{param}_" + "_".join(f"{x:.2f}" for x in bbox) + ".json")


def validate_climatology_bbox(bbox: list[float] | tuple[float, ...]) -> None:
    validate_geometry("bbox", list(bbox))  # finite, ordered, at most 10 degrees a side
    w, s, e, n = bbox
    if e - w < MIN_CLIMATOLOGY_SPAN_DEG or n - s < MIN_CLIMATOLOGY_SPAN_DEG:
        raise ValueError(f"box is too small: at least {MIN_CLIMATOLOGY_SPAN_DEG:g} degrees in each direction")


def parse_climatology(doc: dict, param: str) -> list[list[float]]:
    """[[lon, lat, annual value]] per grid cell; fill values and cells without an annual value are skipped."""
    fill = float((doc.get("header") or {}).get("fill_value", -999.0))
    cells: list[list[float]] = []
    for f in doc.get("features") or []:
        ann = (((f.get("properties") or {}).get("parameter") or {}).get(param) or {}).get("ANN")
        if ann is None:
            continue
        v = float(ann)
        if v == fill or v <= -990.0 or not math.isfinite(v):
            continue
        lon, lat = f["geometry"]["coordinates"][:2]
        cells.append([float(lon), float(lat), round(v, 3)])
    return cells


def fetch_climatology(param: str, bbox: list[float] | tuple[float, ...], cache_dir: Path | None = None,
                      offline: bool | None = None) -> dict:
    """The long-term (annual mean) value of `param` for each grid cell in the box.

    Raises LiveSourceUnavailable when NASA POWER cannot be reached (or no cache and offline) and ValueError when
    the request itself is not servable. Returns {param, units, source, cells, cell_deg}.
    """
    spec = CLIMATOLOGY_PARAMS[param]
    validate_climatology_bbox(bbox)
    is_offline = offline if offline is not None else os.environ.get("TD_POWER_OFFLINE") == "1"
    path = climatology_cache_path(param, bbox, cache_dir)
    doc: dict | None = None
    if path.exists():
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            log.warning("unreadable POWER cache file %s", path.name)
    if doc is None:
        if is_offline:
            raise LiveSourceUnavailable("NASA POWER climatology is not cached and the server is offline")
        w, s, e, n = (round(x, 2) for x in bbox)
        url = (f"{CLIMATOLOGY_BASE}?parameters={param}&community=ag"
               f"&longitude-min={w}&longitude-max={e}&latitude-min={s}&latitude-max={n}&format=json")
        try:
            doc = _http_get_json(url)
        except PowerRequestRejected as exc:
            raise ValueError(str(exc)) from exc
        if "features" not in doc:
            raise LiveSourceUnavailable("NASA POWER returned no climatology")
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(f".{os.getpid()}.tmp")
            tmp.write_text(json.dumps(doc), encoding="utf-8")
            os.replace(tmp, path)  # atomic: concurrent readers never see a half-written file
        except OSError as exc:
            log.warning("could not write POWER cache: %s", exc)
    reported = reported_unit(doc, param)
    if reported is not None and reported != spec["reported"]:
        raise LiveSourceUnavailable(f"NASA POWER reported {param} in '{reported}', expected '{spec['reported']}'")
    try:
        cells = parse_climatology(doc, param)
    except (KeyError, TypeError, ValueError) as exc:
        raise LiveSourceUnavailable(f"could not parse NASA POWER climatology: {exc}") from exc
    return {"param": param, "units": spec["units"], "source": spec["source"], "cells": cells,
            "cell_deg": list(spec["cell_deg"])}
