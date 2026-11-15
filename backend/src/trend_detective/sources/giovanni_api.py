"""Live source: NASA Giovanni cloud time-series API (one grid cell per call).

    GET https://api.giovanni.earthdata.nasa.gov/timeseries
        ?data=<giovanni_id>&location=[<lat>,<lon>]&time=<start>/<end>        (Bearer token)

The reply is CSV: 13 `key,value` header lines (unit, undef, snapped cell centre ...), then
`Timestamp (UTC),Data` and one row per time step. Facts checked live:

* One point per call. A box is answered by calling every grid-cell centre of the product inside
  the box (cell size from the card, MERRA-2 is 0.5 x 0.625 degrees) and taking a cos(latitude)
  weighted mean over the cells that have data. A month counts only if at least half of the
  cells have a valid value. Too many calls -> `GiovanniBoxTooLarge` (never silent sub-sampling).
* The header's lat/lon is the snapped cell centre; we check it lies inside the requested box.
* Missing data is the header's `undef` (-9999, -9999.9, -1.26765e+30, 1e+15 ...): read as NaN.
  Land-only products (GLDAS) over the sea are all `undef`, which we report as "no data here".
* Daily and hourly products are averaged to months here, with a declared minimum of valid
  values (`min_valid_days` on the card; `MIN_HOURLY_VALID_SHARE` below). Hourly requests are
  split into chunks of at most 10 years, fetched in parallel and cached one file per chunk.
* Values stay in the card's NATIVE units (the engine applies scale/offset). A different unit in
  the CSV is an error, never a silent conversion.
* Network rules: 60 s timeout per call, at most 8 calls in flight. `TD_GIOVANNI_OFFLINE=1` means
  cache only, never the network.
* Two cache levels under `data/cache/giovanni/`. (1) `box/` and `point/`: the final monthly series
  plus provenance, one small JSON per id x box (or id x snapped cell centre), read first, offline
  included; these are committed so the demo needs no network. (2) `cells/`: the raw CSV per id x cell
  x chunk (hundreds to thousands per fine-grid box), git-ignored, a work area for rebuilding level 1.
  Network and HTTP failures raise `LiveSourceUnavailable`, so the app says "can't fetch right
  now" instead of crashing.
* The Earthdata token (`EARTHDATA_TOKEN`, else `TD_ENV_FILE`, else `backend/.env`) is only ever
  put in the Authorization header: it is never logged, cached or placed in an error message.
"""

from __future__ import annotations

import calendar
import http.client
import json
import logging
import math
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import numpy as np

from ..catalog import RegionCard, VariableCard
from ..contract import Provenance
from .base import LiveSourceUnavailable, RawSeries

log = logging.getLogger(__name__)

API = "https://api.giovanni.earthdata.nasa.gov"
USER_AGENT = "trend-detective/0.1"
TIMEOUT_S = 60
MAX_PARALLEL = 8
DEFAULT_MAX_CALLS = 36  # interactive requests; TD_GIOVANNI_MAX_CALLS raises it (precompute)
MIN_CELL_SHARE = 0.5  # a month needs at least this share of the box's cells to have a valid value
MIN_HOURLY_VALID_SHARE = 0.9  # hourly products: valid share of a month's hours (fixed before any result)
CHUNK_YEARS = 10  # hourly requests are split into chunks of at most this many years
QUOTA_WARN = 0.8
QUOTA_REFUSE = 0.95
QUOTA_RECHECK_S = 300
CONFIGURED_TTL_S = 7 * 86400
ENV_KEY = "EARTHDATA_TOKEN"
EDGE_EPS = 1e-6


class GiovanniBoxTooLarge(LiveSourceUnavailable):
    """The box needs more API calls than allowed. Say so; do not sub-sample the cells."""


class GiovanniUnitMismatch(LiveSourceUnavailable):
    """The CSV unit differs from the catalog card's native unit: refuse rather than mislabel."""


# --------------------------------------------------------------------------- paths and token


def _repo_root() -> Path:
    root = os.environ.get("TD_REPO_ROOT")
    return Path(root) if root else Path(__file__).resolve().parents[4]


def default_cache_dir() -> Path:
    return _repo_root() / "data" / "cache" / "giovanni"


