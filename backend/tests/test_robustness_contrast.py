"""A5: instrument contrast over the overlapping years only, with its five outcomes."""

import re

import pytest
from synthetic import make_ctx, make_raw, point_region

from trend_detective.engine import analyze_region

POWER_RANGE = ("1990-01", "2021-12")
AIRS_RANGE = ("2002-09", "2021-12")
BANNED = re.compile(r"p-value|\bsignifican|\bdecade|\banomal|statistically|mann.kendall|\bols\b|hamed", re.IGNORECASE)

STRONG = dict(slope_per_decade=0.8, sd=1.0)
FLAT = dict(slope_per_decade=0.0, sd=1.0)


def run(power, airs, var="power_t2m"):
    ctx, _ = make_ctx({"power_t2m": power, "airs_t_surf_day": airs})
    return analyze_region(ctx, point_region(), var)


@pytest.mark.parametrize("p_kw,a_kw,seed_a,outcome,seed_p", [
    (STRONG, STRONG, 2, "agree", 1),
    (STRONG, dict(slope_per_decade=-0.8, sd=1.0), 2, "disagree", 1),
    (STRONG, dict(slope_per_decade=0.1, sd=1.5), 3, "same_direction_one_unsure", 1),
    (FLAT, FLAT, 4, "both_unsure", 5),
])
def test_outcomes(p_kw, a_kw, seed_a, outcome, seed_p):
    r = run(make_raw(*POWER_RANGE, seed=seed_p, **p_kw), make_raw(*AIRS_RANGE, seed=seed_a, **a_kw))
    cc = r.robustness.cross_check
    assert cc is not None and cc.outcome == outcome, (cc.outcome, cc.slope_per_decade, cc.significant)
    assert cc.against == "airs_t_surf_day" and cc.against_instrument == "AIRS"
    assert cc.text.simple and cc.text.scientific
    assert not BANNED.search(cc.text.simple)
    assert all(len(s.split()) <= 12 for s in re.split(r"[.:] ?", cc.text.simple) if s)
    assert "per decade" in cc.text.scientific and "p = " in cc.text.scientific


def test_one_sure_other_opposite_and_unsure_is_not_agreement():
    r = run(make_raw(*POWER_RANGE, seed=1, **STRONG), make_raw(*AIRS_RANGE, seed=1, slope_per_decade=-0.05, sd=1.5))
    cc = r.robustness.cross_check
    assert cc.outcome == "both_unsure" and not cc.same_sign


def test_partner_without_data_is_only_one_and_no_false_chip():
    r = run(make_raw(*POWER_RANGE, seed=1, **STRONG), None)
    cc = r.robustness.cross_check
    assert cc.outcome == "only_one" and "one instrument" in cc.text.simple
    assert not any(c.code == "cross_check_disagrees" for c in r.chips)


def test_overlap_window_only():
    """POWER fell before 2002 and rises after: the partner comparison must see the overlap, not the full record."""
    power = make_raw("1981-01", "2021-12", seed=1, slope_per_decade=0.0, sd=0.3, kink=(2002.7, -1.5))
    airs = make_raw(*AIRS_RANGE, seed=2, **STRONG)
    ctx, _ = make_ctx({"power_t2m": power, "airs_t_surf_day": airs})
    r = analyze_region(ctx, point_region(), "airs_t_surf_day")  # base = AIRS; partner = POWER
    cc = r.robustness.cross_check
    assert (cc.window_start, cc.window_end) == ("2002-09", "2021-12")
    assert abs(cc.slope_per_decade) < 0.4  # partner slope on the overlap, not the long fall
    full = analyze_region(ctx, point_region(), "power_t2m")
    assert full.trend.slope_per_decade < -0.2  # the full POWER record does fall


def test_overlap_respects_drift_cut_of_airs():
    airs = make_raw("2002-09", "2023-12", seed=2, **STRONG)
    r = run(make_raw("1990-01", "2023-12", seed=1, **STRONG), airs, var="airs_t_surf_day")
    assert r.robustness.cross_check.window_end == "2021-12"  # AIRS default window ends before 2022


def test_overlap_too_short_is_only_one():
    r = run(make_raw("1990-01", "2012-12", seed=1, **STRONG), make_raw("2008-01", "2021-12", seed=2, **STRONG))
    cc = r.robustness.cross_check
    assert cc.outcome == "only_one" and "share only" in cc.text.scientific


def test_airs_snapshot_note_and_footprint():
    r = run(make_raw(*POWER_RANGE, seed=1, **STRONG), make_raw(*AIRS_RANGE, seed=2, **STRONG))
    sci = r.robustness.cross_check.text.scientific
    assert "direction only" in sci and "grid cells differ" in sci
    assert "direction only" not in r.robustness.cross_check.text.simple


def test_same_model_is_never_a_pair():
    ctx, _ = make_ctx({"power_t2m": make_raw(*POWER_RANGE, seed=1, **STRONG),
                       "airs_t_surf_day": make_raw(*AIRS_RANGE, seed=2, **STRONG)})
    cat = ctx.catalog
    cat.variables["airs_t_surf_day"].source.instrument_id = cat.variables["power_t2m"].source.instrument_id
    cat.variables["airs_t_surf_day"].source.platform = cat.variables["power_t2m"].source.platform
    r = analyze_region(ctx, point_region(), "power_t2m")
    assert r.robustness.cross_check is None


def test_disagreement_adds_the_existing_warning_chip():
    r = run(make_raw(*POWER_RANGE, seed=1, **STRONG), make_raw(*AIRS_RANGE, seed=2, slope_per_decade=-0.8, sd=1.0))
    assert any(c.code == "cross_check_disagrees" for c in r.chips)
