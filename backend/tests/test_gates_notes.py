"""A4 + contradictions #5/#6: zero-month gate, near-bound chip, detectability wording, short-record note."""

import re
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from trend_detective.catalog import Catalog
from trend_detective.contract import Selection, SelectionCheck, Text, Window
from trend_detective.gates import MAX_ZERO_MONTH_SHARE, near_bound_chip, quality
from trend_detective.prepare import prepare
from trend_detective.selection import detect_sentences, kid_amount
from trend_detective.verdict import VerdictInputs, short_record_note

ROOT = Path(__file__).resolve().parents[2]
BANNED = re.compile(
    r"p-value|\bsignifican|\bdecade|\banomal|autocorrelation|percentage points|confidence interval|"
    r"statistically|mann.kendall|\bols\b|hamed|%RH|kg m|\bK\b",
    re.IGNORECASE,
)


@pytest.fixture(scope="module")
def cat() -> Catalog:
    return Catalog.load(ROOT / "catalog")


def _prepared(values: np.ndarray):
    n = len(values)
    months = [f"{2000 + i // 12}-{i % 12 + 1:02d}" for i in range(n)]
    window = Window(start=months[0], end=months[-1], reason="default", years=n / 12)
    return prepare(SimpleNamespace(months=months, values=values), window)


def _words(s: str) -> int:
    return max(len(x.split()) for x in re.split(r"(?<=[.!?])\s+", s))


def _zero_check(p, var):
    return next(c for c in quality(p, var) if c.code == "zero_months")


def test_zero_months_gate_fails_for_dry_series(cat):
    rain = next(v for v in cat.variables.values() if v.floor is not None)
    vals = np.random.default_rng(0).uniform(1, 5, 240)
    vals[:120] = 0.0  # half the months are zero
    chk = _zero_check(_prepared(vals), rain)
    assert not chk.passed
    assert chk.detail.simple == "It hardly ever rains here, so monthly numbers can't show a trend."
    assert "50.0%" in chk.detail.scientific and f"{MAX_ZERO_MONTH_SHARE:.0%}" in chk.detail.scientific


def test_zero_months_gate_threshold_and_negatives(cat):
    temp = next(v for v in cat.variables.values() if v.floor is None and v.units.display not in ("%RH", "%"))
    assert _zero_check(_prepared(np.full(240, -3.0)), temp).passed  # below zero is not "zero"
    vals = np.ones(240)
    vals[:72] = 0.0  # exactly 30%: not "more than"
    assert _zero_check(_prepared(vals), temp).passed
    vals[:73] = 0.0
    assert not _zero_check(_prepared(vals), temp).passed


def test_near_bound_chip(cat):
    rh = next(v for v in cat.variables.values() if v.units.display == "%RH")
    chip = near_bound_chip(_prepared(np.full(240, 97.0)), rh)
    assert chip and chip.code == "near_bound" and chip.severity == "info"
    assert "97.0" in chip.text.scientific and not BANNED.search(chip.text.simple)
    assert near_bound_chip(_prepared(np.full(240, 3.0)), rh)
    assert near_bound_chip(_prepared(np.full(240, 60.0)), rh) is None
    temp = next(v for v in cat.variables.values() if v.units.display not in ("%RH", "%"))
    assert near_bound_chip(_prepared(np.full(240, 99.0)), temp) is None


@pytest.mark.parametrize("mdt,expected,ok", [
    (0.4, 0.45, True), (0.6, 0.45, False),  # both round below 1: no numbers, no contradiction
    (0.9, 1.2, True), (1.6, 1.4, False),  # same rounded amount
    (2.6, 1.2, False), (0.3, 2.4, True),  # amounts differ: shown
])
def test_detectability_wording_never_contradicts(mdt, expected, ok):
    text, got = detect_sentences(mdt, expected, "degrees")
    assert got is ok
    assert not re.search(r"\d\.\d|%", text) and not BANNED.search(text)
    assert _words(text) <= 14
    if kid_amount(mdt) == kid_amount(expected):
        assert "less than 1" not in text and "about" not in text
        assert ("long enough" in text) if ok else ("bigger than a typical one" in text)
    else:
        assert ("That's enough" in text) if ok else ("can't see that yet" in text)


def test_detectability_without_reference_size():
    assert detect_sentences(0.3, None, "degrees")[0] == "We can see changes under 1 degree. That is per 10 years."
    assert "about 2 degrees" in detect_sentences(2.2, None, "degrees")[0]


def _inputs(cat, slope, selection):
    return VerdictInputs(
        variable=next(iter(cat.variables.values())), region=next(iter(cat.regions.values())),
        window=Window(start="2002-01", end="2021-12", reason="default", years=20), season=None,
        slope_per_decade=slope, ci_low=0, ci_high=0, p_a=0.01, p_b=0.01, p_c=None, r1=0.1, n_eff=100,
        years_needed=10, years_available=20, selection=selection,
    )


def _selection(status):
    return Selection(
        worth_investigating=status != "fail",
        checks=[SelectionCheck(code="detectability", status=status, detail=Text(simple="x", scientific="x"))],
        mdt_per_decade=0.8, expected_per_decade=0.3,
    )


