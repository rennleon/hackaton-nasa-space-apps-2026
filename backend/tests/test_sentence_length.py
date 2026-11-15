"""R5: Simple-view sentences built from the kid labels stay within 14 words, for every variable, EN and ES."""

import re
from pathlib import Path

import pytest

from trend_detective.catalog import Catalog
from trend_detective.contract import Chip, Season, Text, ThenNow, Window
from trend_detective.selection import (
    about_es,
    amount_en,
    detect_sentences,
    detect_sentences_es,
    less_than_one,
    less_than_one_es,
)
from trend_detective.verdict import MAX_WORDS, VerdictInputs, _per10, break_years, build_verdict

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def cat() -> Catalog:
    return Catalog.load(ROOT / "catalog")


def _longest(s: str) -> int:
    return max(len(x.split()) for x in re.split(r"(?<=[.!?])\s+", s.strip()))


def test_kid_label_sentences_stay_short(cat: Catalog):
    for v in cat.variables.values():
        en, es = v.kid_units.label, v.kid_units.label_es
        for k in (0.4, 1, 5, 40):
            assert _longest(detect_sentences(k, 3.0, en)[0]) <= MAX_WORDS, (v.id, k)
            assert _longest(detect_sentences(k, 0.5, en)[0]) <= MAX_WORDS, (v.id, k)
            if es:
                assert _longest(detect_sentences_es(k, 3.0, es)) <= MAX_WORDS, (v.id, k)
        amount = less_than_one(en)
        for lead in ("it changes", "it may change"):  # "Every 10 years it may change by ..."
            for amt in (amount, f"about {amount_en(40, en)}"):
                assert _longest(_per10(lead, amt) + ".") <= MAX_WORDS, v.id
        how = [f"Since 2002 it went down by {amount}.", f"Since 2002 it went down by about {amount_en(40, en)}."]
        assert all(_longest(h) <= MAX_WORDS for h in how), v.id
        if es:
            for amt in (less_than_one_es(es), about_es(40, es)):
                assert _longest(_per10("puede cambiar", amt, "es") + ".") <= MAX_WORDS, v.id
                assert _longest(f"Desde 2002 bajó {amt}.") <= MAX_WORDS, v.id


SEASON_IT = re.compile(r"(season|summer|winter|spring|autumn|fall|temporada|verano|invierno)\s+(it|ello)\b", re.IGNORECASE)
FRAGMENT = re.compile(r"(^|[.!?]\s+)(That is|Eso es)\b")
LABELS = ("significant", "significant_fragile", "borderline", "possibly_changing", "no_detectable_change")


def _chips(v) -> list[Chip]:
    chips = [Chip(code=f"known_artifact_{a.kind}_{a.start}", severity="warning", text=a.note)
             for a in v.artifacts if a.action == "flag"]
    chips.append(Chip(code="rests_on_few_years", severity="warning",
                      text=Text(simple="A single year could change this a lot.", scientific="Few years.",
                                simple_es="Un solo año podría cambiar mucho esto.", scientific_es="Pocos años.")))
    return chips


def _inputs(v, region, season, label, up, chips, then_now):
    return VerdictInputs(
        variable=v, region=region, window=Window(start="2002-09", end="2021-12", reason="default", years=19.3),
        season=season, slope_per_decade=0.5 if up else -0.5, ci_low=0.1, ci_high=0.9,
        p_a=0.01 if label.startswith("signif") else 0.2, p_b=0.01 if label.startswith("signif") else 0.2, p_c=None,
        r1=0.2, n_eff=80, years_needed=25 if label == "possibly_changing" else 90, years_available=19.3,
        warning_chips=chips if label == "significant_fragile" else [], then_now=then_now,
    )


def test_every_simple_sentence_is_short_and_whole(cat: Catalog):
    checked = 0
    for v in cat.variables.values():
        seasons = [None] + []
        then_now = ThenNow(year_then=2002, year_now=2021, value_then=66.4, value_now=69.2,
                           kid_scale=v.kid_units.scale, kid_label=v.kid_units.label, kid_label_es=v.kid_units.label_es)
        custom = next(iter(cat.regions.values())).model_copy(
            update={"id": "custom_1", "name": Text(simple="Your place", scientific="Point", simple_es="Tu lugar",
                                                   scientific_es="Punto")})
        for r in [*cat.regions.values(), custom]:
            for season in seasons + [Season(id=s.id, name=s.name, months=s.months) for s in r.seasons_for(v.id)]:
                for label in LABELS:
                    for up in (True, False):
                        x = _inputs(v, r, season, label, up, _chips(v), then_now)
                        out = build_verdict(label, x)
                        for t in (out.answer, out.how_much, out.sentence):
                            for text in (t.simple, t.simple_es):
                                if not text:
                                    continue
                                where = (v.id, r.id, season and season.id, label, text)
                                assert _longest(text) <= MAX_WORDS, where
                                assert not FRAGMENT.search(text), where
                                assert not SEASON_IT.search(text), where
                        checked += 1
    assert checked > 100


def test_known_breaks_are_one_combined_line(cat: Catalog):
    v = next(v for v in cat.variables.values() if sum(a.action == "flag" for a in v.artifacts) >= 3)
    chips = _chips(v)
    x = _inputs(v, next(iter(cat.regions.values())), None, "significant_fragile", True, chips, None)
    out = build_verdict("significant_fragile", x)
    years = break_years(chips)
    assert len(years) >= 3
    assert out.sentence.simple.count("The model's inputs changed in") == 1
    assert f"{', '.join(years[:-1])} and {years[-1]}" in out.sentence.simple
    assert f"{', '.join(years[:-1])} y {years[-1]}" in out.sentence.simple_es
    assert out.sentence.simple.count("Small jumps") == 0
    assert "A single year could change this a lot." in out.sentence.simple  # other chips stay as they are
