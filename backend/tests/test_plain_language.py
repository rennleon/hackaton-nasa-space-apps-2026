"""R5 guard (CLAUDE.md): the Simple view must be readable by a primary-school child.

Fails if any simple-register string the engine or catalog produces contains a banned word,
or if the answer / how-much sentences get long.
"""

import re
from pathlib import Path

import pytest

from trend_detective.engine import EngineContext, analyze
from trend_detective.scan import scan

ROOT = Path(__file__).resolve().parents[2]

BANNED = re.compile(
    r"p-value|\bsignifican|\bdecade|\banomal|autocorrelation|percentage points|confidence interval|"
    r"statistically|mann.kendall|\bols\b|hamed|%RH|kg m|\bK\b",
    re.IGNORECASE,
)
BANNED_ES = re.compile(
    r"valor p|\bsignificativ|\bsignifican\b|\bd[eé]cada|\banomal[ií]a|autocorrelaci|puntos porcentuales|"
    r"intervalo de confianza|estad[ií]sticamente|mann.kendall|\bmco\b|hamed|%\s?HR|%\s?RH|kg m|\bK\b|"
    r"\bvalor-p\b|\bprueba\b|\bcausad[oa]s? por\b|\bsin cambio|\bdemuestra",
    re.IGNORECASE,
)
MAX_WORDS = 14  # CLAUDE.md asks ~12; small slack for place names


