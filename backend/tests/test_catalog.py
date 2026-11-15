import json
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


def test_every_theme_has_a_listed_target(cat):
    for theme in cat.themes:
        assert any(role == "target" and v.listed for v, role in cat.theme_members(theme)), theme


def test_listed_giovanni_ids_are_configured_in_giovanni_cloud(cat):
    """Saved copy of https://api.giovanni.earthdata.nasa.gov/configured-variables/ (Nov 2026)."""
    path = Path(__file__).parent / "fixtures" / "giovanni_configured_variables.json"
    configured = set(json.loads(path.read_text())["configured_variables"])
    missing = [v.id for v in cat.variables.values() if v.listed and v.giovanni_id and v.giovanni_id not in configured]
    assert not missing, missing


def test_unlisted_duplicates_and_offline_cards(cat):
    for vid in ("merra2_t2m", "merra2_precip", "merra2_aod", "modis_aqua_aod", "modis_terra_aod", "mopitt_co"):
        assert not cat.variables[vid].listed, vid
    assert cat.variables["power_aod"].power_param == "AOD_55"
    for vid in ("omi_aod", "omi_no2"):
        v = cat.variables[vid]
        assert v.cadence == "daily" and v.min_valid_days == 10 and v.listed, vid


def test_cross_checks_pair_different_instruments(cat):
    """Section 6 of the tracker: only the same quantity from a different instrument; never two MERRA-2 cards."""
    for v in cat.variables.values():
        if not v.cross_check:
            continue
        other = cat.variables[v.cross_check]
        # two cards of one model (MERRA-2, GLDAS) are never a pair; MODIS Aqua vs Terra are different satellites
        assert (v.source.instrument_id, v.source.platform) != (other.source.instrument_id, other.source.platform), (v.id, other.id)
        if v.listed:
            assert other.listed, (v.id, other.id)


def test_expected_cross_check_pairs(cat):
    expected = {
        "power_t2m": "airs_t_surf_day", "airs_t_surf_day": "power_t2m", "airs_t_surf_night": "power_t2m",
        "power_precip": "gpm_precip", "gpm_precip": "power_precip",
        "power_rh2m": "airs_rh_surf_day", "airs_rh_surf_day": "power_rh2m", "airs_rh_surf_night": "power_rh2m",
        "omi_aod": "power_aod", "power_aod": "omi_aod",
    }
    for vid, other in expected.items():
        assert cat.variables[vid].cross_check == other, vid


def test_land_models_are_land_domain_and_water_has_no_drivers(cat):
    for vid in ("gldas_soil_moist", "gldas_evap"):
        assert cat.variables[vid].domain == "land", vid
    assert all(role != "driver" for _, role in cat.theme_members("water"))


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


def test_highland_twin_sits_inside_the_highlands_box(cat):
    hl, tw = cat.regions["cajamarca_highlands"], cat.regions["cajamarca_high_only"]
    (w, s, e, n), (hw, hs, he, hn) = tw.geometry.bbox, hl.geometry.bbox
    assert hw <= w < e <= he and hs <= s < n <= hn
    assert tw.listed is not False and tw.regime == hl.regime
    assert tw.geometry.cells(0.5) >= 4  # MERRA-2 cells (heat) fit; AIRS (1 degree) honestly does not


def test_unknown_keys_are_rejected(cat):
    data = cat.variables["gpm_precip"].model_dump()
    data["unexpected"] = 1
    with pytest.raises(ValidationError):
        VariableCard(**data)


def _text_objects(obj, path=""):
    if isinstance(obj, dict):
        if isinstance(obj.get("simple"), str) and isinstance(obj.get("scientific"), str):
            yield path, obj
            return
        for k, v in obj.items():
            yield from _text_objects(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _text_objects(v, f"{path}[{i}]")


def test_every_text_field_in_the_catalog_has_both_spanish_versions(cat):
    missing = [p for p, t in _text_objects(cat.model_dump()) if not t.get("simple_es") or not t.get("scientific_es")]
    assert not missing, missing[:10]


def test_every_variable_has_spanish_words_units_and_label(cat):
    for v in cat.variables.values():
        assert v.words_es and v.words_es.subject and v.words_es.up and v.words_es.down and v.words_es.changing, v.id
        assert v.kid_units.label_es, v.id
        assert v.units.simple_es, v.id