def _num(x: float) -> str:
    """Compact, stable number for file names: -79 -> '-79', 0.125 -> '0.125'."""
    t = f"{round(float(x), 4):.4f}".rstrip("0").rstrip(".")
    return "0" if t in ("-0", "") else t


def read_env_file(path: Path) -> dict[str, str]:
    """Minimal KEY=VALUE parser: blank lines and # comments ignored, optional quotes, optional `export`."""
    out: dict[str, str] = {}
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError:
        return out
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip().removeprefix("export ").strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key:
            out[key] = value
    return out


def load_token() -> str | None:
    tok = os.environ.get(ENV_KEY, "").strip()
    if tok:
        return tok
    env_file = os.environ.get("TD_ENV_FILE")
    path = Path(env_file) if env_file else _repo_root() / "backend" / ".env"
    return read_env_file(path).get(ENV_KEY, "").strip() or None


def max_calls() -> int:
    raw = os.environ.get("TD_GIOVANNI_MAX_CALLS", "").strip()
    try:
        n = int(raw)
    except ValueError:
        return DEFAULT_MAX_CALLS
    return n if n > 0 else DEFAULT_MAX_CALLS


# --------------------------------------------------------------------------- parsing


@dataclass
class ParsedTimeseries:
    header: dict[str, str]
    stamps: list[str]  # "YYYY-MM-DD hh:mm"
    values: np.ndarray  # float64, undef and garbage -> NaN
    unit: str
    undef: float | None
    lat: float
    lon: float
    lat_res: float
    lon_res: float


def _float(text: str | None) -> float | None:
    try:
        return float(text) if text is not None else None
    except ValueError:
        return None


def is_undef(v: float, undef: float | None) -> bool:
    if not math.isfinite(v):
        return True
    if undef is None:
        return False
    return abs(v - undef) <= 1e-6 * max(abs(undef), 1.0) + 1e-9


def parse_timeseries(text: str) -> ParsedTimeseries:
    """Parse one Giovanni time-series CSV. Raises ValueError when it is not one (e.g. an error page)."""
    header: dict[str, str] = {}
    stamps: list[str] = []
    raw: list[str] = []
    in_data = False
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if not in_data:
            if line.lower().startswith("timestamp"):
                in_data = True
                continue
            key, sep, value = line.partition(",")  # values may hold commas: split on the first one only
            if sep:
                header[key.strip()] = value.strip()
            continue
        ts, sep, value = line.partition(",")
        if sep:
            stamps.append(ts.strip())
            raw.append(value.strip())
    if not in_data or not stamps and "unit" not in header:
        raise ValueError("not a Giovanni time-series CSV")
    lat, lon = _float(header.get("lat")), _float(header.get("lon"))
    if lat is None or lon is None or "unit" not in header:
        raise ValueError("Giovanni CSV header lacks lat, lon or unit")
    undef = _float(header.get("undef"))
    vals = np.full(len(raw), np.nan)
    for i, s in enumerate(raw):
        v = _float(s)
        if v is not None and not is_undef(v, undef):
            vals[i] = v
    return ParsedTimeseries(
        header=header, stamps=stamps, values=vals, unit=header["unit"], undef=undef, lat=lat, lon=lon,
        lat_res=_float(header.get("lat_resolution")) or 0.0, lon_res=_float(header.get("lon_resolution")) or 0.0,
    )


def normalize_unit(u: str) -> str:
    u = re.sub(r"[\s^]", "", u or "").lower().replace("²", "2").replace("³", "3")  # cm^2 and cm² are the same unit
    if u in ("", "1", "none", "dimensionless", "-", "unitless"):
        return "1"
    return "%" if u in ("%", "percent", "pct") else u  # AIRS humidity says 'percent' where the card says '%'


def check_unit(variable: VariableCard, csv_unit: str) -> None:
    if normalize_unit(csv_unit) != normalize_unit(variable.units.native):
        raise GiovanniUnitMismatch(
            f"{variable.giovanni_id}: Giovanni reports unit '{csv_unit}' but the catalog card "
            f"'{variable.id}' declares native unit '{variable.units.native}'; fix the card before using it"
        )


