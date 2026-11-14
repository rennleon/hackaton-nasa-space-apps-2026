"""End-to-end engine tests on the real Cajamarca (first test box) humidity files."""

from pathlib import Path

import pytest

from trend_detective.contract import AnalysisResult
from trend_detective.engine import EngineContext, analyze
from trend_detective.scan import scan
from trend_detective.verdict import decide

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def ctx() -> EngineContext:
    return EngineContext.from_repo(ROOT)


def test_day_humidity_default_window_is_drift_cut_and_significant(ctx):
    r = analyze(ctx, "cajamarca_west", "airs_rh_surf_day")
    assert r.window.start == "2002-09" and r.window.end == "2021-12" and r.window.reason == "drift_cut"
    # Earlier exploratory analysis: Sen ≈ +1.48 %RH/decade over 2002-2021, OLS ≈ +1.62.
    assert 1.2 < r.trend.slope_per_decade < 1.8
    assert r.trend.ci_low < r.trend.slope_per_decade < r.trend.ci_high
    assert r.verdict.label in {"significant", "significant_fragile"}
    assert {t.name for t in r.tests} == {"mk_hamed_rao", "ols_neff", "seasonal_mk"}
    assert all(t.p < 0.01 for t in r.tests if t.decisive)
    codes = {c.code for c in r.chips}
    assert "drift_years_excluded" in codes
    assert "data_box_differs" in codes  # requested box != returned 1° cells
    # out-of-window months are kept for display
    assert r.series[-1].t == "2026-10" and r.series[-1].in_window is False
    assert r.verdict.sentence.simple and r.verdict.sentence.scientific
    AnalysisResult.model_validate_json(r.model_dump_json())  # round-trips


def test_night_humidity_falls(ctx):
    r = analyze(ctx, "cajamarca_west", "airs_rh_surf_night")
    assert r.trend.slope_per_decade < -0.9
    assert r.verdict.label in {"significant", "significant_fragile"}


def test_drift_years_change_wisconsin_style_results_are_reported(ctx):
    r = analyze(ctx, "cajamarca_west", "airs_rh_surf_day")
    assert r.robustness.drift_label_with_late_years is not None
    assert r.robustness.leave_one_year_out is not None


def test_user_window_and_season(ctx):
    r = analyze(ctx, "cajamarca_west", "airs_rh_surf_day", start="2005-01", end="2020-12")
    assert r.window.reason == "user" and r.window.start == "2005-01"
    s = analyze(ctx, "cajamarca_west", "airs_rh_surf_day", season_id="wet")
    assert s.season.months == [1, 2, 3, 4]
    assert s.season_series and len(s.season_series) >= 15
    assert not any(t.name == "seasonal_mk" for t in s.tests)


def test_short_user_window_fails_record_length_gate(ctx):
    r = analyze(ctx, "cajamarca_west", "airs_rh_surf_day", start="2012-01", end="2021-12")
    assert r.verdict.label == "cant_tell"
    assert any(c.code == "record_length" and not c.passed for c in r.gates.checks)


def test_missing_data_is_cant_tell(ctx):
    r = analyze(ctx, "cajamarca_highlands", "gpm_precip")
    assert r.verdict.label == "cant_tell" and r.gates.checks[0].code == "no_data"


def test_unknown_season_raises(ctx):
    with pytest.raises(KeyError):
        analyze(ctx, "cajamarca_west", "airs_rh_surf_day", season_id="monsoon")


def test_scan_water_theme(ctx):
    s = scan(ctx, "cajamarca_west", "water")
    ids = [e.variable_id for e in s.entries]
    assert "airs_rh_surf_day" in ids and "gpm_precip" in ids
    by = {e.variable_id: e for e in s.entries}
    assert by["gpm_precip"].shortlist_label == "cant_tell"
    assert by["airs_rh_surf_day"].p_adjusted is not None
    # cant_tell entries sort last
    assert s.entries[-1].shortlist_label == "cant_tell"


@pytest.mark.parametrize(
    "pa,pb,robust,avail,need,expected",
    [
        (0.001, 0.01, True, 20, 15, "significant"),
        (0.001, 0.01, False, 20, 15, "significant_fragile"),
        (0.01, 0.20, True, 20, 15, "borderline"),
        (0.30, 0.40, True, 20, 30, "possibly_changing"),
        (0.30, 0.40, True, 20, 80, "no_detectable_change"),
        (0.30, 0.40, True, 20, None, "no_detectable_change"),
    ],
)
def test_decide_rules(pa, pb, robust, avail, need, expected):
    assert decide(pa, pb, robust, avail, need) == expected
