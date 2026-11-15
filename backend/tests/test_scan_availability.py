"""B1: availability labels, listed:false, cross-check on entries, and parallel prefetch in the scan."""

import re

from synthetic import LIVE_DOWN, make_ctx, make_raw, point_region

from trend_detective import scan as scan_mod
from trend_detective.engine import analyze_region
from trend_detective.scan import scan_region

GOOD = {"slope_per_decade": 0.8, "sd": 1.0}


def entries(data, **kw):
    ctx, src = make_ctx(data, **kw)
    # merra2_t2m is unlisted in the catalog (duplicate of power_t2m); re-list it here as a 4th heat member.
    ctx.catalog.variables["merra2_t2m"].listed = True
    s = scan_region(ctx, point_region(), "heat")
    return ctx, src, s, {e.variable_id: e for e in s.entries}


def test_each_availability_label():
    _ctx, _, _s, by = entries({
        "power_t2m": make_raw("1981-01", "2021-12", seed=1, **GOOD),
        "airs_t_surf_day": make_raw("2002-09", "2008-12", seed=2, **GOOD),  # 6 years: too short
        "airs_t_surf_night": make_raw("2002-09", "2021-12", seed=3, nan_share=0.5, **GOOD),  # half the months missing
        "merra2_t2m": None,  # nothing here
    })
    assert by["power_t2m"].availability == "available"
    assert by["airs_t_surf_day"].availability == "too_short"
    assert by["airs_t_surf_night"].availability == "too_many_gaps"
    assert by["merra2_t2m"].availability == "no_data_here"
    for vid in ("airs_t_surf_day", "airs_t_surf_night", "merra2_t2m"):
        e = by[vid]
        assert e.reason is not None and e.why == e.reason
        assert e.shortlist_label == "cant_tell"
        assert not re.search(r"\bsignifican|\bdecade|p-value", e.reason.simple, re.IGNORECASE)
    assert "few years" in by["airs_t_surf_day"].reason.simple
    assert "missing" in by["airs_t_surf_night"].reason.simple


def test_all_missing_series_is_no_data_here():
    import numpy as np

    from trend_detective.contract import Provenance
    from trend_detective.sources import RawSeries
    from trend_detective.timeutil import month_range

    months = month_range("2002-09", "2021-12")
    raw = RawSeries(months, np.full(len(months), np.nan), Provenance(source_kind="synthetic", source_ref="x"))
    _, _, _, by = entries({"airs_t_surf_day": raw})
    assert by["airs_t_surf_day"].availability == "no_data_here"


def test_live_outage_is_recorded_not_raised_and_others_survive():
    _, _, _s, by = entries({
        "power_t2m": make_raw("1981-01", "2021-12", seed=1, **GOOD),
        "airs_t_surf_day": LIVE_DOWN,
    })
    assert by["airs_t_surf_day"].availability == "fetch_failed"
    assert "try again" in by["airs_t_surf_day"].reason.simple.lower()
    assert by["power_t2m"].availability == "available"
    # the partner of power_t2m is down: only_one, no crash
    assert by["power_t2m"].cross_check.outcome == "only_one"


def test_single_variable_outage_still_raises():
    """The detail endpoint relies on the exception (HTTP 503, never cached as 'no data')."""
    import pytest

    from trend_detective.sources import LiveSourceUnavailable

    ctx, _ = make_ctx({"power_t2m": LIVE_DOWN})
    with pytest.raises(LiveSourceUnavailable):
        analyze_region(ctx, point_region(), "power_t2m")
    r = analyze_region(ctx, point_region(), "power_t2m", failed_fetches={})
    assert r.gates.checks[0].code == "fetch_failed"


def test_unlisted_cards_are_skipped():
    ctx, _ = make_ctx({"power_t2m": make_raw("1981-01", "2021-12", seed=1, **GOOD)})
    ctx.catalog.variables["airs_t_surf_night"].listed = False
    s = scan_region(ctx, point_region(), "heat")
    assert "airs_t_surf_night" not in {e.variable_id for e in s.entries}
    assert "power_t2m" in {e.variable_id for e in s.entries}


def test_entry_carries_instrument_sparkline_and_contrast():
    _, _, _, by = entries({
        "power_t2m": make_raw("1981-01", "2021-12", seed=1, **GOOD),
        "airs_t_surf_day": make_raw("2002-09", "2021-12", seed=2, **GOOD),
    })
    e = by["power_t2m"]
    assert e.instrument_id == "merra2" and e.yearly_series and len(e.yearly_series) >= 30
    assert e.cross_check and e.cross_check.outcome == "agree"
    assert (e.cross_check.window_start, e.cross_check.window_end) == ("2002-09", "2021-12")
    assert by["airs_t_surf_day"].instrument_id == "airs"
    assert by["airs_t_surf_day"].cross_check.against == "power_t2m"


def test_contrast_does_not_change_shortlist_order():
    base = {"power_t2m": make_raw("1981-01", "2021-12", seed=1, **GOOD),
            "airs_t_surf_day": make_raw("2002-09", "2021-12", seed=2, **GOOD)}
    ctx1, _ = make_ctx(base, pair=None)
    for v in ctx1.catalog.variables.values():
        v.cross_check = None  # no contrast at all
    ctx2, _ = make_ctx(base)
    a = {e.variable_id: (e.shortlist_label, e.p_adjusted) for e in scan_region(ctx1, point_region(), "heat").entries}
    b = {e.variable_id: (e.shortlist_label, e.p_adjusted) for e in scan_region(ctx2, point_region(), "heat").entries}
    assert a["power_t2m"] == b["power_t2m"] and a["airs_t_surf_day"] == b["airs_t_surf_day"]


def test_undefined_test_gives_cant_tell_not_a_crash():
    """A series whose Hamed-Rao variance correction is undefined must not break the scan."""
    ctx, _ = make_ctx({"power_t2m": make_raw("1990-01", "2021-12", seed=1, slope_per_decade=0.0, sd=1.5)})
    r = analyze_region(ctx, point_region(), "power_t2m")
    assert r.verdict.label == "cant_tell"


def test_parallel_prefetch_is_identical_to_serial(monkeypatch):
    data = {
        "power_t2m": make_raw("1981-01", "2021-12", seed=1, **GOOD),
        "airs_t_surf_day": make_raw("2002-09", "2021-12", seed=2, **GOOD),
        "airs_t_surf_night": make_raw("2002-09", "2021-12", seed=3, slope_per_decade=-0.5, sd=1.0),
        "airs_rh_surf_day": LIVE_DOWN,
    }
    ctx_p, src_p = make_ctx(data, delay=0.05)
    parallel = scan_region(ctx_p, point_region(), "heat").model_dump()
    monkeypatch.setattr(scan_mod, "prefetch_series", lambda *a, **k: {})
    ctx_s, src_s = make_ctx(data)
    serial = scan_region(ctx_s, point_region(), "heat").model_dump()
    assert parallel == serial
    assert src_p.max_active > 1 and src_s.max_active == 1
    assert len(src_p.calls) == len(set(src_p.calls))  # each series fetched once


def test_prefetch_worker_cap(monkeypatch):
    ctx, src = make_ctx({}, delay=0.03)
    ids = [v for v in ctx.catalog.variables][:20]
    assert scan_mod.MAX_PREFETCH_WORKERS == 8
    scan_mod.prefetch_series(ctx, point_region(), ids)
    assert 1 < src.max_active <= 8
