"""C2/C3: AR6 expectations (stage-1 check b for any place), the published finding, instrument caveats, independence."""

import re
from types import SimpleNamespace
from pathlib import Path

import pytest
from synthetic import make_ctx, make_raw

from trend_detective.api import custom_region
from trend_detective.catalog import Catalog
from trend_detective.engine import analyze_region
from trend_detective.independence import independence_note
from trend_detective.published import agreement_of, match

ROOT = Path(__file__).resolve().parents[2]

DELHI = (77.21, 28.61)
TAMANRASSET = (5.52, 22.79)

# Spanish rules for the Simple view (CLAUDE.md R5): words a child never sees.
BANNED_ES = re.compile(
    r"significativ|d[eé]cada|anomal[ií]a|intervalo de confianza|estad[ií]sticamente|valor p|\bprueba|sin cambio|causad[oa] por",
    re.IGNORECASE,
)


@pytest.fixture(scope="module")
def cat() -> Catalog:
    return Catalog.load(ROOT / "catalog")


def power_raw(slope, sd=0.3, seed=1, base=25.0):
    return make_raw("1981-01", "2024-12", slope_per_decade=slope, sd=sd, seed=seed, base=base)


# -- catalog artifacts ---------------------------------------------------------------------------

def test_expectations_load_with_spanish_everywhere(cat):
    assert len(cat.published) == 39
    for e in cat.published:
        assert e.statement.simple_es and e.statement.scientific_es, (e.ar6_region, e.variable_kind, e.metric)
        assert e.confidence_es, (e.ar6_region, e.variable_kind, e.metric)
        assert not BANNED_ES.search(e.statement.simple_es), e.statement.simple_es
        for sentence in re.split(r"(?<=[.!?])\s+", e.statement.simple_es):
            assert len(sentence.split()) <= 14, sentence  # R5: about 12 words, Spanish runs a little longer
        assert e.source and e.checked_by and e.opened_at


def test_every_variable_card_declares_a_kind(cat):
    kinds = {v.id: v.kind for v in cat.variables.values()}
    assert kinds["power_t2m"] == kinds["airs_t_surf_day"] == "temperature"
    assert kinds["gpm_precip"] == kinds["power_precip"] == "rainfall"
    assert kinds["airs_rh_surf_day"] == kinds["power_rh2m"] == "humidity"
    assert kinds["gldas_soil_moist"] == "soil_water"
    assert kinds["omi_aod"] == kinds["power_aod"] == "haze"
    assert kinds["omi_no2"] == "no2"
    assert kinds["gldas_evap"] == "other"


def test_instrument_caveats_are_catalog_artifacts_with_citations(cat):
    omi = {a.kind: a for a in cat.variables["omi_aod"].artifacts}["row_anomaly"]
    assert omi.start == "2007-06" and omi.action == "flag"  # keep the data, show a chip
    assert [a.start for a in cat.variables["omi_no2"].artifacts if a.kind == "row_anomaly"] == ["2007-06"]
    gpm = cat.variables["gpm_precip"]
    assert gpm.record_start == "2000-06"  # Jan 1998 to May 2000 is lower quality (IMERG V07 release notes)
    assert [(a.start, a.action) for a in gpm.artifacts] == [("2014-06", "flag")]
    gldas_starts = [a.start for a in cat.variables["gldas_soil_moist"].artifacts]
    assert "2001-03" in gldas_starts and "2025-06" in gldas_starts
    for vid in ("omi_aod", "omi_no2", "gpm_precip", "gldas_soil_moist", "gldas_evap"):
        for a in cat.variables[vid].artifacts:
            n = a.note
            assert n.simple_es and n.scientific_es, (vid, a.start)
            assert "Source" in n.scientific and "Fuente" in n.scientific_es, (vid, a.start)  # each carries its citation
            assert a.action == "flag", (vid, a.start)  # only the Aqua pass-time drift cuts data


def test_instrument_cards_corrected(cat):
    omi = cat.instruments["omi"]
    assert "OMAERUVd 1°" in omi.measures.scientific and "OMNO2d 0.25°" in omi.measures.scientific
    assert "13:45" in omi.how.scientific and "row anomaly" in omi.how.scientific
    assert "aura.gsfc.nasa.gov" not in omi.link
    assert "Noah 3.6" in cat.instruments["gldas"].measures.scientific
    assert "Noah 3.6" in cat.instruments["gldas"].measures.scientific_es
    assert cat.instruments["merra2"].assimilates == ["airs"]


