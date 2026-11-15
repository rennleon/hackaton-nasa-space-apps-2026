"""Region homogeneity ("is this one kind of place?"): synthetic POWER-like climatology documents, no network."""

import json
import re
from pathlib import Path

import pytest

from trend_detective.catalog import Catalog
from trend_detective.engine import EngineContext
from trend_detective.homogeneity import (
    Cell,
    cache_path,
    cells_from_docs,
    compute_homogeneity,
    evaluate,
    request_box,
    suggest_parts,
)
from trend_detective.place import profile_place
from trend_detective.sources.base import SourceChain
from trend_detective.sources.power import PowerSource

ROOT = Path(__file__).resolve().parents[2]
BANNED = re.compile(
    r"p-value|\bsignifican|\bdecade|\banomal|autocorrelation|percentage points|confidence interval|"
    r"statistically|mann.kendall|\bols\b|hamed|%RH|kg m|\bK\b|[0-9]",
    re.IGNORECASE,
)

COAST = {"elev": 50.0, "precip": 0.1, "t": 22.0}  # dry, hot, low: Koppen B
ANDES = {"elev": 3000.0, "precip": 2.0, "t": 11.0}  # rainy enough, cool, high: Koppen C


def feature(lon, lat, elev, param, value):
    months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
    vals = {m: value for m in months}
    vals["ANN"] = value
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat, elev]},
            "properties": {"parameter": {param: vals}}}


def docs(spec):
    """spec: [(lon, lat, kind_dict)] -> (PRECTOTCORR doc, T2M doc)."""
    p = {"type": "FeatureCollection", "features": [feature(lo, la, k["elev"], "PRECTOTCORR", k["precip"]) for lo, la, k in spec]}
    t = {"type": "FeatureCollection", "features": [feature(lo, la, k["elev"], "T2M", k["t"]) for lo, la, k in spec]}
    return p, t


def grid(lon0, lat0, ncols, nrows, kind):
    return [(lon0 + 0.625 * i, lat0 + 0.5 * j, kind) for i in range(ncols) for j in range(nrows)]


def coast_and_andes():
    return grid(-80.0, -8.0, 4, 4, COAST) + grid(-80.0 + 0.625 * 4, -8.0, 4, 4, ANDES)


def cells_of(spec, bbox=(-180, -90, 180, 90)):
    return cells_from_docs(*docs(spec), list(bbox))


def test_mixed_coast_and_andes_with_two_suggestions():
    h = evaluate(cells_of(coast_and_andes()))
    assert h.kind == "mixed" and h.n_cells == 32
    assert [r.code for r in h.reasons] == ["climate_groups", "elevation", "rain", "temperature"]
    assert h.climate_groups == {"B": 16, "C": 16}
    assert (h.elev_min, h.elev_max) == (50.0, 3000.0) and (h.precip_min, h.precip_max) == (0.1, 2.0)
    assert (h.t2m_min, h.t2m_max) == (11.0, 22.0)
    # each part is its own kind of place; the box is the cells' centres plus half a cell (0.25 deg lat, 0.3125 deg lon)
    assert [(s.n_cells, s.bbox, s.name.simple) for s in h.suggestions] == [
        (16, [-80.31, -8.25, -77.81, -6.25], "the dry low part"),
        (16, [-77.81, -8.25, -75.31, -6.25], "the high, cool part"),
    ]
    assert {s.name.simple_es for s in h.suggestions} == {"la parte baja y seca", "la parte alta y fresca"}
    assert "project heuristic" in h.text.scientific and "Hosking & Wallis 1993" in h.text.scientific
    assert h.text.simple_es and h.text.scientific_es


def test_suggestions_are_clipped_to_the_users_box():
    cells = cells_of(coast_and_andes())
    clipped = suggest_parts(cells, [-80.0, -8.0, -75.5, -6.5])
    assert all(s.bbox[0] >= -80.0 and s.bbox[2] <= -75.5 and s.bbox[1] >= -8.0 and s.bbox[3] <= -6.5 for s in clipped)