def to_months(
    stamps: list[str], values: np.ndarray, cadence: str, min_valid_days: int | None = None
) -> tuple[list[str], np.ndarray]:
    """Monthly values from monthly, daily or hourly rows. A month that fails its validity rule is NaN."""
    if not stamps:
        return [], np.array([])
    keys = np.array([s[:7] for s in stamps])
    months, inv = np.unique(keys, return_inverse=True)
    valid = np.isfinite(values)
    n_valid = np.bincount(inv, weights=valid.astype(float), minlength=len(months))
    sums = np.bincount(inv, weights=np.where(valid, values, 0.0), minlength=len(months))
    with np.errstate(invalid="ignore", divide="ignore"):
        means = sums / n_valid
    if cadence == "monthly":
        ok = n_valid >= 1
    elif cadence == "daily":
        if not min_valid_days:
            raise ValueError("a daily card needs min_valid_days (declared on the card before any result)")
        ok = n_valid >= min_valid_days
    elif cadence == "hourly":
        hours = np.array([calendar.monthrange(int(m[:4]), int(m[5:7]))[1] * 24 for m in months])
        ok = n_valid >= MIN_HOURLY_VALID_SHARE * hours
    else:  # pragma: no cover - the catalog Literal forbids it
        raise ValueError(f"unknown cadence {cadence}")
    return [str(m) for m in months], np.where(ok, means, np.nan)


# --------------------------------------------------------------------------- grid and plan


def _centres(lo: float, hi: float, step: float, offset: float) -> list[float]:
    """Cell centres (k + offset) * step inside [lo, hi]."""
    k0 = math.ceil(lo / step - offset - EDGE_EPS)
    k1 = math.floor(hi / step - offset + EDGE_EPS)
    return [round((k + offset) * step, 4) for k in range(k0, k1 + 1)]


def cell_steps(variable: VariableCard) -> tuple[float, float, float, float]:
    """(lat_step, lon_step, lat_offset, lon_offset). MERRA-2 is 0.5 x 0.625 with centres on the
    multiples of the step; the other products have centres half a cell in (AIRS 1 degree -> x.5)."""
    g = variable.grid_deg
    if (variable.giovanni_id or "").startswith("M2"):
        return 0.5, 0.625, 0.0, 0.0
    return g, g, 0.5, 0.5


def snap_point(variable: VariableCard, lat: float, lon: float) -> tuple[float, float]:
    """Centre of the product's grid cell that holds (lat, lon), using the card's grid (see cell_steps)."""
    lat_step, lon_step, lat_off, lon_off = cell_steps(variable)

    def snap(x: float, step: float, off: float) -> float:
        k = math.floor(x / step + EDGE_EPS - off + 0.5)  # nearest centre (k + off) * step
        return round((k + off) * step, 4)

    return snap(lat, lat_step, lat_off), snap(lon, lon_step, lon_off)


def plan_cells(variable: VariableCard, region: RegionCard) -> list[tuple[float, float]]:
    """(lat, lon) request points: the snapped cell centre of the point, or every cell centre of the
    product inside the box. A box smaller than one cell is answered by the cell at its centre."""
    geom = region.geometry
    w, s, e, n = geom.bbox
    if geom.kind == "point":
        return [snap_point(variable, s, w)]
    lat_step, lon_step, lat_off, lon_off = cell_steps(variable)
    lats = _centres(s, n, lat_step, lat_off)
    lons = _centres(w, e, lon_step, lon_off)
    if not lats or not lons:
        return [(round((s + n) / 2, 4), round((w + e) / 2, 4))]
    return [(la, lo) for la in lats for lo in lons]


def last_complete_year() -> int:
    return date.today().year - 1


def plan_chunks(cadence: str, record_start: str, end_year: int) -> list[tuple[str, str]]:
    """[(start, end)] as Giovanni time strings. Only hourly products are split (<= CHUNK_YEARS each)."""
    y0, m0 = int(record_start[:4]), int(record_start[5:7])
    if cadence != "hourly":
        return [(f"{y0:04d}-{m0:02d}-01T00:00:00", f"{end_year:04d}-12-31T23:59:59")]
    out = []
    ys = y0
    while ys <= end_year:
        ye = min(ys + CHUNK_YEARS - 1, end_year)
        start = f"{ys:04d}-{m0:02d}-01T00:00:00" if ys == y0 else f"{ys:04d}-01-01T00:00:00"
        out.append((start, f"{ye:04d}-12-31T23:59:59"))
        ys = ye + 1
    return out


def _tag(stamp: str) -> str:
    return stamp[:10].replace("-", "")