def test_new_glossary_terms_have_spanish(cat):
    for gid in ("heavy_rainstorms", "dry_spells", "polluting_gas", "ipcc"):
        g = cat.glossary[gid]
        assert g.term.simple_es and g.definition.simple_es and g.definition.scientific_es, gid


# -- matching: mean statements only ---------------------------------------------------------------

def test_extremes_statements_never_stand_in_for_a_mean_variable(cat):
    m = match(cat, custom_region("point", DELHI), cat.variables["power_t2m"])
    assert m.ar6 and m.ar6[0] == "SAS"
    assert m.mean.metric == "mean_annual" and m.mean.direction == "up"
    assert [e.metric for e in m.context] == ["hot_extremes"]  # context only, never the expectation
    rain = match(cat, custom_region("point", DELHI), cat.variables["power_precip"])
    assert rain.mean.metric == "mean_annual"
    assert {e.metric for e in rain.context} == {"heavy_precipitation", "meteorological_drought"}
    for vid in ("power_t2m", "power_precip", "omi_aod", "omi_no2", "power_rh2m", "gldas_soil_moist"):
        m2 = match(cat, custom_region("point", DELHI), cat.variables[vid])
        assert m2.mean is None or not m2.mean.about_extremes


def test_variables_with_no_assessment_get_no_match(cat):
    assert match(cat, custom_region("point", DELHI), cat.variables["gldas_evap"]).mean is None
    ocean = match(cat, custom_region("point", (-30.0, 0.0)), cat.variables["power_t2m"])
    assert ocean.ar6 is None and ocean.mean is None


def test_humidity_falls_back_to_the_worldwide_land_pattern(cat):
    m = match(cat, custom_region("point", DELHI), cat.variables["power_rh2m"])
    assert m.mean.ar6_region == "GLOBAL_LAND" and m.mean.direction == "either"


def test_wisconsin_uses_the_region_centre(cat):
    wi = cat.regions["wisconsin"]
    assert match(cat, wi, cat.variables["power_t2m"]).ar6[0] in {"CNA", "ENA"}
    assert match(cat, wi, cat.variables["power_t2m"]).mean.direction == "up"


# -- stage 1 for a custom place --------------------------------------------------------------------

def expectation_check(r):
    return next(c for c in r.selection.checks if c.code == "expectation")


def test_stage1_expectation_from_ar6_for_a_custom_point():
    ctx, _ = make_ctx({"power_t2m": power_raw(0.5)})
    r = analyze_region(ctx, custom_region("point", DELHI), "power_t2m")
    c = expectation_check(r)
    assert c.status == "pass"
    assert c.detail.simple.startswith("This is what scientists who studied this region say.")
    assert "IPCC AR6, region SAS" in c.detail.scientific and "IPCC confidence:" in c.detail.scientific
    assert c.detail.simple_es.startswith("Esto dicen los científicos que estudiaron esta región.")
    assert "Confianza según el IPCC" in c.detail.scientific_es
    assert "Source: Gutierrez" not in c.detail.scientific  # the citation is the one for SAS, not the Andes


def test_unclear_is_a_caution_with_the_honest_text():
    ctx, _ = make_ctx({"power_precip": power_raw(0.0, sd=0.3, base=3.0)})
    r = analyze_region(ctx, custom_region("point", TAMANRASSET), "power_precip")
    c = expectation_check(r)
    assert c.status == "caution"
    assert c.detail.simple == "Scientists don't have enough data here yet."
    assert c.detail.simple_es == "Los científicos aún no tienen suficientes datos aquí."
    # unclear: nothing to compare with
    assert r.published is not None and r.published.direction is None and r.published.agreement is None


def test_region_card_expectation_still_wins_over_ar6():
    ctx, _ = make_ctx({"power_t2m": power_raw(0.4)})
    wi = ctx.catalog.regions["wisconsin"]
    own = wi.expectation_for("power_t2m")
    r = analyze_region(ctx, wi, "power_t2m")
    assert expectation_check(r).detail.simple == own.reason.simple


def test_no_expectation_for_variable_without_assessment_is_unchanged():
    ctx, _ = make_ctx({"gldas_evap": make_raw("2000-01", "2024-12", slope_per_decade=0.3, sd=0.3, seed=2, base=3e-5)})
    r = analyze_region(ctx, custom_region("point", DELHI), "gldas_evap")
    assert expectation_check(r).status == "caution" and r.published is None


# -- C3: published finding and agreement -----------------------------------------------------------

