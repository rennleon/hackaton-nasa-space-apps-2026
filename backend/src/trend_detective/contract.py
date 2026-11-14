"""The result contract: the JSON the engine returns and the front end renders.

One shape for every producer (precompute job, API, future live pipeline), so the
front end has a single code path. TypeScript types are generated from the JSON
Schema exported by `scripts/export_schema.py` into `contract/`.

Every user-facing sentence carries both registers (`Text.simple` for the
kid-friendly view, `Text.scientific` for the scientific view).

Times are month strings "YYYY-MM". Slopes are per decade in display units.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SCHEMA_VERSION = "1"


class Model(BaseModel):
    """Base for contract models: fields with defaults are still always serialised,
    so the exported (serialization) schema marks them required for the front end."""

    model_config = ConfigDict(json_schema_serialization_defaults_required=True)


class Text(Model):
    model_config = ConfigDict(extra="forbid", json_schema_serialization_defaults_required=True)

    simple: str
    scientific: str


class RegionRef(Model):
    id: str
    name: Text


class UnitsInfo(Model):
    display: str
    simple: str
    decimals: int


class VariableRef(Model):
    id: str
    giovanni_id: str | None
    name: Text
    definition: Text
    source_type: Literal["observed", "model"]
    instrument: str
    units: UnitsInfo


class Provenance(Model):
    """Where the series came from. Live sources fill the same fields."""

    source_kind: str  # e.g. "giovanni_csv", later "giovanni_api", "upload"
    source_ref: str  # file name, URL or request id
    title: str | None = None
    requested_bbox: list[float] | None = None  # W, S, E, N as requested
    data_bbox: list[float] | None = None  # W, S, E, N as reported by the source
    n_cells: int | None = None  # grid cells actually averaged, when the source reports them
    retrieved_at: str | None = None  # ISO date when known


class Window(Model):
    start: str  # "YYYY-MM"
    end: str  # "YYYY-MM"
    reason: Literal["default", "user", "drift_cut", "common"]
    years: float


class Season(Model):
    id: str
    name: Text
    months: list[int]


class MonthPoint(Model):
    t: str  # "YYYY-MM"
    value: float | None
    anomaly: float | None
    in_window: bool


class YearPoint(Model):
    year: int
    anomaly: float  # mean anomaly of the year's (or the season's) months
    in_window: bool = True


class ThenNow(Model):
    """Fitted level at the first and last year of the window, in display units
    (simple view shows whole numbers: value * kid_scale)."""

    year_then: int
    value_then: float
    year_now: int
    value_now: float
    kid_scale: float
    kid_label: str


class FitPoint(Model):
    """Trend line on the anomaly scale; low/high are the lines with the 95%
    slope bounds pivoting on the data centre (draw them as a band)."""

    t: str
    trend: float
    low: float
    high: float


class Trend(Model):
    slope_per_decade: float
    ci_low: float
    ci_high: float
    fit: list[FitPoint]


class SignificanceTest(Model):
    name: Literal["mk_hamed_rao", "ols_neff", "seasonal_mk"]
    p: float
    statistic: float  # z for MK tests, t for OLS
    decisive: bool  # A and B decide; C is context only


class Persistence(Model):
    r1: float
    n: int
    n_eff: float


class Detectability(Model):
    years_needed: float | None  # None when the slope is ~0
    years_available: float


class GateCheck(Model):
    code: str  # e.g. "coverage", "record_length", "cells", "completeness", "floor", "no_data"
    passed: bool
    detail: Text


class Gates(Model):
    passed: bool
    checks: list[GateCheck]


class Chip(Model):
    code: str  # e.g. "rests_on_few_years", "drift_changes_verdict", "cross_check_disagrees"
    severity: Literal["info", "warning"]
    text: Text


class LeaveOneYearOut(Model):
    slope_min: float
    slope_max: float
    worst_p: float
    flip_years: list[int]


class Comparison(Model):
    """Sign comparison with another series (cross-check source or spatial box)."""

    against: str  # variable id or region id
    slope_per_decade: float
    same_sign: bool
    significant: bool


class Robustness(Model):
    leave_one_year_out: LeaveOneYearOut | None = None
    drift_label_with_late_years: str | None = None
    cross_check: Comparison | None = None
    spatial: Comparison | None = None


class SelectionCheck(Model):
    """Stage 1 (before any trend): is this variable worth investigating here?"""

    code: Literal["question", "expectation", "fitness", "known_breaks", "detectability"]
    status: Literal["pass", "caution", "fail"]
    detail: Text


class Selection(Model):
    worth_investigating: bool  # no stage-1 check failed
    checks: list[SelectionCheck]
    mdt_per_decade: float | None  # minimum detectable trend for this record (Weatherhead 1998, inverted)
    expected_per_decade: float | None  # published expectation or reference trend size, when known


Label = Literal[
    "significant",
    "significant_fragile",
    "borderline",
    "possibly_changing",
    "no_detectable_change",
    "cant_tell",
]


Certainty = Literal["sure", "maybe", "too_soon", "cant_tell"]


class Verdict(Model):
    label: Label
    certainty: Certainty  # the three-step "how sure are we" meter (+ can't tell)
    answer: Text  # one-sentence answer, shown first
    how_much: Text  # simple: then vs now in whole numbers, or "watch for about N more years"
    headline: Text
    sentence: Text
    notes: list[Text] = Field(default_factory=list)


class AnalysisResult(Model):
    schema_version: str = SCHEMA_VERSION
    engine_version: str
    region: RegionRef
    variable: VariableRef
    provenance: Provenance | None
    window: Window | None
    season: Season | None = None
    gates: Gates
    selection: Selection | None = None
    series: list[MonthPoint] = Field(default_factory=list)
    season_series: list[YearPoint] | None = None
    yearly_series: list[YearPoint] | None = None  # yearly mean of de-seasonalised values (simple chart)
    then_now: ThenNow | None = None
    seasonal_share: float | None = None  # share of variance explained by the seasonal cycle
    trend: Trend | None = None
    tests: list[SignificanceTest] = Field(default_factory=list)
    persistence: Persistence | None = None
    detectability: Detectability | None = None
    robustness: Robustness = Field(default_factory=Robustness)
    chips: list[Chip] = Field(default_factory=list)
    verdict: Verdict


ShortlistLabel = Literal["changing", "possibly_changing", "no_detectable_change", "cant_tell"]


class ScanEntry(Model):
    variable_id: str
    name: Text
    role: Literal["target", "driver", "response", "cross_check"]
    source_type: Literal["observed", "model"]
    shortlist_label: ShortlistLabel
    verdict_label: Label
    slope_per_decade: float | None
    units: UnitsInfo
    p_decisive: float | None  # max(p_A, p_B)
    p_adjusted: float | None  # Benjamini-Hochberg across the scan
    worth_investigating: bool  # stage-1 selection verdict
    mdt_per_decade: float | None
    why: Text  # R1: why this variable is (or isn't) worth investigating here
    reason: Text | None = None  # why it can't tell, when applicable


class ScanResult(Model):
    schema_version: str = SCHEMA_VERSION
    engine_version: str
    region: RegionRef
    theme_id: str
    alpha: float
    method: Literal["benjamini_hochberg"] = "benjamini_hochberg"
    window_start: str | None  # one shared window for every variable, so records of different
    window_end: str | None  # lengths are compared fairly (detail views keep the full record)
    common_window: bool
    entries: list[ScanEntry]
