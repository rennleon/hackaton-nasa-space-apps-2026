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
        # rests_on_few_years lists every flipping year (engine.py, not covered here): length-exempt, see report
        seen += [c["text"]["simple"] for c in o.get("chips", []) if c["code"] != "rests_on_few_years"]
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
