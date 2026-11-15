"""Protocol steps 2-3: choose the analysis window, remove the seasonal cycle."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .catalog import VariableCard
from .contract import Window
from .ingest import MonthlySeries
from .timeutil import calendar_month, month_add, month_index, month_to_float, year_of

MIN_VALUES_PER_CALENDAR_MONTH = 3


@dataclass
class Prepared:
    months: list[str]  # full continuous grid
    values: np.ndarray  # display units, NaN = missing
    in_window: np.ndarray  # bool mask over months
    window: Window
    climatology: dict[int, float]  # calendar month -> mean over the window
    anomalies: np.ndarray  # values minus window climatology, all months
    seasonal_share: float | None

    @property
    def t_window(self) -> np.ndarray:
        return np.array([month_to_float(m) for m, w in zip(self.months, self.in_window) if w])

    @property
    def anomalies_window(self) -> np.ndarray:
        return self.anomalies[self.in_window]

    @property
    def values_window(self) -> np.ndarray:
        return self.values[self.in_window]

    @property
    def months_window(self) -> list[str]:
        return [m for m, w in zip(self.months, self.in_window) if w]


def data_span(series: MonthlySeries) -> tuple[str, str]:
    finite = np.flatnonzero(np.isfinite(series.values))
    if finite.size == 0:
        raise ValueError("series has no data")
    return series.months[finite[0]], series.months[finite[-1]]


def window_years(start: str, end: str) -> float:
    return (month_index(end) - month_index(start) + 1) / 12


def resolve_window(
    series: MonthlySeries,
    variable: VariableCard,
    start: str | None = None,
    end: str | None = None,
    reason: str = "user",
) -> Window:
    """Default window = full record, ended before any artifact marked end_window_before
    (e.g. Aqua orbit drift). A user window is clipped to the data."""
    first, last = data_span(series)
    if start or end:
        s = max(start or first, first, key=month_index)
        e = min(end or last, last, key=month_index)
        if month_index(e) < month_index(s):
            raise ValueError(f"empty window {s}..{e}")
        return Window(start=s, end=e, reason=reason, years=round(window_years(s, e), 2))
    end_m, reason = last, "default"
    for a in variable.artifacts:
        if a.action == "end_window_before" and month_index(a.start) <= month_index(last):
            cut = month_add(a.start, -1)
            if month_index(cut) < month_index(end_m):
                end_m, reason = cut, "drift_cut"
    return Window(start=first, end=end_m, reason=reason, years=round(window_years(first, end_m), 2))


# A step (one-off change in the inputs) only matters with data on both sides of it. The other flagged kinds
# (frozen emissions, row anomaly, orbit drift) start a period that lasts, so any window reaching it is affected.
STEP_ARTIFACT_KINDS = {"input_change"}


def flagged_artifacts(variable: VariableCard, window: Window) -> list:
    """Known breaks (action 'flag') that affect the window: a step needs data before it (a step in the first month
    has none); a lasting period counts whenever the window reaches its start. Never a break after the window's end."""
    s, e = month_index(window.start), month_index(window.end)
    return [
        a for a in variable.artifacts
        if a.action == "flag" and month_index(a.start) <= e
        and (s < month_index(a.start) if a.kind in STEP_ARTIFACT_KINDS else True)
    ]


def crossed_artifacts(variable: VariableCard, window: Window) -> list:
    """Artifacts marked end_window_before whose start falls inside the window."""
    return [
        a for a in variable.artifacts
        if a.action == "end_window_before" and month_index(window.start) <= month_index(a.start) <= month_index(window.end)
    ]


def full_window(series: MonthlySeries) -> Window:
    first, last = data_span(series)
    return Window(start=first, end=last, reason="user", years=round(window_years(first, last), 2))


def prepare(series: MonthlySeries, window: Window) -> Prepared:
    lo, hi = month_index(window.start), month_index(window.end)
    in_window = np.array([lo <= month_index(m) <= hi for m in series.months])
    cal = np.array([calendar_month(m) for m in series.months])
    clim: dict[int, float] = {}
    for m in range(1, 13):
        vals = series.values[in_window & (cal == m)]
        vals = vals[np.isfinite(vals)]
        clim[m] = float(vals.mean()) if vals.size >= MIN_VALUES_PER_CALENDAR_MONTH else float("nan")
    anomalies = series.values - np.array([clim[c] for c in cal])
    raw_w = series.values[in_window]
    an_w = anomalies[in_window]
    ok = np.isfinite(raw_w) & np.isfinite(an_w)
    share = None
    if ok.sum() > 12 and np.var(raw_w[ok]) > 0:
        share = float(1 - np.var(an_w[ok]) / np.var(raw_w[ok]))
    return Prepared(series.months, series.values, in_window, window, clim, anomalies, share)


def season_means(p: Prepared, months: list[int]) -> tuple[np.ndarray, np.ndarray]:
    """Yearly mean anomaly of the given calendar months (seasons within one calendar
    year), keeping only years where every one of those months is present inside the
    window. Returns (years, means) for complete years only."""
    by_year: dict[int, list[float]] = {}
    for m, a, w in zip(p.months, p.anomalies, p.in_window):
        if w and calendar_month(m) in months and np.isfinite(a):
            by_year.setdefault(year_of(m), []).append(float(a))
    years = sorted(y for y, v in by_year.items() if len(v) == len(months))
    return np.array(years, dtype=int), np.array([np.mean(by_year[y]) for y in years])