def test_uniform_box_is_one_kind():
    spec = [(lo, la, dict(ANDES, precip=2.0 + 0.1 * (i % 3))) for i, (lo, la, _) in enumerate(grid(-92.0, 42.5, 4, 4, ANDES))]
    h = evaluate(cells_of(spec))
    assert h.kind == "one_kind" and h.reasons == [] and h.suggestions == []
    assert h.n_cells == 16 and h.climate_groups == {"C": 16}
    assert "one kind" in h.text.simple


def test_rule_thresholds():
    def cell(precip=1.0, t=15.0, elev=500.0, group="C"):
        return Cell(0.0, 0.0, elev, precip, t, group)

    # (c) needs BOTH ratio > 2 and difference > 0.5 mm/day
    assert evaluate([cell(0.1), cell(0.4)]).kind == "one_kind"  # ratio 4 but only 0.3 apart
    assert evaluate([cell(2.0), cell(2.9)]).kind == "one_kind"  # 0.9 apart but ratio 1.45
    assert evaluate([cell(1.0), cell(2.2)]).kind == "mixed"
    # (b) elevation range above 1000 m, (d) T2M range above 5 degrees C
    assert evaluate([cell(elev=0), cell(elev=1000)]).kind == "one_kind"
    assert [r.code for r in evaluate([cell(elev=0), cell(elev=1001)]).reasons] == ["elevation"]
    assert evaluate([cell(t=10), cell(t=15)]).kind == "one_kind"
    assert [r.code for r in evaluate([cell(t=10), cell(t=15.1)]).reasons] == ["temperature"]
    # (a) two Koppen main groups each with at least 20% of the cells; a 10% sliver does not count
    assert [r.code for r in evaluate([cell(group="C")] * 4 + [cell(group="B")]).reasons] == ["climate_groups"]
    assert evaluate([cell(group="C")] * 9 + [cell(group="B")]).kind == "one_kind"


def test_suggestion_must_itself_be_one_kind_and_needs_four_cells():
    # a 2-cell-wide strip of andes inside a coast: fewer than 4 cells -> no suggestion
    spec = grid(-80.0, -8.0, 6, 4, COAST) + grid(-80.0 + 0.625 * 6, -8.0, 1, 3, ANDES)
    h = evaluate(cells_of(spec))
    assert h.kind == "mixed"
    assert [s.name.simple for s in h.suggestions] == ["the dry low part"]
    # a group whose bounding box swallows cells of another group is not suggested
    checker = [(lo, la, COAST if (i + j) % 2 == 0 else ANDES)
               for i, lo in enumerate([-80.0 + 0.625 * k for k in range(4)]) for j, la in enumerate([-8.0, -7.5, -7.0, -6.5])]
    assert evaluate(cells_of(checker)).suggestions == []


def test_up_to_three_suggestions_largest_first():
    third = {"elev": 3000.0, "precip": 0.1, "t": 5.0}  # high, dry, cold -> Koppen B (arid) high up
    spec = (grid(-80.0, -8.0, 4, 4, COAST) + grid(-77.5, -8.0, 3, 4, ANDES)
            + grid(-75.0, -8.0, 2, 2, third) + grid(-70.0, -8.0, 5, 5, {"elev": 50.0, "precip": 2.0, "t": 27.0}))
    sug = evaluate(cells_of(spec)).suggestions
    assert 1 <= len(sug) <= 3 and [s.n_cells for s in sug] == sorted((s.n_cells for s in sug), reverse=True)


