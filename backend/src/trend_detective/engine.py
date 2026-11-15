"""The engine's single entry point: analyze(region, variable, window, season).

Both the precompute job and the API call this and nothing else. Data comes from a
SourceChain, so swapping local CSVs for a live fetcher changes nothing here.
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from . import ENGINE_VERSION
from .catalog import Catalog, RegionCard, VariableCard
from .contract import (
    AnalysisResult,
    Chip,
    Comparison,
    Detectability,
    FitPoint,
    Gates,
    MonthPoint,
    Persistence,
    Robustness,
    Season,
    SignificanceTest,
    Text,
    ThenNow,
    Trend,
    Window,
    YearPoint,
)
from .gates import bbox_chip, fitness, near_bound_chip, no_data, quality, step_month
from .ingest import MonthlySeries, to_monthly
from .prepare import (
    Prepared,
    crossed_artifacts,
    flagged_artifacts,
    full_window,
    prepare,
    resolve_window,
    season_means,
    window_years,
)
from .robustness import leave_one_year_out
from .selection import stage1
from .sources import SourceChain
from .sources.giovanni_csv import GiovanniCsvSource
from .sources.power import PowerSource
from .stats import TrendTests, seasonal_mk, trend_tests, years_to_detect
from .timeutil import from_index, month_index, month_to_float
from .verdict import VerdictInputs, build_verdict, cant_tell, decide

ROBUSTNESS_CODES = {
    "rests_on_few_years", "drift_changes_verdict", "drift_years_included", "cross_check_disagrees", "spatial_disagrees",
}
MIN_COMPARISON_YEARS = 10.0


def repo_root() -> Path:
    env = os.environ.get("TD_REPO_ROOT")
    return Path(env) if env else Path(__file__).resolve().parents[3]


def _r(x: float | None, nd: int = 4) -> float | None:
    return None if x is None or not math.isfinite(x) else round(float(x), nd)


@dataclass
class EngineContext:
    catalog: Catalog
    sources: SourceChain
    alpha: float = 0.05
    _cache: dict = field(default_factory=dict)

    @classmethod
    def from_repo(cls, root: Path | None = None) -> EngineContext:
        root = root or repo_root()
        sources = SourceChain([
            GiovanniCsvSource(root / "data" / "raw"),
            PowerSource(cache_dir=root / "data" / "cache" / "power"),
        ])
        return cls(Catalog.load(root / "catalog"), sources)

    def series(self, variable_id: str, region: RegionCard | str) -> MonthlySeries | None:
        r = self.catalog.regions[region] if isinstance(region, str) else region
        key = (variable_id, r.id, tuple(r.geometry.bbox))
        if key not in self._cache:
            v = self.catalog.variables[variable_id]
            raw = self.sources.fetch(v, r)
            self._cache[key] = to_monthly(raw, v) if raw is not None else None
        return self._cache[key]


@dataclass
class Core:
    tt: TrendTests
    t: np.ndarray
    y: np.ndarray
    years: np.ndarray
    p_c: float | None
    z_c: float | None
    years_needed: float | None
    years_available: float


def _core_monthly(p: Prepared) -> Core:
    t, y = p.t_window, p.anomalies_window
    tt = trend_tests(t, y)
    try:
        p_c, z_c = seasonal_mk(p.values_window, 12)
    except Exception:  # noqa: BLE001 - context-only test; never block the analysis
        p_c, z_c = None, None
    yn = years_to_detect(tt.resid_sd, tt.slope_per_year, tt.r1, 12)
    return Core(tt, t, y, np.floor(t).astype(int), p_c, z_c, yn, p.window.years)


def _core_season(p: Prepared, months: list[int]) -> Core:
    got_years, got_means = season_means(p, months)
    if got_years.size == 0:
        raise ValueError("no complete season-years in the window")
    # Full yearly grid with NaN for missing season-years, so persistence sees real gaps.
    years = np.arange(got_years.min(), got_years.max() + 1)
    lookup = dict(zip(got_years.tolist(), got_means.tolist()))
    means = np.array([lookup.get(int(y), np.nan) for y in years])
    t = years.astype(float) + 0.5
    tt = trend_tests(t, means)
    yn = years_to_detect(tt.resid_sd, tt.slope_per_year, tt.r1, 1)
    return Core(tt, t, means, years, None, None, yn, float(got_years.size))


def _core(p: Prepared, season: Season | None) -> Core:
    return _core_season(p, season.months) if season else _core_monthly(p)


def _yearly(p: Prepared, min_months: int = 10) -> list[YearPoint]:
    """Yearly mean of the de-seasonalised values (simple chart: one dot per year)."""
    by: dict[int, list[float]] = {}
    inside: dict[int, bool] = {}
    for m, a, w in zip(p.months, p.anomalies, p.in_window):
        y = int(m[:4])
        inside[y] = inside.get(y, True) and bool(w)
        if np.isfinite(a):
            by.setdefault(y, []).append(float(a))
    return [YearPoint(year=y, anomaly=_r(float(np.mean(v))), in_window=inside[y])
            for y, v in sorted(by.items()) if len(v) >= min_months]


def _then_now(p: Prepared, core: Core, var: VariableCard, season: Season | None) -> ThenNow | None:
    vals = p.values_window
    if season:
        cal = np.array([int(m[5:7]) for m in p.months_window])
        vals = vals[np.isin(cal, season.months)]
    vals = vals[np.isfinite(vals)]
    if vals.size == 0:
        return None
    level = float(vals.mean())
    tt = core.tt
    t0, t1 = float(np.nanmin(core.t)), float(np.nanmax(core.t))
    return ThenNow(
        year_then=math.floor(t0), value_then=_r(level + tt.intercept + tt.slope_per_year * t0),
        year_now=math.floor(t1), value_now=_r(level + tt.intercept + tt.slope_per_year * t1),
        kid_scale=var.kid_units.scale, kid_label=var.kid_units.label,
    )


def _sig(tt: TrendTests, alpha: float) -> bool:
    return tt.p_mk_hr < alpha and tt.p_ols < alpha


def _to_month(t: float) -> str:
    return from_index(math.floor(t * 12))


def _fit(core: Core) -> list[FitPoint]:
    tt = core.tt
    t_mid = float(np.median(core.t))
    pivot = tt.intercept + tt.slope_per_year * t_mid
    pts = []
    for t in (float(core.t.min()), t_mid, float(core.t.max())):
        pts.append(
            FitPoint(
                t=_to_month(t),
                trend=_r(tt.intercept + tt.slope_per_year * t),
                low=_r(pivot + tt.ci_low_per_year * (t - t_mid)),
                high=_r(pivot + tt.ci_high_per_year * (t - t_mid)),
            )
        )
    return pts


def _compare(
    ctx: EngineContext, variable: VariableCard, region: RegionCard, window: Window, season: Season | None,
    base_slope: float, against: str,
) -> Comparison | None:
    s2 = ctx.series(variable.id, region.id)
    if s2 is None:
        return None
    try:
        w2 = resolve_window(s2, variable)
        start = max(window.start, w2.start, key=month_index)
        end = min(window.end, w2.end, key=month_index)
        if month_index(end) < month_index(start) or window_years(start, end) < MIN_COMPARISON_YEARS:
            return None
        p2 = prepare(s2, Window(start=start, end=end, reason="user", years=round(window_years(start, end), 2)))
        c2 = _core(p2, season)
    except ValueError:
        return None
    return Comparison(
        against=against,
        slope_per_decade=_r(c2.tt.slope_per_year * 10, 6),
        same_sign=bool(np.sign(c2.tt.slope_per_year) == np.sign(base_slope)),
        significant=_sig(c2.tt, ctx.alpha),
    )


def analyze(
    ctx: EngineContext,
    region_id: str,
    variable_id: str,
    start: str | None = None,
    end: str | None = None,
    season_id: str | None = None,
    with_robustness: bool = True,
    theme_id: str | None = None,
    window_reason: str = "user",
) -> AnalysisResult:
    """Analyse a catalog region. See analyze_region for ad-hoc regions (e.g. drawn on the map)."""
    if region_id not in ctx.catalog.regions:
        raise KeyError(f"unknown region {region_id}")
    return analyze_region(ctx, ctx.catalog.regions[region_id], variable_id, start, end, season_id,
                          with_robustness, theme_id, window_reason)


def analyze_region(
    ctx: EngineContext,
    region: RegionCard,
    variable_id: str,
    start: str | None = None,
    end: str | None = None,
    season_id: str | None = None,
    with_robustness: bool = True,
    theme_id: str | None = None,
    window_reason: str = "user",
) -> AnalysisResult:
    cat = ctx.catalog
    if variable_id not in cat.variables:
        raise KeyError(f"unknown variable {variable_id}")
    var = cat.variables[variable_id]
    region_id = region.id
    base = {"engine_version": ENGINE_VERSION, "region": region.ref(), "variable": var.ref()}

    season = None
    if season_id:
        ds = next((s for s in region.seasons_for(variable_id) if s.id == season_id), None)
        if ds is None:
            raise KeyError(f"no declared season {season_id} for {variable_id} in {region_id}")
        season = Season(id=ds.id, name=ds.name, months=ds.months)

    series = ctx.series(variable_id, region)
    if series is None or not np.isfinite(series.values).any():
        g = no_data()
        return AnalysisResult(
            **base, provenance=None, window=None, season=season, gates=Gates(passed=False, checks=[g]),
            verdict=cant_tell(var, region, [g.detail]),
        )

    window = resolve_window(series, var, start, end, reason=window_reason)
    p = prepare(series, window)
    points = [
        MonthPoint(t=m, value=_r(v), anomaly=_r(a), in_window=bool(w))
        for m, v, a, w in zip(p.months, p.values, p.anomalies, p.in_window)
    ]

    if season:
        gate_years, unit = float(len(season_means(p, season.months)[0])), "season-years"
    else:
        gate_years, unit = window.years, "years"
    n_cells = series.provenance.n_cells if series.provenance else None
    checks = fitness(var, region, gate_years, unit, n_cells) + quality(p, var, season.months if season else None)
    gates = Gates(passed=all(c.passed for c in checks), checks=checks)

    chips: list[Chip] = []
    bc = bbox_chip(series.provenance, region, var.grid_deg)
    if bc:
        chips.append(bc)
    nb = near_bound_chip(p, var, season.months if season else None)
    if nb:
        chips.append(nb)
    if series.provenance and series.provenance.source_kind == "nasa_power" and region.geometry.kind == "shape":
        chips.append(Chip(
            code="area_is_bounding_box", severity="info",
            text=Text(simple="We use the rectangle around this place. It includes some land and lake nearby.",
                      scientific="NASA POWER mean over the shape's bounding box (includes neighbouring areas).",
                      simple_es="Usamos el rectángulo que rodea este lugar. Incluye algo de tierra y lagos cercanos.",
                      scientific_es="Media de NASA POWER sobre la caja envolvente de la forma (incluye áreas vecinas)."),
        ))
    if window.reason == "drift_cut":
        art = next(a for a in var.artifacts if a.action == "end_window_before")
        chips.append(Chip(code="drift_years_excluded", severity="info", text=art.note))
    flagged = flagged_artifacts(var, window)
    for art in flagged:
        chips.append(Chip(code=f"known_artifact_{art.kind}_{art.start}", severity="warning", text=art.note))
    for art in crossed_artifacts(var, window):
        chips.append(Chip(
            code="drift_years_included", severity="warning",
            text=Text(simple=f"This period includes years after {art.start[:4]} that may be affected by satellite drift.",
                      scientific=f"Window includes data from {art.start} onwards affected by {art.kind}: "
                                 f"{art.note.scientific}",
                      simple_es=f"Este periodo incluye años después de {art.start[:4]} que pueden estar afectados "
                                "por el desvío del satélite.",
                      scientific_es=f"La ventana incluye datos desde {art.start} afectados por {art.kind}: "
                                    f"{art.note.scientific_es or art.note.scientific}"),
        ))

    if season:
        sy, sm_ = season_means(p, season.months)
        sel_t, sel_y, f = sy.astype(float) + 0.5, sm_, 1
    else:
        sel_t, sel_y, f = p.t_window, p.anomalies_window, 12
    selection = stage1(var, region, theme_id, checks, flagged, sel_t, sel_y, gate_years, f)
    common = dict(
        **base, provenance=series.provenance, window=window, season=season, gates=gates, selection=selection,
        series=points, yearly_series=_yearly(p), seasonal_share=_r(p.seasonal_share, 3),
    )
    if not gates.passed:
        reasons = [c.detail for c in checks if not c.passed]
        return AnalysisResult(**common, chips=chips, verdict=cant_tell(var, region, reasons))
    try:
        core = _core(p, season)
    except ValueError as exc:
        detail = Text(simple="There isn't enough usable data here.", scientific=f"Analysis not possible: {exc}.",
                      simple_es="Aquí no hay suficientes datos utilizables.",
                      scientific_es=f"Análisis no posible: {exc}.")
        return AnalysisResult(**common, chips=chips, verdict=cant_tell(var, region, [detail]))

    tt = core.tt
    base_sig = _sig(tt, ctx.alpha)
    rob = Robustness()
    checks_run: list[str] = []
    if with_robustness:
        loyo = leave_one_year_out(core.t, core.y, core.years, tt.slope_per_year, base_sig, ctx.alpha)
        rob.leave_one_year_out = loyo
        checks_run.append("leave-one-year-out")
        if base_sig and loyo.flip_years:
            yrs = ", ".join(str(y) for y in loyo.flip_years)
            # R5: the plain sentence names at most 3 years; the scientific one keeps the full list
            shown = ", ".join(str(y) for y in loyo.flip_years[:3])
            extra = len(loyo.flip_years) - 3
            chips.append(Chip(
                code="rests_on_few_years", severity="warning",
                text=Text(simple=f"The answer changes if we leave out {shown}" + (f" and {extra} more." if extra > 0 else "."),
                          scientific=f"Leave-one-year-out changes sign or significance when dropping {yrs}.",
                          simple_es=f"La respuesta cambia si dejamos fuera {shown}" + (f" y {extra} más." if extra > 0 else "."),
                          scientific_es=f"Al omitir un año a la vez, el signo o la significancia cambian al quitar {yrs}."),
            ))
        if window.reason == "drift_cut" and start is None and end is None:
            pf = prepare(series, full_window(series))
            try:
                cf = _core(pf, season)
                lab_full = decide(cf.tt.p_mk_hr, cf.tt.p_ols, True, cf.years_available, cf.years_needed, ctx.alpha)
                lab_base = decide(tt.p_mk_hr, tt.p_ols, True, core.years_available, core.years_needed, ctx.alpha)
                rob.drift_label_with_late_years = lab_full
                checks_run.append("drift years included")
                if _sig(cf.tt, ctx.alpha) != base_sig and lab_full != lab_base:
                    chips.append(Chip(
                        code="drift_changes_verdict", severity="warning",
                        text=Text(simple="The answer changes if we include the years after the satellite drifted.",
                                  scientific=f"Including post-{window.end[:4]} data changes the label to {lab_full}.",
                                  simple_es="La respuesta cambia si incluimos los años en que el satélite se desvió.",
                                  scientific_es=f"Incluir datos posteriores a {window.end[:4]} cambia la etiqueta a {lab_full}."),
                    ))
            except ValueError:
                pass
        if var.cross_check:
            other = cat.variables[var.cross_check]
            rob.cross_check = _compare(ctx, other, region, window, season, tt.slope_per_year, other.id)
            if rob.cross_check:
                checks_run.append("cross-check source")
            if rob.cross_check and base_sig and not rob.cross_check.same_sign:
                chips.append(Chip(
                    code="cross_check_disagrees", severity="warning",
                    text=Text(simple=f"A second source ({other.name.simple.lower()}) shows the opposite direction.",
                              scientific=f"Cross-check {other.name.scientific} has the opposite sign "
                                         f"({rob.cross_check.slope_per_decade:+g} per decade).",
                              simple_es=f"Una segunda fuente ({(other.name.simple_es or other.name.simple).lower()}) "
                                        "muestra la dirección contraria.",
                              scientific_es=f"El contraste {other.name.scientific_es or other.name.scientific} tiene el "
                                            f"signo opuesto ({rob.cross_check.slope_per_decade:+g} por década)."),
                ))
        if region.comparison_region:
            comp = cat.regions[region.comparison_region]
            rob.spatial = _compare(ctx, var, comp, window, season, tt.slope_per_year, comp.id)
            if rob.spatial:
                checks_run.append("neighbouring box")
            if rob.spatial and base_sig and not rob.spatial.same_sign:
                chips.append(Chip(
                    code="spatial_disagrees", severity="warning",
                    text=Text(simple=f"The neighbouring area ({comp.name.simple}) shows the opposite direction.",
                              scientific=f"Comparison region {comp.name.scientific} has the opposite sign.",
                              simple_es=f"El área vecina ({comp.name.simple_es or comp.name.simple}) muestra la dirección contraria.",
                              scientific_es=f"La región de comparación {comp.name.scientific_es or comp.name.scientific} "
                                            "tiene el signo opuesto."),
                ))

    # Breaks are checked only at catalogued artifact dates (no generic change-point test,
    # which would also flag real trends). The excluded drift tail is one such known date.
    if not season and window.reason == "drift_cut":
        tail = [(m, a) for m, a, w in zip(p.months, p.anomalies, p.in_window)
                if not w and month_index(m) > month_index(window.end)]
        if len(tail) >= 12:
            tm = [m for m, _ in tail]
            ta = np.array([a for _, a in tail]) - np.array(
                [tt.intercept + tt.slope_per_year * month_to_float(m) for m in tm])
            sm2 = step_month(tm, ta, tt.resid_sd, tt.r1)
            if sm2:
                chips.append(Chip(
                    code="excluded_years_unusual", severity="info",
                    text=Text(simple=f"The left-out years look unusual from {sm2[:4]}, which fits the satellite drift.",
                              scientific=f"Post-window anomalies depart from the fitted trend from {sm2} "
                                         "(consistent with the documented artifact).",
                              simple_es=f"Los años que dejamos fuera se ven raros desde {sm2[:4]}. Encaja con el desvío del satélite.",
                              scientific_es=f"Las anomalías posteriores a la ventana se apartan de la tendencia ajustada "
                                            f"desde {sm2} (coherente con el artefacto documentado)."),
                ))

    then_now = _then_now(p, core, var, season)
    warn = [c for c in chips if c.code in ROBUSTNESS_CODES]
    label = decide(tt.p_mk_hr, tt.p_ols, not warn, core.years_available, core.years_needed, ctx.alpha)
    verdict = build_verdict(label, VerdictInputs(
        variable=var, region=region, window=window, season=season,
        slope_per_decade=tt.slope_per_year * 10, ci_low=tt.ci_low_per_year * 10, ci_high=tt.ci_high_per_year * 10,
        p_a=tt.p_mk_hr, p_b=tt.p_ols, p_c=core.p_c, r1=tt.r1, n_eff=tt.n_eff,
        years_needed=core.years_needed, years_available=core.years_available, alpha=ctx.alpha, warning_chips=warn,
        checks_run=checks_run, then_now=then_now, selection=selection,
    ))
    tests = [
        SignificanceTest(name="mk_hamed_rao", p=float(tt.p_mk_hr), statistic=_r(tt.z_mk_hr), decisive=True),
        SignificanceTest(name="ols_neff", p=float(tt.p_ols), statistic=_r(tt.t_ols), decisive=True),
    ]
    if core.p_c is not None:
        tests.append(SignificanceTest(name="seasonal_mk", p=float(core.p_c), statistic=_r(core.z_c), decisive=False))
    return AnalysisResult(
        **common,
        season_series=[YearPoint(year=int(y), anomaly=_r(a)) for y, a in zip(core.years, core.y)] if season else None,
        trend=Trend(
            slope_per_decade=_r(tt.slope_per_year * 10, 6),
            ci_low=_r(tt.ci_low_per_year * 10, 6),
            ci_high=_r(tt.ci_high_per_year * 10, 6),
            fit=_fit(core),
        ),
        tests=tests,
        persistence=Persistence(r1=_r(tt.r1, 3), n=tt.n, n_eff=_r(tt.n_eff, 1)),
        detectability=Detectability(years_needed=_r(core.years_needed, 1), years_available=_r(core.years_available, 1)),
        robustness=rob,
        chips=chips,
        verdict=verdict,
        then_now=then_now,
    )