def simple_strings(obj, path=""):
    """Yield every 'simple' string in a dumped model (Text objects)."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "simple" and isinstance(v, str):
                yield path, v
            else:
                yield from simple_strings(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from simple_strings(v, f"{path}[{i}]")


def text_objects(obj, path=""):
    """Yield every Text-shaped dict (has both 'simple' and 'scientific' strings) in a dumped model."""
    if isinstance(obj, dict):
        if isinstance(obj.get("simple"), str) and isinstance(obj.get("scientific"), str):
            yield path, obj
            return
        for k, v in obj.items():
            yield from text_objects(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from text_objects(v, f"{path}[{i}]")


def sentences(s: str):
    for sentence in re.split(r"(?<=[.!?])\s+", s):
        words = [w for w in re.sub(r"\([^)]*\)", "", sentence).split() if re.search(r"\w", w)]  # brackets = names
        yield sentence, words


@pytest.fixture(scope="module")
def ctx() -> EngineContext:
    return EngineContext.from_repo(ROOT)


@pytest.fixture(scope="module")
def outputs(ctx):
    out = []
    for region in ctx.catalog.regions.values():
        for var in ctx.catalog.variables.values():
            out.append(analyze(ctx, region.id, var.id).model_dump())
            for s in region.seasons_for(var.id):
                out.append(analyze(ctx, region.id, var.id, season_id=s.id).model_dump())
        for theme in ctx.catalog.themes:
            out.append(scan(ctx, region.id, theme).model_dump())
    return out


def test_no_banned_words_in_engine_simple_strings(outputs):
    bad = [(p, s) for o in outputs for p, s in simple_strings(o) if BANNED.search(s)]
    assert not bad, bad[:10]


def test_no_banned_words_in_catalog_simple_strings(ctx):
    cat = ctx.catalog.model_dump()
    # glossary *terms* may name the scientific idea in the scientific register only
    bad = [(p, s) for p, s in simple_strings(cat) if BANNED.search(s)]
    assert not bad, bad[:10]


def test_answers_are_short(outputs):
    for o in outputs:
        v = o.get("verdict")
        if not v:
            continue
        for key in ("answer", "how_much"):
            for sentence in re.split(r"(?<=[.!?])\s+", v[key]["simple"]):
                words = [w for w in re.sub(r"\([^)]*\)", "", sentence).split() if re.search(r"\w", w)]  # brackets = names
                assert len(words) <= MAX_WORDS, (key, sentence)


def test_selection_gate_chip_and_note_strings_are_plain_and_short(outputs):
    """A4: detectability sentences, gate details, chips and verdict notes the engine produces."""
    seen = []
    for o in outputs:
        sel, gates = o.get("selection"), o.get("gates")
        items = (sel["checks"] if sel else []) + (gates["checks"] if gates else [])
        seen += [i["detail"]["simple"] for i in items]
        seen += [c["text"]["simple"] for c in o.get("chips", [])]
        seen += [n["simple"] for n in (o.get("verdict") or {}).get("notes", [])]
    assert seen
    for s in seen:
        assert not BANNED.search(s), s
        assert not re.search(r"\d\.\d|%", s), s
        for sentence in re.split(r"(?<=[.!?])\s+", s):
            words = [w for w in re.sub(r"\([^)]*\)", "", sentence).split() if re.search(r"\w", w)]
            assert len(words) <= MAX_WORDS, sentence


def test_headline_numbers_are_whole_and_not_negative(outputs):
    for o in outputs:
        v = o.get("verdict")
        if v and v["certainty"] in ("sure", "maybe"):
            text = v["how_much"]["simple"]
            assert not re.search(r"\d\.\d", text), text
            assert not re.search(r"-\d", text), text


# ---------------------------------------------------------------- Spanish (L1): same R5 rules

def test_every_text_the_engine_produces_has_spanish(outputs):
    missing = [(p, t["simple"][:50]) for o in outputs for p, t in text_objects(o)
               if not t.get("simple_es") or not t.get("scientific_es")]
    assert not missing, missing[:10]


def test_spanish_simple_strings_follow_the_r5_rules(outputs):
    # banned words, decimals and percentages: every Simple text in every result
    seen = [t["simple_es"] for o in outputs for _, t in text_objects(o) if t.get("simple_es")]
    assert len(seen) > 100
    for s in seen:
        assert not BANNED_ES.search(s), s
        assert not BANNED.search(s), s
    # decimals, percentages and sentence length: the sentences the engine writes
    # (the tell-me-more sentence may show decimals; catalog definitions are not length-checked, like the English ones)
    built = []
    for o in outputs:
        sel, gates, v = o.get("selection"), o.get("gates"), o.get("verdict") or {}
        items = (sel["checks"] if sel else []) + (gates["checks"] if gates else [])
        built += [i["detail"]["simple_es"] for i in items]
        built += [c["text"]["simple_es"] for c in o.get("chips", [])]
        built += [n["simple_es"] for n in v.get("notes", [])]
        built += [v[k]["simple_es"] for k in ("answer", "how_much", "headline") if k in v]
    for s in built:
        assert not re.search(r"\d\.\d|%", s), s
        for sentence, words in sentences(s):
            assert len(words) <= MAX_WORDS, sentence


def test_spanish_catalog_simple_strings_are_plain(ctx):
    for p, t in text_objects(ctx.catalog.model_dump()):
        s = t.get("simple_es") or ""
        assert not BANNED_ES.search(s), (p, s)


def test_spanish_verdict_words_and_numbers(outputs):
    meter = {"Seguro que es real", "Quizás, aún no estamos seguros", "Es muy pronto para saberlo",
             "No podemos saberlo aquí"}
    for o in outputs:
        v = o.get("verdict")
        if not v:
            continue
        assert v["headline"]["simple_es"] in meter, v["headline"]
        if v["certainty"] in ("sure", "maybe"):
            text = v["how_much"]["simple_es"]
            assert not re.search(r"\d\.\d|-\d", text), text
        if v["certainty"] == "too_soon" and "años más" in v["how_much"]["simple_es"]:
            assert re.search(r"Necesitamos mirar unos \d+ años más\.", v["how_much"]["simple_es"])


def test_rests_on_few_years_chip_names_at_most_three_years(ctx, monkeypatch):
    """R5: the plain chip lists 3 years then 'and N more' / 'y N más'; the scientific one keeps all of them."""
    from trend_detective import engine
    from trend_detective.contract import LeaveOneYearOut

    years = [2003, 2004, 2005, 2006, 2007, 2008]
    monkeypatch.setattr(engine, "leave_one_year_out", lambda *a, **k: LeaveOneYearOut(
        slope_min=0.0, slope_max=0.1, worst_p=0.2, flip_years=years))
    chip = next(c for c in analyze(ctx, "cajamarca_highlands", "power_t2m").chips if c.code == "rests_on_few_years")
    assert chip.text.simple == "The answer changes if we leave out 2003, 2004, 2005 and 3 more."
    assert chip.text.simple_es == "La respuesta cambia si dejamos fuera 2003, 2004, 2005 y 3 más."
    assert "2008" in chip.text.scientific and "2008" in chip.text.scientific_es
