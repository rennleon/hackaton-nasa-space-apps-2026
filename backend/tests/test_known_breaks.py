"""Known breaks (action 'flag') inside the window lower "Sure it's real" to "Maybe" (user decisions Nov 15)."""

from synthetic import make_ctx, make_raw, point_region

from trend_detective.engine import analyze_region


def _run(vid, start, end, **kw):
    ctx, _ = make_ctx({vid: make_raw("2001-01", "2025-12", **kw)}, pair=None)
    return analyze_region(ctx, point_region(), vid, start, end, with_start_years=False, with_cell_agreement=False)


def test_modis_drift_inside_the_window_is_never_sure():
    # Terra's orbit drift is flagged from 2020-03: the record is kept, but a clear trend across it is only "Maybe"
    r = _run("modis_terra_aod", "2001-01", "2025-12", slope_per_decade=0.05, sd=0.01, base=0.2, seed=2)
    assert any(c.code == "known_artifact_orbit_drift_2020-03" for c in r.chips)
    assert r.verdict.label == "significant_fragile" and r.verdict.certainty != "sure"
    assert r.window.end == "2025-12"  # no cut for MODIS

    before = _run("modis_terra_aod", "2001-01", "2019-12", slope_per_decade=0.05, sd=0.01, base=0.2, seed=2)
    assert not any(c.code.startswith("known_artifact_") for c in before.chips)
    assert before.verdict.label == "significant"


def test_window_starting_inside_frozen_emissions_is_never_sure():
    # regression: a window starting on/after MERRA-2's freeze (carbon from 2007-01) was "Sure it's real"
    r = _run("merra2_oc", "2007-01", "2025-12", slope_per_decade=0.5, sd=0.05, base=2.0, seed=4)
    assert any(c.code == "known_artifact_frozen_emissions_2007-01" for c in r.chips)
    assert r.verdict.label == "significant_fragile"  # both tests agree; only the freeze lowers it
    later = _run("merra2_oc", "2010-01", "2025-12", slope_per_decade=0.5, sd=0.05, base=2.0, seed=4)
    assert later.verdict.label == "significant_fragile"
