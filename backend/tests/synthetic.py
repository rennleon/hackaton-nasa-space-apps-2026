"""Synthetic monthly series and a fake source, so engine tests do not depend on data files."""

from __future__ import annotations

import threading
import time

import numpy as np

from trend_detective.catalog import Catalog, RegionCard, VariableCard
from trend_detective.contract import Provenance
from trend_detective.engine import EngineContext, repo_root
from trend_detective.sources import LiveSourceUnavailable, RawSeries, SourceChain
from trend_detective.timeutil import month_range


def make_raw(start: str, end: str, slope_per_decade: float = 0.0, sd: float = 0.3, seed: int = 0,
             base: float = 15.0, nan_share: float = 0.0, kink: tuple[float, float] | None = None) -> RawSeries:
    """Seasonal cycle + linear trend + white noise, native units (the catalog's scale/offset apply later).
    `kink` = (year, slope_per_decade_before): a different slope before that year, continuous at it."""
    months = month_range(start, end)
    rng = np.random.default_rng(seed)
    t = np.array([int(m[:4]) + (int(m[5:7]) - 0.5) / 12 for m in months])
    cal = np.array([int(m[5:7]) for m in months])
    trend = slope_per_decade / 10 * (t - t[0])
    if kink:
        yr, before = kink
        trend = np.where(
            t < yr, before / 10 * (t - yr) + slope_per_decade / 10 * (yr - t[0]), slope_per_decade / 10 * (t - t[0])
        )
    vals = base + 3 * np.sin(2 * np.pi * (cal - 1) / 12) + rng.normal(0, sd, len(months)) + trend
    if nan_share:
        vals[rng.random(len(vals)) < nan_share] = np.nan
    return RawSeries(months, vals, Provenance(source_kind="synthetic", source_ref="synthetic"))


class FakeSource:
    """Serves RawSeries by variable id; None = no data; an Exception value is raised (live outage)."""

    kind = "fake"

    def __init__(self, data: dict, delay: float = 0.0):
        self.data = data
        self.delay = delay
        self.calls: list[str] = []
        self._lock = threading.Lock()
        self.active = 0
        self.max_active = 0

    def fetch(self, variable: VariableCard, region: RegionCard):
        with self._lock:
            self.calls.append(variable.id)
            self.active += 1
            self.max_active = max(self.max_active, self.active)
        try:
            if self.delay:
                time.sleep(self.delay)
            item = self.data.get(variable.id)
            if isinstance(item, Exception):
                raise item
            return item
        finally:
            with self._lock:
                self.active -= 1


def make_ctx(data: dict, delay: float = 0.0, pair: tuple[str, str] | None = ("power_t2m", "airs_t_surf_day")):
    """Context over the real catalog with the fake source. `pair` is declared as a cross-check both ways
    so tests do not depend on how the catalog currently wires partners."""
    cat = Catalog.load(repo_root() / "catalog")
    if pair:
        a, b = pair
        cat.variables[a].cross_check = b
        cat.variables[b].cross_check = a
    src = FakeSource(data, delay)
    return EngineContext(cat, SourceChain([src])), src


def point_region():
    from trend_detective.api import custom_region

    return custom_region("point", (-78.5, -7.16))


LIVE_DOWN = LiveSourceUnavailable("test outage")