# --------------------------------------------------------------------------- the source


@dataclass
class _Cell:
    lat_req: float
    lon_req: float
    parsed: ParsedTimeseries | None = None
    months: list[str] = field(default_factory=list)
    values: np.ndarray = field(default_factory=lambda: np.array([]))


class GiovanniApiSource:
    kind = "giovanni_api"

    def __init__(self, cache_dir: Path | None = None, offline: bool | None = None, end_year: int | None = None):
        self.cache_dir = Path(cache_dir) if cache_dir else default_cache_dir()
        self._offline = offline
        self.end_year = end_year
        self._lock = threading.Lock()
        self._quota_checked = 0.0

    @property
    def offline(self) -> bool:
        return self._offline if self._offline is not None else os.environ.get("TD_GIOVANNI_OFFLINE") == "1"

    # -- network (tests replace _http) -------------------------------------
    def _http(self, url: str, token: str | None) -> tuple[int, str]:
        """GET -> (status, body). Network failures raise LiveSourceUnavailable (message never holds the token)."""
        headers = {"User-Agent": USER_AGENT}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        last: str = ""
        for attempt in range(2):
            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                    return resp.status, resp.read().decode("utf-8", "replace")
            except urllib.error.HTTPError as exc:
                body = ""
                try:
                    body = exc.read().decode("utf-8", "replace")
                except (OSError, http.client.HTTPException):
                    body = ""
                if exc.code < 500:
                    return exc.code, body
                last = f"HTTP {exc.code}"
            except TimeoutError:
                raise LiveSourceUnavailable(f"NASA Giovanni did not answer within {TIMEOUT_S} s") from None
            except (urllib.error.URLError, OSError, http.client.HTTPException) as exc:
                last = type(exc).__name__
            if attempt == 0:
                time.sleep(1.0)
        raise LiveSourceUnavailable(f"NASA Giovanni request failed ({last})")

    def _json(self, path: str, token: str | None) -> dict:
        status, body = self._http(f"{API}{path}", token)
        if status != 200:
            raise LiveSourceUnavailable(f"NASA Giovanni {path} answered HTTP {status}")
        try:
            return json.loads(body)
        except ValueError:
            raise LiveSourceUnavailable(f"NASA Giovanni {path} returned an unreadable reply") from None

    # -- configured variables and quota ------------------------------------
    def _configured_path(self) -> Path:
        return self.cache_dir / "configured_variables.json"

    def configured_ids(self) -> set[str] | None:
        """IDs the cloud API can serve (cached on disk). None offline when no list was ever cached."""
        path = self._configured_path()
        fresh = path.exists() and (self.offline or time.time() - path.stat().st_mtime < CONFIGURED_TTL_S)
        if not fresh and not self.offline:
            doc = self._json("/configured-variables/", None)
            ids = doc.get("configured_variables")
            if not isinstance(ids, list):
                raise LiveSourceUnavailable("NASA Giovanni returned no list of configured variables")
            self._write(path, json.dumps({"configured_variables": ids}))
            return set(map(str, ids))
        if path.exists():
            try:
                return set(map(str, json.loads(path.read_text(encoding="utf-8"))["configured_variables"]))
            except (OSError, ValueError, KeyError, TypeError):
                log.warning("unreadable Giovanni configured-variables cache")
        return None

    def _check_quota(self, token: str) -> None:
        with self._lock:
            if time.time() - self._quota_checked < QUOTA_RECHECK_S:
                return
            self._quota_checked = time.time()
        try:
            used = float(self._json("/quota", token).get("quota"))
        except (LiveSourceUnavailable, TypeError, ValueError):
            log.info("could not read the Giovanni quota; continuing")
            return
        if used > QUOTA_REFUSE:
            raise LiveSourceUnavailable(f"NASA Giovanni monthly quota is {used:.0%} used; live calls are paused")
        if used > QUOTA_WARN:
            log.warning("NASA Giovanni monthly quota is %.0f%% used", used * 100)

    # -- cache -----------------------------------------------------------------
    def _stem(self, gid: str, lat: float, lon: float) -> str:
        return f"{gid}__{lat:.4f}_{lon:.4f}"

    @property
    def cells_dir(self) -> Path:
        return self.cache_dir / "cells"

    def cache_path(self, gid: str, lat: float, lon: float, chunk: tuple[str, str]) -> Path:
        return self.cells_dir / f"{self._stem(gid, lat, lon)}__{_tag(chunk[0])}_{_tag(chunk[1])}.csv"

    def series_path(self, variable: VariableCard, region: RegionCard) -> Path:
        """Level-1 cache file: one per id x box, or id x snapped cell centre for a point."""
        geom = region.geometry
        if geom.kind == "point":
            lat, lon = snap_point(variable, geom.bbox[1], geom.bbox[0])
            return self.cache_dir / "point" / f"{variable.giovanni_id}__{_num(lat)}_{_num(lon)}.json"
        w, s, e, n = geom.bbox
        return self.cache_dir / "box" / f"{variable.giovanni_id}__{_num(w)}_{_num(s)}_{_num(e)}_{_num(n)}.json"

    def _read_series(self, path: Path, variable: VariableCard, region: RegionCard, end_year: int) -> RawSeries | None:
        """The cached final series, or None (missing, unreadable, or older than the wanted end year while online)."""
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
            if doc.get("giovanni_id") != variable.giovanni_id:
                return None
            if not self.offline and int(doc.get("end_year", 0)) < end_year:
                return None  # a new year of data exists: refetch
            check_unit(variable, doc["unit"])
            months = [str(m) for m in doc["months"]]
            vals = np.array([np.nan if v is None else float(v) for v in doc["values"]])
            prov = Provenance(**doc["provenance"])
        except FileNotFoundError:
            return None
        except (OSError, ValueError, KeyError, TypeError):
            log.warning("unreadable Giovanni series cache %s", path.name)
            return None
        if len(months) != len(vals):
            return None
        if region.geometry.kind == "point":  # a nearby click reuses the cell: report this request's own point
            prov = prov.model_copy(update={"requested_bbox": list(region.geometry.bbox)})
        return RawSeries(months=months, values=vals, provenance=prov)

    def _write_series(self, path: Path, variable: VariableCard, raw: RawSeries, end_year: int, meta: dict) -> None:
        doc = {
            "giovanni_id": variable.giovanni_id,
            "prod_name": meta.get("prod_name"),
            "doi": meta.get("doi"),
            "unit": meta.get("unit"),
            "end_year": end_year,
            "provenance": raw.provenance.model_dump(mode="json"),
            "months": raw.months,
            "values": [None if not math.isfinite(v) else float(v) for v in raw.values],
        }
        self._write(path, json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")

    def _write(self, path: Path, text: str) -> None:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(f".{os.getpid()}.{threading.get_ident()}.tmp")
            tmp.write_text(text, encoding="utf-8")
            os.replace(tmp, path)  # atomic: concurrent readers never see a half-written file
        except OSError as exc:
            log.warning("could not write Giovanni cache: %s", exc)

    def _read(self, path: Path) -> str | None:
        """Cached text, '' for a cached 'no data in this period', None when not cached."""
        for p, empty in ((path, False), (path.with_suffix(".nodata"), True)):
            if p.exists():
                if empty:
                    return ""
                try:
                    return p.read_text(encoding="utf-8")
                except OSError:
                    log.warning("unreadable Giovanni cache file %s", p.name)
        return None

    def _offline_texts(self, gid: str, lat: float, lon: float) -> list[str]:
        files = sorted(self.cells_dir.glob(f"{self._stem(gid, lat, lon)}__*.csv"))
        texts = []
        for p in files:
            try:
                texts.append(p.read_text(encoding="utf-8"))
            except OSError:
                log.warning("unreadable Giovanni cache file %s", p.name)
        return texts

    # -- one call -------------------------------------------------------------
    def _fetch_chunk(self, gid: str, lat: float, lon: float, chunk: tuple[str, str], token: str | None) -> str:
        """Raw CSV for one cell and period; '' when Giovanni has nothing in that period. Caches it."""
        if not token:  # callers check first; never send an unauthenticated request
            raise LiveSourceUnavailable("no Earthdata token")
        q = urllib.parse.urlencode(
            {"data": gid, "location": f"[{lat},{lon}]", "time": f"{chunk[0]}/{chunk[1]}"}, safe="[],:/")
        status, body = self._http(f"{API}/timeseries?{q}", token)
        path = self.cache_path(gid, lat, lon, chunk)
        if status == 200:
            try:
                parse_timeseries(body)
            except ValueError as exc:
                raise LiveSourceUnavailable(f"NASA Giovanni returned an unreadable reply for {gid}: {exc}") from None
            self._write(path, body)
            return body
        if status == 404:  # nothing in this period (e.g. before the product starts)
            self._write(path.with_suffix(".nodata"), "")
            return ""
        code = ""
        try:
            code = str(json.loads(body).get("code", ""))
        except (ValueError, AttributeError):
            pass
        if status in (401, 403) and code in ("401", "403", ""):
            raise LiveSourceUnavailable("NASA Giovanni rejected the Earthdata token (missing, wrong or expired)")
        if status == 429:
            raise LiveSourceUnavailable("NASA Giovanni says too many requests; try again in a moment")
        raise LiveSourceUnavailable(f"NASA Giovanni rejected the request for {gid} (HTTP {status})")

    # -- SeriesSource -----------------------------------------------------
    def fetch(self, variable: VariableCard, region: RegionCard) -> RawSeries | None:
        gid = variable.giovanni_id
        if not gid:
            return None
        end_year = self.end_year or last_complete_year()
        if variable.record_end:
            end_year = min(end_year, int(variable.record_end[:4]))
        path = self.series_path(variable, region)
        hit = self._read_series(path, variable, region, end_year)
        if hit is not None:
            return hit
        ids = self.configured_ids()
        if ids is not None and gid not in ids:
            return None
        meta: dict = {}
        raw = self._fetch_cells(variable, region, gid, end_year, meta)
        if raw is not None and meta:
            self._write_series(path, variable, raw, end_year, meta)
        return raw

    def _fetch_cells(
        self, variable: VariableCard, region: RegionCard, gid: str, end_year: int, meta: dict
    ) -> RawSeries | None:
        geom = region.geometry
        cadence = variable.cadence
        chunks = plan_chunks(cadence, variable.record_start, end_year)
        points = plan_cells(variable, region)
        cells = [_Cell(la, lo) for la, lo in points]

        # 1. gather raw texts per cell (cache first, then the network)
        texts: dict[tuple[int, int], str] = {}
        missing: list[tuple[int, int]] = []
        for ci, cell in enumerate(cells):
            if self.offline:
                for k, t in enumerate(self._offline_texts(gid, cell.lat_req, cell.lon_req)):
                    texts[(ci, k)] = t
                continue
            for ki, chunk in enumerate(chunks):
                hit = self._read(self.cache_path(gid, cell.lat_req, cell.lon_req, chunk))
                if hit is None:
                    missing.append((ci, ki))
                else:
                    texts[(ci, ki)] = hit
        if missing:
            cap = max_calls()
            if len(missing) > cap:
                grid = f"{variable.grid_deg:g}"
                raise GiovanniBoxTooLarge(
                    f"box too large for a {grid}° product ({len(missing)} requests needed, limit {cap}); "
                    "pick a point or a smaller box")
            token = load_token()
            if not token:  # not configured: behave like a source without this series (the app says "no data")
                log.warning("no Earthdata token (%s, TD_ENV_FILE or backend/.env): live Giovanni data is off", ENV_KEY)
                return None
            self._check_quota(token)
            self._run(gid, cells, chunks, missing, token, texts)

        # 2. parse each cell into months
        used: list[_Cell] = []
        dropped: list[str] = []
        for ci, cell in enumerate(cells):
            keys = sorted(k for (c, k) in texts if c == ci)
            parsed = [parse_timeseries(texts[(ci, k)]) for k in keys if texts[(ci, k)].strip()]
            if not parsed:
                used.append(cell)  # no data from this cell: counts as an invalid cell
                continue
            for p in parsed:
                check_unit(variable, p.unit)
            stamps = [s for p in parsed for s in p.stamps]
            values = np.concatenate([p.values for p in parsed])
            if len(parsed) > 1:  # chunks (or several cached spans offline): drop repeated timestamps
                _, first = np.unique(np.array(stamps[::-1]), return_index=True)
                keep = np.sort(len(stamps) - 1 - first)
                stamps, values = [stamps[i] for i in keep], values[keep]
            cell.parsed = parsed[0]
            cell.months, cell.values = to_months(stamps, values, cadence, variable.min_valid_days)
            if geom.kind != "point" and len(points) > 1 and not self._inside(cell.parsed, geom.bbox):
                dropped.append(f"({cell.parsed.lat:g}, {cell.parsed.lon:g})")
                continue
            used.append(cell)

        # 3. a box: weighted mean over valid cells, month by month
        seen: set[tuple[float, float]] = set()
        unique: list[_Cell] = []
        for c in used:  # two requests may snap to the same cell: count it once
            key = (round(c.parsed.lat, 4), round(c.parsed.lon, 4)) if c.parsed else (c.lat_req, c.lon_req)
            if key not in seen:
                seen.add(key)
                unique.append(c)
        if not any(c.parsed is not None and np.isfinite(c.values).any() for c in unique):
            return None
        months = sorted({m for c in unique for m in c.months})
        index = {m: i for i, m in enumerate(months)}
        num = np.zeros(len(months))
        den = np.zeros(len(months))
        cnt = np.zeros(len(months))
        for c in unique:
            if c.parsed is None:
                continue
            w = math.cos(math.radians(c.parsed.lat))
            for m, v in zip(c.months, c.values):
                if math.isfinite(v):
                    i = index[m]
                    num[i] += w * v
                    den[i] += w
                    cnt[i] += 1
        total = len(unique)
        ok = (cnt >= 1) & (cnt >= MIN_CELL_SHARE * total)
        vals = np.where(ok, num / np.where(den > 0, den, 1.0), np.nan)
        if not np.isfinite(vals).any():
            return None
        got = next(c for c in unique if c.parsed is not None and np.isfinite(c.values).any())
        meta.update(prod_name=got.parsed.header.get("prod_name"), doi=got.parsed.header.get("doi"),
                    unit=got.parsed.unit)
        return RawSeries(
            months=months,
            values=vals,
            provenance=self._provenance(variable, geom.kind, geom.bbox, unique, dropped, cadence),
        )

    @staticmethod
    def _inside(p: ParsedTimeseries, bbox: list[float]) -> bool:
        w, s, e, n = bbox
        return (w - EDGE_EPS <= p.lon <= e + EDGE_EPS) and (s - EDGE_EPS <= p.lat <= n + EDGE_EPS)

    def _run(self, gid, cells, chunks, missing, token, texts) -> None:
        """Fetch the missing (cell, chunk) pairs in parallel. All finish (and cache) before any error is raised."""
        def one(job: tuple[int, int]) -> tuple[tuple[int, int], str]:
            ci, ki = job
            return job, self._fetch_chunk(gid, cells[ci].lat_req, cells[ci].lon_req, chunks[ki], token)

        errors: list[Exception] = []
        with ThreadPoolExecutor(max_workers=min(MAX_PARALLEL, len(missing))) as pool:
            futures = [pool.submit(one, j) for j in missing]
            for f in futures:
                try:
                    job, text = f.result()
                    texts[job] = text
                except LiveSourceUnavailable as exc:
                    errors.append(exc)
        if errors:
            raise errors[0]

    def _provenance(self, variable, kind, bbox, cells: list[_Cell], dropped: list[str], cadence: str) -> Provenance:
        got = [c for c in cells if c.parsed is not None and np.isfinite(c.values).any()]
        p0 = got[0].parsed
        lats = [c.parsed.lat for c in got]
        lons = [c.parsed.lon for c in got]
        half_lat = max(c.parsed.lat_res for c in got) / 2
        half_lon = max(c.parsed.lon_res for c in got) / 2
        name = p0.header.get("param_name") or variable.giovanni_id
        title = f"NASA Giovanni {p0.header.get('prod_name', '')} {name}".replace("  ", " ").strip()
        if cadence != "monthly":
            title += f"; monthly mean of {cadence} values"
        if len(cells) > 1:
            title += f"; cos(latitude)-weighted mean of {len(got)} of {len(cells)} grid cells with data"
        elif kind != "point":
            title += "; box smaller than one grid cell, so the cell at its centre was used"
        if dropped:
            title += f"; left out cells outside the box: {', '.join(dropped)}"
        return Provenance(
            source_kind=self.kind,
            source_ref=variable.giovanni_id,
            title=title,
            requested_bbox=list(bbox),
            data_bbox=[round(x, 4) for x in (min(lons) - half_lon, min(lats) - half_lat, max(lons) + half_lon, max(lats) + half_lat)],
            n_cells=len(got),
            retrieved_at=date.today().isoformat(),
        )