def test_short_record_note_explains_sure_result(cat):
    notes = short_record_note("significant", _inputs(cat, 0.5, _selection("fail")))
    assert len(notes) == 1
    n = notes[0]
    assert n.simple.startswith("This record is short for a typical change.")
    assert not BANNED.search(n.simple) and _words(n.simple) <= 14 and not re.search(r"\d", n.simple)
    assert "MDT" in n.scientific and "expected" in n.scientific


def test_short_record_note_only_when_it_applies(cat):
    assert short_record_note("significant", _inputs(cat, 0.5, _selection("pass"))) == []
    assert short_record_note("significant", _inputs(cat, 0.5, None)) == []
    assert short_record_note("borderline", _inputs(cat, 0.5, _selection("fail"))) == []
    assert short_record_note("significant", _inputs(cat, 0.1, _selection("fail"))) == []  # not bigger than typical


# --- Simple-view amounts use the kid scale (regression: 0.031 AOD/decade was shown as "under 1 point on the
# haze scale" beside "we'd know in about 21 years"; the haze scale is AOD x 100, so it is about 3 points)


def test_detectability_amount_on_the_kid_scale():
    assert detect_sentences(3.1, None, "on the haze scale")[0] == (
        "We can see changes from about 3 points on the haze scale. That is per 10 years.")
    assert detect_sentences(0.4, None, "on the haze scale")[0] == (
        "We can see changes under 1 point on the haze scale. That is per 10 years.")


def test_stage1_detectability_scales_display_units_to_kid_units(cat):
    from trend_detective.selection import stage1

    aod = cat.variables["power_aod"]
    rng = np.random.default_rng(0)
    t = np.arange(252) / 12.0
    y = rng.normal(0, 0.03, 252)  # AOD-sized noise: MDT of a few hundredths per decade
    sel = stage1(aod, next(iter(cat.regions.values())), None, [], [], t, y, 21.0, 12)
    det = next(c for c in sel.checks if c.code == "detectability")
    kid = sel.mdt_per_decade * aod.kid_units.scale
    assert kid >= 1, "fixture should give a kid-scale MDT of at least 1 point"
    assert f"about {round(kid)} point" in det.detail.simple and "under 1" not in det.detail.simple
    assert "puntos en la escala de bruma" in det.detail.simple_es or "punto en la escala de bruma" in det.detail.simple_es


def test_tell_me_more_amount_is_on_the_kid_scale_without_decimals(cat):
    from trend_detective.verdict import build_verdict

    x = _inputs(cat, -0.011, None)
    x.variable = cat.variables["power_aod"]
    v = build_verdict("possibly_changing", x)
    assert "about 1 point on the haze scale every 10 years" in v.sentence.simple
    assert not re.search(r"\d\.\d", v.sentence.simple) and not re.search(r"\d,\d", v.sentence.simple_es)


def test_small_change_across_a_rounding_edge_is_less_than_one_not_about_one(cat):
    # regression: 13.4 -> 13.7 degrees rounds to 13 -> 14, but the change is 0.3, never "about 1 degree"
    from trend_detective.contract import ThenNow
    from trend_detective.verdict import build_verdict

    x = _inputs(cat, 0.15, None)
    x.variable = cat.variables["airs_t_surf_night"]
    x.then_now = ThenNow(year_then=2002, year_now=2021, value_then=13.4, value_now=13.7,
                         kid_scale=1, kid_label="degrees", kid_label_es="grados")
    v = build_verdict("significant", x)
    assert v.how_much.simple == "Since 2002 it went up by less than 1 degree."
    assert v.how_much.simple_es == "Desde 2002 subió menos de 1 grado."


@pytest.mark.parametrize("why,en,es", [
    ("unreachable", "couldn't reach the other source, OMI", "No pudimos conectar con la otra fuente, OMI"),
    ("no_data", "The other source, OMI, has no data", "La otra fuente, OMI, no tiene datos"),
    ("short", "shares too few years", "comparte muy pocos años"),
    ("quality", "has data here, but it failed our checks", "tiene datos aquí, pero no pasó nuestras revisiones"),
    ("error", "couldn't compare with the other source, OMI", "No pudimos comparar con la otra fuente, OMI"),
])
def test_second_source_message_says_why(cat, why, en, es):
    from trend_detective.engine import _only_one

    c = _only_one(cat.variables["omi_aod"], "detail.", "detalle.", why=why)
    assert c.outcome == "only_one" and en in c.text.simple and es in c.text.simple_es
    assert "Only one instrument" not in c.text.simple and _words(c.text.simple) <= 14


def test_spanish_about_one_is_never_unos_1():
    from trend_detective.verdict import about_es

    assert about_es(1, "en la escala de humedad (0 a 100)") == "alrededor de 1 punto en la escala de humedad (0 a 100)"
    assert about_es(1, "grados") == "alrededor de 1 grado"
    assert about_es(3, "grados") == "unos 3 grados"


def test_merra2_aerosol_cards_flag_frozen_emissions(cat):
    # Randles et al. 2017 Table 1: final emission year persisted; flagged so a window across it is never "sure"
    for vid, start in (("merra2_sulfate", "2009-01"), ("merra2_oc", "2007-01")):
        arts = cat.variables[vid].artifacts
        assert [(a.kind, a.start, a.action) for a in arts] == [("frozen_emissions", start, "flag")]
        assert "doi:10.1175/JCLI-D-16-0609.1" in arts[0].note.scientific and arts[0].note.simple_es
