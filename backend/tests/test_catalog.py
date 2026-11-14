from pathlib import Path

import pytest
from pydantic import ValidationError

from trend_detective.catalog import Catalog, VariableCard

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def cat() -> Catalog:
    return Catalog.load(ROOT / "catalog")


def test_every_theme_has_a_target(cat):
    for theme in cat.themes:
        assert any(role == "target" for _, role in cat.theme_members(theme)), theme


def test_both_registers_present_and_untruncated(cat):
    for v in cat.variables.values():
        for text in (v.name, v.definition):
            assert text.simple.strip() and text.scientific.strip()
            assert text.scientific.count("(") == text.scientific.count(")"), v.id  # YAML comma truncation
    for g in cat.glossary.values():
        assert g.definition.simple and g.definition.scientific


def test_region_rules(cat):
    hl = cat.regions["cajamarca_highlands"]
    assert hl.geometry.bbox == [-79.0, -8.0, -77.0, -5.0]  # grid-aligned (rule 3)
    assert hl.geometry.cells(1.0) >= 4  # rule 2


def test_unknown_keys_are_rejected(cat):
    data = cat.variables["gpm_precip"].model_dump()
    data["unexpected"] = 1
    with pytest.raises(ValidationError):
        VariableCard(**data)
