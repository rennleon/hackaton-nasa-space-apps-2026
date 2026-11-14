"""Series sources: the seam that makes data access swappable.

The engine never knows where data comes from. It asks a `SeriesSource` for a
variable over a region and gets a `RawSeries` (native units, monthly, NaN for
missing) plus provenance. Today: local Giovanni CSV exports. Later: a live
Giovanni/Earthdata fetcher, user uploads, a cache wrapper -- each one is a new
class implementing `fetch`, registered in a `SourceChain`. Nothing else changes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

import numpy as np

from ..catalog import RegionCard, VariableCard
from ..contract import Provenance


class LiveSourceUnavailable(RuntimeError):
    """A live source could not be reached (network error, timeout, 5xx). Never cache this
    as 'no data': the API answers 503 so the front end can say 'live data is down'."""


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
