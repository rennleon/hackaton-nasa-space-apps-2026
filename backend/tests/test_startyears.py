"""Start-year sensitivity on synthetic series (context panel; the headline verdict is untouched)."""

import numpy as np
import pytest
from synthetic import make_ctx, make_raw, point_region

from trend_detective.contract import AnalysisResult, Provenance, Window
from trend_detective.engine import analyze, analyze_region
from trend_detective.ingest import MonthlySeries
from trend_detective.prepare import prepare
from trend_detective.startyears import classify, start_year_sensitivity
from trend_detective.stats import trend_tests
from trend_detective.timeutil import month_range, month_to_float


def _prep(values_fn, start="2000-01", end="2024-12", w_start=None):
    months = month_range(start, end)
    t = np.array([month_to_float(m) for m in months])
    cal = np.array([int(m[5:7]) for m in months])
    rng = np.random.default_rng(3)
    vals = 10 + 3 * np.sin(2 * np.pi * (cal - 1) / 12) + rng.normal(0, 0.3, len(months)) + values_fn(t)
    s = MonthlySeries(months, vals, Provenance(source_kind="synthetic", source_ref="synthetic"))
    return prepare(s, Window(start=w_start or start, end=end, reason="user", years=1.0))


def _declared_slope(p):
    return trend_tests(p.t_window, p.anomalies_window).slope_per_year


def test_steady_trend_holds():
    p = _prep(lambda t: 0.08 * (t - 2000))
    sy = start_year_sensitivity(p, _declared_slope(p))
    assert sy.classification == "holds"
    # 2000-01 .. 2010-01 still leave >= 15 years before 2024-12 (2011-01 leaves 14)
    assert sy.points[0].start == "2000-01"
    assert sy.points[-1].start == "2010-01" and sy.points[-1].years >= 15
    assert sy.n_starts == sy.n_same_sign == len(sy.points) == 11
    assert sy.n_significant == sy.n_starts
    assert all(q.ci_low <= q.slope_per_decade <= q.ci_high for q in sy.points)
    assert all(q.slope_per_decade == pytest.approx(0.8, abs=0.25) for q in sy.points)


def test_slope_matches_headline_machinery():
    p = _prep(lambda t: 0.08 * (t - 2000))
    sy = start_year_sensitivity(p, 1.0)
    tt = trend_tests(p.t_window, p.anomalies_window)
    assert sy.points[0].slope_per_decade == pytest.approx(tt.slope_per_year * 10)
    assert sy.points[0].ci_low == pytest.approx(tt.ci_low_per_year * 10)


def test_sign_flips_with_start_year_depends():
    # rises to 2012, then falls back more slowly: early starts see a rise overall, late starts a fall
    p = _prep(lambda t: np.where(t < 2012, 0.4 * (t - 2000), 4.8 - 0.2 * (t - 2012)))
    sy = start_year_sensitivity(p, _declared_slope(p))
    assert sy.classification == "depends"
    assert {np.sign(q.slope_per_decade) for q in sy.points} == {-1.0, 1.0}
    assert sy.n_same_sign < sy.n_starts * 0.75


def test_noise_around_zero_is_unclear_not_an_alarm():
    p = _prep(lambda t: np.zeros_like(t))  # seasonal cycle + white noise only, no trend
    sy = start_year_sensitivity(p, _declared_slope(p))
    assert sy is not None
    assert sy.n_opposite_sure == 0
    assert sy.classification in ("holds", "mostly", "unclear")


def test_short_window_has_no_panel():
    # 15.5 years: only the declared start fits (2001-01 would leave 14.5 years)
    p = _prep(lambda t: 0.08 * (t - 2000), end="2015-06")
    assert start_year_sensitivity(p, 1.0) is None


def test_partial_first_year_starts_in_the_next_january_and_keeps_end_month():
    p = _prep(lambda t: 0.08 * (t - 2000), end="2024-06", w_start="2000-09")
    sy = start_year_sensitivity(p, 1.0)
    assert sy.points[0].start == "2001-01"
    assert sy.points[-1].start == "2009-01" and sy.points[-1].years >= 15  # 2010-01..2024-06 is 14.5 years


def test_classify_thresholds():
    assert classify(10, 10) == "holds"
    assert classify(8, 10) == "mostly"
    assert classify(7, 10) == "unclear"  # signs vary but none is sure: noise, not an alarm
    assert classify(9, 10, 1) == "depends"  # a start year surely points the other way


def _ctx(slope=0.8, end="2024-12"):
    return make_ctx({"power_t2m": make_raw("2000-01", end, slope_per_decade=slope, seed=1)})[0]


def test_engine_attaches_panel_for_a_trend():
    r = analyze_region(_ctx(), point_region(), "power_t2m")
    assert r.start_years is not None and r.start_years.classification == "holds"
    AnalysisResult.model_validate_json(r.model_dump_json())
    assert r.trend.slope_per_decade == pytest.approx(0.8, abs=0.3)  # headline = declared window, unchanged


def test_engine_skips_panel_when_asked():
    assert analyze_region(_ctx(), point_region(), "power_t2m", with_start_years=False).start_years is None


def test_engine_no_panel_when_no_trend_computed():
    r = analyze_region(_ctx(end="2010-12"), point_region(), "power_t2m")  # under 15 years: gates fail
    assert r.trend is None and r.start_years is None


def test_engine_no_panel_for_a_declared_season():
    ctx, _ = make_ctx({"airs_rh_surf_day": make_raw("2002-09", "2021-12", slope_per_decade=1.5, seed=2)})
    r = analyze(ctx, "cajamarca_highlands", "airs_rh_surf_day", season_id="wet")
    assert r.season is not None and r.trend is not None and r.start_years is None
    assert analyze(ctx, "cajamarca_highlands", "airs_rh_surf_day").start_years is not None
