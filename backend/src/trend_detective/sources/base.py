"""Series sources: the seam that makes data access swappable.

The engine never knows where data comes from. It asks a `SeriesSource` for a
variable over a region and gets a `RawSeries` (native units, monthly, NaN for
missing) plus provenance. Today: local Giovanni CSV exports. Later: a live
Giovanni/Earthdata fetcher, user uploads, a cache wrapper -- each one is a new
class implementing `fetch`, registered in a `SourceChain`. Nothing else changes.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Protocol, runtime_checkable

import numpy as np

from ..catalog import RegionCard, VariableCard
from ..contract import Provenance


class LiveSourceUnavailable(RuntimeError):
    """A live source could not be reached (network error, timeout, 5xx). Never cache this
    as 'no data': the API answers 503 so the front end can say 'live data is down'."""


class UnitMismatch(LiveSourceUnavailable):
    """The source reports a different unit from the catalog card: never converted silently."""


def normalize_unit(u: str) -> str:
    """Spelling-insensitive unit key: 'cm^2' == 'cm²', 'percent' == '%', 'C' == '°C', 'dimensionless' == '1'."""
    u = re.sub(r"[\s^]", "", u or "").lower().replace("²", "2").replace("³", "3")
    if u in ("", "1", "none", "dimensionless", "-", "unitless"):
        return "1"
    if u in ("c", "°c", "degc", "degreec", "degreesc", "celsius"):
        return "°c"
    return "%" if u in ("%", "percent", "pct") else u


def check_unit(source: str, card_id: str, card_native: str, reported: str) -> None:
    if normalize_unit(reported) != normalize_unit(card_native):
        raise UnitMismatch(
            f"{source}: the source reports unit '{reported}' but the catalog card '{card_id}' declares native "
            f"unit '{card_native}'; fix the card before using it")


MIN_CELLS_PER_CALENDAR_MONTH = 3  # a cell's seasonal cycle needs at least this many values per calendar month


def area_mean(
    cells: list[tuple[float, list[str], np.ndarray]], n_total: int, min_share: float
) -> tuple[list[str], np.ndarray]:
    """cos(latitude)-weighted box mean that a changing set of cells cannot bias.

    cells: (lat, months "YYYY-MM", values) per grid cell that answered. n_total: cells in the box, including
    the ones that returned nothing (they count as missing). A month is kept when at least
    max(1, min_share * n_total) cells have a value.

    Plain averaging is biased when cells drop in and out: if a wet cell is missing in later years, the
    box looks drier although nothing changed. So each cell's own monthly seasonal cycle is removed, the
    cell departures are averaged over the cells present that month, and the box's seasonal cycle
    (weighted mean of the cells' cycles) is added back. With every cell present this equals the plain
    weighted mean exactly; with gaps it compares each cell only with itself (the standard
    climate-anomaly method). A cell whose seasonal cycle cannot be estimated for a calendar month is left
    out for that calendar month; if no cell can, the plain weighted mean is used for that month."""
    if not cells:
        return [], np.array([])
    months = sorted({m for _, ms, _ in cells for m in ms})
    col = {m: i for i, m in enumerate(months)}
    V = np.full((len(cells), len(months)), np.nan)
    for r, (_, ms, vs) in enumerate(cells):
        V[r, [col[m] for m in ms]] = np.asarray(vs, dtype=np.float64)
    w = np.array([math.cos(math.radians(lat)) for lat, _, _ in cells])[:, None]
    cal = np.array([int(m[5:7]) for m in months])
    valid = np.isfinite(V)
    need = max(1.0, min_share * n_total)
    ok = valid.sum(axis=0) >= need

    plain = _wmean(V, w)
    if len(cells) == 1:
        return months, np.where(ok, plain, np.nan)
    clim = np.full((len(cells), 13), np.nan)
    for m in range(1, 13):
        sub = V[:, cal == m]
        fin = np.isfinite(sub)
        cnt = fin.sum(axis=1)
        total = np.where(fin, sub, 0.0).sum(axis=1)
        clim[:, m] = np.where(cnt >= MIN_CELLS_PER_CALENDAR_MONTH, total / np.maximum(cnt, 1), np.nan)
    C = clim[:, cal]  # each cell's cycle at each month
    box_clim = _wmean(C, w)
    out = box_clim + _wmean(V - C, w)
    out = np.where(np.isfinite(out), out, plain)
    return months, np.where(ok, out, np.nan)


def _wmean(X: np.ndarray, w: np.ndarray) -> np.ndarray:
    """Column-wise weighted mean over finite entries (NaN where none)."""
    fin = np.isfinite(X)
    num = np.where(fin, X * w, 0.0).sum(axis=0)
    den = np.where(fin, w, 0.0).sum(axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(den > 0, num / np.where(den > 0, den, 1.0), np.nan)


@dataclass
class RawSeries:
    months: list[str]  # "YYYY-MM", strictly increasing, may have gaps
    values: np.ndarray  # float64, native units, NaN = missing
    provenance: Provenance


@runtime_checkable
class SeriesSource(Protocol):
    kind: str

    def fetch(self, variable: VariableCard, region: RegionCard) -> RawSeries | None:
        """Return the series, or None if this source does not have it."""
        ...


class SourceChain:
    """Ask each source in order; the first one that has the series wins."""

    def __init__(self, sources: list[SeriesSource]):
        self.sources = sources

    def fetch(self, variable: VariableCard, region: RegionCard) -> RawSeries | None:
        for src in self.sources:
            series = src.fetch(variable, region)
            if series is not None:
                return series
        return None

    def all_fill(self, variable: VariableCard, region: RegionCard) -> bool:
        """True when a source answered for this variable and region with fill values only (it has the
        place, but nothing measured there), as opposed to 'not fetched / not saved'."""
        return any(getattr(src, "all_fill", lambda *_: False)(variable, region) for src in self.sources)
