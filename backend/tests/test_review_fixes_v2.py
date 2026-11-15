"""Review findings C1-C3, H1-H3, M1, M4 and the bounded context cache: one regression test each."""

import re

import numpy as np
import pytest
from synthetic import LIVE_DOWN, make_ctx, make_raw, point_region
from test_giovanni_api import SOIL, TOKEN, Fake, fx, region

from trend_detective import engine
from trend_detective.api import custom_region
from trend_detective.catalog import Catalog
from trend_detective.contract import Provenance
from trend_detective.engine import EngineContext, analyze_region, repo_root
from trend_detective.gates import bbox_chip
from trend_detective.scan import scan_region
from trend_detective.sources import GiovanniBoxTooLarge, RawSeries, SourceChain

STRONG = {"slope_per_decade": 0.8, "sd": 1.0}
BANNED = re.compile(r"p-value|\bsignifican|\bdecade|\banomal|statistically|mann.kendall|\bols\b|hamed", re.IGNORECASE)


@pytest.fixture(autouse=True)
def _giovanni_env(monkeypatch):
    monkeypatch.setenv("EARTHDATA_TOKEN", TOKEN)
    monkeypatch.delenv("TD_GIOVANNI_OFFLINE", raising=False)


def run(power, airs, var="power_t2m"):
    ctx, _ = make_ctx({"power_t2m": power, "airs_t_surf_day": airs})
    return analyze_region(ctx, point_region(), var)


def short_sentences_ok(text: str) -> None:
    assert all(len(s.split()) <= 12 for s in re.split(r"[.:] ?", text) if s), text


# -- C1: the second opinion is related to the HEADLINE, over named years ---------------------------

def headline_up_overlap_flat_power():
    """Rises until 2002, flat after: the 1981-2021 headline is up; the 2002-2021 overlap is flat."""
    return make_raw("1981-01", "2021-12", seed=1, slope_per_decade=0.0, sd=0.3, kink=(2002.7, 1.5))


def test_partner_opposite_to_the_headline_is_a_disagreement_with_the_years_named():
    r = run(headline_up_overlap_flat_power(), make_raw("2002-09", "2021-12", seed=2, slope_per_decade=-0.8, sd=1.0))
    assert r.trend.slope_per_decade > 0  # headline: up over the full record
    cc = r.robustness.cross_check
    assert cc.outcome == "disagree" and not cc.same_sign and cc.significant
    assert cc.text.simple.startswith("From 2002 to 2021, AIRS shows the opposite direction.")
    assert "It is sure" in cc.text.simple
    assert cc.text.simple_es.startswith("De 2002 a 2021, AIRS muestra la dirección contraria.")
    assert "Headline" in cc.text.scientific and "2002-09 to 2021-12" in cc.text.scientific
    assert not BANNED.search(cc.text.simple)
    short_sentences_ok(cc.text.simple)
    # the pre-v2 safety: the warning chip fires and the verdict is no longer a plain "sure"
    assert any(c.code == "cross_check_disagrees" for c in r.chips)
    assert r.verdict.label != "significant"


def test_partner_unsure_and_opposite_never_claims_the_same_direction():
    r = run(make_raw("1990-01", "2021-12", seed=1, **STRONG),
            make_raw("2002-09", "2021-12", seed=1, slope_per_decade=-0.05, sd=1.5))
    cc = r.robustness.cross_check
    assert cc.outcome == "both_unsure" and "opposite direction" in cc.text.simple
    assert "not sure yet" in cc.text.simple and "same direction" not in cc.text.simple
    assert not any(c.code == "cross_check_disagrees" for c in r.chips)


# -- C2: say which of the two is the sure one ------------------------------------------------------

def test_same_direction_headline_sure_partner_unsure():
    r = run(make_raw("1990-01", "2021-12", seed=1, **STRONG),
            make_raw("2002-09", "2021-12", seed=3, slope_per_decade=0.1, sd=1.5))
    cc = r.robustness.cross_check
    assert cc.outcome == "same_direction_one_unsure"
    assert "same direction" in cc.text.simple and "It is not sure yet. Our main result is sure." in cc.text.simple
    assert "Aún no está seguro" in cc.text.simple_es and "principal sí" in cc.text.simple_es
    short_sentences_ok(cc.text.simple)


