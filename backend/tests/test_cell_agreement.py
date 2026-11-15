"""Do the parts of the box agree? Counts of grid cells that go the box's way (synthetic cells, no data files)."""

import numpy as np
import pytest
from synthetic import FakeSource, make_raw, point_region

from trend_detective.api import custom_region
from trend_detective.catalog import Catalog
from trend_detective.cell_agreement import cell_agreement, classify
from trend_detective.contract import Window
from trend_detective.engine import EngineContext, analyze_region, repo_root
from trend_detective.scan import scan_region
from trend_detective.sources import CellSeries, RawSeries, SourceChain
from trend_detective.stats import trend_tests

RANGE = ("1990-01", "2021-12")
BOX = (-79.0, -8.0, -77.0, -5.0)


def make_cells(slopes, sd=0.5, nan_share=0.0, seed0=10):
    out = []
    for i, sl in enumerate(slopes):
        raw = make_raw(*RANGE, slope_per_decade=sl, sd=sd, seed=seed0 + i, nan_share=nan_share)
        out.append(CellSeries(lat=-6.0 - 0.1 * i, lon=-78.0, months=raw.months, values=raw.values))
    return out


class CellSource(FakeSource):
    """Box mean = plain mean of the cells, so the box slope is what the cells average to."""

    kind = "synthetic"

    def __init__(self, cells):
        vals = np.nanmean([c.values for c in cells], axis=0) if cells else np.array([])
        super().__init__({"power_t2m": RawSeries(cells[0].months, vals, make_raw(*RANGE).provenance)})
        self.cells = cells

    def cell_series(self, variable, region):
        return self.cells


def run(cells, region=None):
    cat = Catalog.load(repo_root() / "catalog")
    ctx = EngineContext(cat, SourceChain([CellSource(cells)]))
    return ctx, analyze_region(ctx, region or custom_region("bbox", BOX), "power_t2m")


def test_all_cells_same_direction_agree():
    _, r = run(make_cells([0.8] * 8))
    ca = r.robustness.cell_agreement
    assert ca is not None
    assert (ca.n_cells, ca.n_same_sign, ca.n_opposite, ca.n_opposite_sure) == (8, 8, 0, 0)
    assert ca.verdict == "agree"


def test_half_opposite_with_strong_trend_is_mixed():
    _, r = run(make_cells([2.0] * 5 + [-2.0] * 3))
    ca = r.robustness.cell_agreement
    assert ca.n_cells == 8 and ca.n_same_sign == 5 and ca.n_opposite == 3
    assert ca.n_opposite_sure == 3  # strong and opposite after Benjamini-Hochberg across the 8 cells
    assert ca.verdict == "mixed"


def test_weak_opposite_cells_are_not_sure_so_mostly():
    # 6 of 8 go the box's way (0.75): below 0.8, and the two opposite cells are noise, so not "sure" (seeds fixed)
    _, r = run(make_cells([1.5] * 6 + [-0.05] * 2, sd=2.0, seed0=20))
    ca = r.robustness.cell_agreement
    assert ca.n_opposite_sure == 0
    assert ca.verdict == "mostly", (ca.n_same_sign, ca.n_cells)


def test_point_region_has_no_cell_agreement():
    _, r = run(make_cells([0.8] * 4), region=point_region())
    assert r.robustness.cell_agreement is None


def test_box_of_one_cell_has_none():
    _, r = run(make_cells([0.8]))
    assert r.robustness.cell_agreement is None


def test_cells_without_enough_data_are_left_out():
    cells = make_cells([0.8] * 4)
    cells += make_cells([0.8] * 2, nan_share=0.5)  # half the months missing: fails the completeness gate
    _, r = run(cells)
    assert r.robustness.cell_agreement.n_cells == 4


def test_box_numbers_unchanged_by_the_check():
    cells = make_cells([0.8] * 6)
    _, with_ca = run(cells)
    ctx = EngineContext(Catalog.load(repo_root() / "catalog"), SourceChain([CellSource(cells)]))
    without = analyze_region(ctx, custom_region("bbox", BOX), "power_t2m", with_cell_agreement=False)
    assert without.robustness.cell_agreement is None
    assert with_ca.trend == without.trend and with_ca.verdict == without.verdict


def test_scan_skips_the_check():
    ctx = EngineContext(Catalog.load(repo_root() / "catalog"), SourceChain([CellSource(make_cells([0.8] * 6))]))
    seen = []
    import trend_detective.scan as scan_mod

    real = scan_mod.analyze_region

    def spy(*a, **kw):
        seen.append(kw.get("with_cell_agreement", True))
        return real(*a, **kw)

    scan_mod.analyze_region = spy
    try:
        scan_region(ctx, custom_region("bbox", BOX), "heat")
    finally:
        scan_mod.analyze_region = real
    assert seen and not any(seen)


@pytest.mark.parametrize("same,sure,verdict", [
    (10, 0, "agree"), (8, 0, "agree"), (7, 0, "mostly"), (6, 0, "mostly"), (5, 0, "unclear"), (10, 1, "mixed"),
])
def test_classification_rule(same, sure, verdict):
    assert classify(10, same, sure) == verdict


def test_function_needs_at_least_two_cells():
    cat = Catalog.load(repo_root() / "catalog")
    var = cat.variables["power_t2m"]
    window = Window(start="1990-01", end="2021-12", reason="user", years=32.0)
    cells = make_cells([0.8, 0.8])
    ca = cell_agreement(cells, var, None, window, None, 0.08, lambda p: trend_tests(p.t_window, p.anomalies_window))
    assert ca is not None and ca.n_cells == 2 and ca.verdict == "agree"
    assert cell_agreement(cells[:1], var, None, window, None, 0.08,
                          lambda p: trend_tests(p.t_window, p.anomalies_window)) is None