def test_published_agrees_when_significant_with_the_same_sign():
    ctx, _ = make_ctx({"power_t2m": power_raw(0.5)})
    r = analyze_region(ctx, custom_region("point", DELHI), "power_t2m")
    assert r.verdict.label == "significant"
    p = r.published
    assert p.agreement == "agrees" and p.direction == "up" and p.scope == "mean" and p.ar6_region == "SAS"
    assert p.statement.simple.startswith("This is what scientists who studied this region say.")
    assert p.statement.simple_es and p.statement.scientific_es
    assert "IPCC AR6" in p.statement.scientific and p.source and p.confidence and p.confidence_es
    assert [c.scope for c in r.published_context] == ["extremes"]
    assert r.published_context[0].agreement is None
    assert r.published_context[0].statement.scientific.startswith("About extremes")


def test_published_differs_when_significant_with_the_opposite_sign():
    ctx, _ = make_ctx({"power_t2m": power_raw(-0.5)})
    r = analyze_region(ctx, custom_region("point", DELHI), "power_t2m")
    assert r.verdict.label == "significant" and r.published.agreement == "differs"


def test_published_too_soon_when_not_significant():
    ctx, _ = make_ctx({"power_t2m": power_raw(0.0, sd=2.0, seed=4)})
    r = analyze_region(ctx, custom_region("point", DELHI), "power_t2m")
    assert r.verdict.label != "significant" and r.published.agreement == "too_soon"


def test_either_direction_has_no_agreement():
    ctx, _ = make_ctx({"power_rh2m": power_raw(0.5, base=60.0)})
    r = analyze_region(ctx, custom_region("point", DELHI), "power_rh2m")
    assert r.published.direction == "either" and r.published.agreement is None
    assert r.published.ar6_region == "GLOBAL_LAND"


def test_partial_statement_never_claims_differs(cat):
    entry = match(cat, custom_region("point", DELHI), cat.variables["power_precip"]).mean
    assert entry.direction == "down" and entry.partial
    assert agreement_of(entry, "significant", -0.2) == "agrees"
    assert agreement_of(entry, "significant", +0.2) == "too_soon"  # Delhi may lie outside the drying area
    assert agreement_of(entry, "borderline", -0.2) == "too_soon"
    assert agreement_of(entry, None, None) == "too_soon"


def test_published_is_set_even_when_the_gates_fail():
    ctx, _ = make_ctx({"power_t2m": make_raw("2015-01", "2019-12", slope_per_decade=0.5, sd=0.3, seed=1)})
    r = analyze_region(ctx, custom_region("point", DELHI), "power_t2m")
    assert not r.gates.passed
    assert r.published.agreement == "too_soon"


def test_no_causal_or_banned_wording_in_published_texts(cat):
    for e in cat.published:
        for t in (e.statement.simple, e.statement.simple_es):
            assert not re.search(r"caused by|proves|no change|causad[oa] por|sin cambio", t, re.IGNORECASE), t


# -- independence ------------------------------------------------------------------------------------

def test_independence_note_flags_power_vs_airs(cat):
    note = independence_note(cat.variables["power_t2m"], cat.variables["airs_t_surf_day"], cat)
    assert note.simple == "These two partly share data, so they are not fully separate checks."
    assert "1 Sep 2002" in note.scientific and "Gelaro" in note.scientific
    assert note.simple_es and "septiembre de 2002" in note.scientific_es
    # symmetric
    assert independence_note(cat.variables["airs_rh_surf_day"], cat.variables["power_rh2m"], cat) is not None


def test_independence_note_is_none_for_separate_instruments(cat):
    assert independence_note(cat.variables["omi_aod"], cat.variables["power_aod"], cat) is None
    assert independence_note(cat.variables["gpm_precip"], cat.variables["power_precip"], cat) is None
    assert independence_note(cat.variables["omi_no2"], cat.variables["omi_aod"], cat) is None


def test_agreement_needs_a_window_covering_half_the_stated_period():
    """A 2002-2021 satellite window says nothing about a 1961-2015 statement (audit finding 10)."""
    from trend_detective.published import stated_span

    assert stated_span("1961-2015") == (1961, 2015)
    assert stated_span("since about 1950 (Table 11.1 header)") == (1950, 2020)
    assert stated_span("not stated") is None
    entry = SimpleNamespace(direction="up", partial=False, period="1961-2015")
    assert agreement_of(entry, "significant", +0.3, (2002, 2021)) == "too_soon"  # 14 of 55 years
    assert agreement_of(entry, "significant", -0.3, (2002, 2021)) == "too_soon"  # not "differs" either
    assert agreement_of(entry, "significant", +0.3, (1981, 2025)) == "agrees"  # 35 of 55 years
    unknown = SimpleNamespace(direction="up", partial=False, period="not stated")
    assert agreement_of(unknown, "significant", +0.3, (1981, 2025)) == "too_soon"