def test_same_direction_headline_unsure_partner_sure():
    for seed in range(1, 40):
        power = make_raw("2002-09", "2021-12", seed=seed, slope_per_decade=0.15, sd=2.5)
        r = run(power, make_raw("2002-09", "2021-12", seed=2, **STRONG))
        cc = r.robustness.cross_check
        if r.trend and r.trend.slope_per_decade > 0 and cc.outcome == "same_direction_one_unsure":
            break
    else:
        pytest.fail("no seed gave an unsure headline with a sure partner")
    assert "It is sure. Our main result is not sure yet." in cc.text.simple
    assert "Está seguro" in cc.text.simple_es and "principal aún no" in cc.text.simple_es
    short_sentences_ok(cc.text.simple)
    assert "only the partner is significant" in cc.text.scientific


# -- C3: "only covers land" only when the source answered with fill values -------------------------

def land_member(ctx):
    ctx.catalog.variables["merra2_t2m"].domain = "land"
    ctx.catalog.variables["merra2_t2m"].listed = True
    return next(e for e in scan_region(ctx, point_region(), "heat").entries if e.variable_id == "merra2_t2m")


def test_land_product_not_fetched_does_not_claim_land_only():
    ctx, _ = make_ctx({})  # nothing saved for this place
    e = land_member(ctx)
    assert e.availability == "no_data_here"
    assert e.reason.simple == "We don't have this data saved for this place yet."
    assert "tierra" not in e.reason.simple_es


def test_land_product_with_fill_values_says_land_only():
    months = [f"{y}-{m:02d}" for y in range(2002, 2022) for m in range(1, 13)]
    raw = RawSeries(months, np.full(len(months), np.nan), Provenance(source_kind="synthetic", source_ref="x"))
    ctx, _ = make_ctx({"merra2_t2m": raw})
    assert land_member(ctx).reason.simple == "No data for this spot. This measurement only covers land."


def test_giovanni_source_marks_all_fill_but_not_an_empty_cache(tmp_path):
    src = Fake(tmp_path, lambda *a: fx("giovanni_gldas_soilmoi_ocean.csv"))
    pt = region("point", (-82.125, -6.125, -82.125, -6.125))
    assert src.fetch(SOIL, pt) is None and src.all_fill(SOIL, pt)
    off = Fake(tmp_path / "empty", None, offline=True)
    assert off.fetch(SOIL, pt) is None and not off.all_fill(SOIL, pt)  # nothing fetched: not "land only"


def test_engine_gate_distinguishes_fill_from_not_fetched(tmp_path):
    cat = Catalog.load(repo_root() / "catalog")
    pt = custom_region("point", (-82.125, -6.125))
    ctx = EngineContext(cat, SourceChain([Fake(tmp_path, lambda *a: fx("giovanni_gldas_soilmoi_ocean.csv"))]))
    assert analyze_region(ctx, pt, "gldas_soil_moist").gates.checks[0].code == "all_fill"
    ctx2 = EngineContext(cat, SourceChain([Fake(tmp_path / "e", None, offline=True)]))
    assert analyze_region(ctx2, pt, "gldas_soil_moist").gates.checks[0].code == "no_data"


# -- H1: Giovanni API data_bbox holds cell edges: no second widening -------------------------------

def test_bbox_chip_not_triggered_by_giovanni_api_edges():
    cat = Catalog.load(repo_root() / "catalog")
    reg = cat.regions["cajamarca_highlands"]
    box = list(reg.geometry.bbox)
    api = Provenance(source_kind="giovanni_api", source_ref="x", requested_bbox=box, data_bbox=box, n_cells=6)
    assert bbox_chip(api, reg, 1.0) is None
    csv = api.model_copy(update={"source_kind": "giovanni_csv"})
    assert bbox_chip(csv, reg, 1.0) is not None  # CSV bounds are cell centres and still widen


# -- H2 / H3: partner outage and oversized boxes ---------------------------------------------------

def test_partner_outage_in_the_detail_path_is_only_one_not_a_503():
    ctx, _ = make_ctx({"power_t2m": make_raw("1990-01", "2021-12", seed=1, **STRONG), "airs_t_surf_day": LIVE_DOWN})
    r = analyze_region(ctx, point_region(), "power_t2m")  # failed_fetches is None: the detail path
    assert r.robustness.cross_check.outcome == "only_one"


