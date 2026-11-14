"""Regularise a raw series to a continuous monthly grid in display units."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .catalog import VariableCard
from .contract import Provenance
from .sources.base import RawSeries
from .timeutil import month_index, month_range


@dataclass
class MonthlySeries:
    months: list[str]
    values: np.ndarray  # display units, NaN = missing
    provenance: Provenance


def to_monthly(raw: RawSeries, variable: VariableCard) -> MonthlySeries:
    if len(raw.months) != len(raw.values):
        raise ValueError("months and values differ in length")
    if not raw.months:
        return MonthlySeries([], np.array([], dtype=np.float64), raw.provenance)
    idx = [month_index(m) for m in raw.months]
    if len(set(idx)) != len(idx):
        dup = sorted({raw.months[i] for i, x in enumerate(idx) if idx.count(x) > 1})
        raise ValueError(f"duplicate months in series: {dup}")
    order = np.argsort(idx)
    grid = month_range(raw.months[order[0]], raw.months[order[-1]])
    first = min(idx)
    out = np.full(len(grid), np.nan, dtype=np.float64)
    units = variable.units
    src = np.asarray(raw.values, dtype=np.float64)
    out[np.asarray(idx) - first] = src * units.scale + units.offset
    return MonthlySeries(grid, out, raw.provenance)