def test_box_smaller_than_two_degrees_keeps_only_cells_inside():
    spec = grid(-79.0, -7.0, 4, 5, ANDES)  # lon -79..-77.125, lat -7..-5
    assert request_box([-78.5, -6.5, -77.7, -5.9]) == [-79.1, -7.2, -77.1, -5.2]  # 2 deg box centred on the user's box
    inside = cells_of(spec, [-78.8, -6.8, -77.9, -6.2])
    assert all(-78.8 <= c.lon <= -77.9 and -6.8 <= c.lat <= -6.2 for c in inside)
    assert 0 < len(inside) < len(spec)
    assert request_box([-79.0, -8.0, -77.0, -5.0]) == [-79.0, -8.0, -77.0, -5.0]  # already big enough: unchanged


def test_one_cell_is_single_spot_and_tiny_box_uses_nearest_cell():
    spec = grid(-79.0, -7.0, 4, 4, ANDES)
    tiny = cells_of(spec, [-78.40, -6.60, -78.38, -6.58])  # between cell centres
    assert len(tiny) == 1
    h = evaluate(tiny)
    assert h.kind == "single_spot" and h.n_cells == 1 and h.reasons == []


def test_point_needs_no_network(tmp_path):
    h = compute_homogeneity(tmp_path, True, "point", [-78.5, -6.5, -78.5, -6.5])
    assert h.kind == "single_spot" and h.n_cells == 1 and h.text.simple_es


def test_compute_reads_the_cache_and_offline_miss_is_none(tmp_path):
    bbox = [-80.5, -8.5, -75.0, -6.0]
    p, t = docs(coast_and_andes())
    assert compute_homogeneity(tmp_path, True, "bbox", bbox) is None  # offline, nothing cached
    for param, doc in (("PRECTOTCORR", p), ("T2M", t)):
        path = cache_path(tmp_path, param, request_box(bbox))
        assert path.name == f"clim_regional_{param}_-80.50_-8.50_-75.00_-6.00.json"
        path.write_text(json.dumps(doc), encoding="utf-8")
    h = compute_homogeneity(tmp_path, True, "bbox", bbox)
    assert h is not None and h.kind == "mixed" and h.n_cells == 32
    # a damaged cache file or a bad box never raises
    cache_path(tmp_path, "T2M", request_box(bbox)).write_text("{not json", encoding="utf-8")
    assert compute_homogeneity(tmp_path, True, "bbox", bbox) is None
    assert compute_homogeneity(tmp_path, True, "bbox", [10.0, 10.0, 30.0, 30.0]) is None  # too big (and offline)


def test_simple_text_follows_plain_language_rules():
    mixed = evaluate(cells_of(coast_and_andes()))
    one = evaluate(cells_of(grid(-92.0, 42.5, 4, 4, ANDES)))
    spot = evaluate(cells_of(grid(-79.0, -7.0, 1, 1, ANDES)))
    texts = [mixed.text, one.text, spot.text] + [r.text for r in mixed.reasons] + [s.name for s in mixed.suggestions]
    for text in texts:
        for sentence in re.split(r"(?<=\.)\s+", text.simple):
            assert len(sentence.split()) <= 12, sentence
        assert not BANNED.search(text.simple), text.simple


# -- inside the place profile ----------------------------------------------------------------

@pytest.fixture(scope="module")
def ctx() -> EngineContext:
    power = PowerSource(cache_dir=ROOT / "data" / "cache" / "power", offline=True)
    return EngineContext(Catalog.load(ROOT / "catalog"), SourceChain([power]))


def test_profile_has_homogeneity_for_the_cached_preloaded_boxes(ctx):
    for rid in ("cajamarca_highlands", "wisconsin"):
        h = profile_place(ctx, ctx.catalog.regions[rid]).homogeneity
        assert h is not None and h.kind in ("one_kind", "mixed") and h.n_cells > 4, rid


def test_profile_without_cache_has_no_homogeneity(tmp_path):
    bare = EngineContext(Catalog.load(ROOT / "catalog"), SourceChain([PowerSource(cache_dir=tmp_path, offline=True)]))
    assert profile_place(bare, bare.catalog.regions["wisconsin"]).homogeneity is None