def test_partner_box_too_large_is_only_one_with_its_own_words():
    ctx, _ = make_ctx({"power_t2m": make_raw("1990-01", "2021-12", seed=1, **STRONG),
                       "airs_t_surf_day": GiovanniBoxTooLarge("too many requests")})
    cc = analyze_region(ctx, point_region(), "power_t2m").robustness.cross_check
    assert cc.outcome == "only_one" and "too big" in cc.text.scientific and "reached" not in cc.text.scientific


def test_box_too_large_is_its_own_gate_and_availability_and_never_raises():
    big = GiovanniBoxTooLarge("box too large (500 requests needed, limit 400)")
    ctx, _ = make_ctx({"power_t2m": make_raw("1981-01", "2021-12", seed=1, **STRONG), "airs_t_surf_day": big})
    r = analyze_region(ctx, point_region(), "airs_t_surf_day")  # detail path: a result, not a 503
    gate = r.gates.checks[0]
    assert gate.code == "box_too_large"
    assert gate.detail.simple == "This area is too big for this measurement. Pick a smaller area or a point."
    assert gate.detail.simple_es
    e = next(e for e in scan_region(ctx, point_region(), "heat").entries if e.variable_id == "airs_t_surf_day")
    assert e.availability == "box_too_large" and "try again" not in e.reason.simple.lower()
    assert e.reason.simple.startswith("This area is too big")


def test_box_too_large_scan_result_is_cacheable(monkeypatch):
    from trend_detective import api

    big = GiovanniBoxTooLarge("box too large")
    ctx, _ = make_ctx({"power_t2m": make_raw("1981-01", "2021-12", seed=1, **STRONG), "airs_t_surf_day": big})
    monkeypatch.setattr(api, "ctx", lambda: ctx)
    api._custom_scan_cached.cache_clear()
    api._custom_scan_cached("point", (-78.5, -7.16), "heat")  # would raise _NotCacheable if it were not cacheable
    assert api._custom_scan_cached.cache_info().currsize == 1
    api._custom_scan_cached.cache_clear()


# -- M1: a non-directional statement is not a reason to expect change -----------------------------

def test_either_direction_is_a_caution_not_a_pass():
    ctx, _ = make_ctx({"power_rh2m": make_raw("1981-01", "2021-12", seed=1, slope_per_decade=0.5, base=60.0)})
    r = analyze_region(ctx, custom_region("point", (77.2, 28.6)), "power_rh2m")
    assert r.published.direction == "either"
    assert next(c for c in r.selection.checks if c.code == "expectation").status == "caution"


# -- M4: a broken persistence test is not "too many months are missing" ---------------------------

def test_failed_test_run_is_not_reported_as_missing_months(monkeypatch):
    def boom(*a, **k):
        raise ValueError("the Mann-Kendall variance correction is undefined for this series")

    monkeypatch.setattr(engine, "trend_tests", boom)
    ctx, _ = make_ctx({"power_t2m": make_raw("1981-01", "2021-12", seed=1, **STRONG)})
    e = next(e for e in scan_region(ctx, point_region(), "heat").entries if e.variable_id == "power_t2m")
    assert e.availability == "available" and e.verdict_label == "cant_tell"
    assert e.reason.simple == "We couldn't run the checks on this data."
    assert e.reason.simple_es and "meses" not in e.reason.simple_es
    assert "missing" not in e.reason.simple.lower()


# -- bounded series cache --------------------------------------------------------------------------

def test_series_cache_is_bounded_and_least_recently_used():
    ctx, _ = make_ctx({"power_t2m": make_raw("1990-01", "2021-12", seed=1),
                       "airs_t_surf_day": make_raw("2002-09", "2021-12", seed=2),
                       "airs_t_surf_night": make_raw("2002-09", "2021-12", seed=3)})
    ctx.cache_size = 2
    reg = point_region()
    ctx.series("power_t2m", reg)
    ctx.series("airs_t_surf_day", reg)
    ctx.series("power_t2m", reg)  # refresh: airs_t_surf_day is now the oldest
    ctx.series("airs_t_surf_night", reg)
    assert len(ctx._cache) == 2
    assert {k[0] for k in ctx._cache} == {"power_t2m", "airs_t_surf_night"}
