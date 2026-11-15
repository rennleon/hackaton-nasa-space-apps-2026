"""Regression tests for issues found in the independent review."""

from pathlib import Path

import numpy as np
import pytest

from trend_detective.catalog import Catalog, DeclaredSeason
from trend_detective.contract import Provenance
from trend_detective.engine import EngineContext, analyze
from trend_detective.gates import step_month
from trend_detective.sources import RawSeries, SourceChain
from trend_detective.timeutil import month_range

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def ctx() -> EngineContext:
    return EngineContext.from_repo(ROOT)


class FillOnlySource:
    kind = "test"

    def fetch(self, variable, region):
        months = month_range("2002-09", "2021-12")
        return RawSeries(months, np.full(len(months), np.nan), Provenance(source_kind="test", source_ref="x"))


def test_all_missing_series_is_cant_tell_not_a_crash():
    cat = Catalog.load(ROOT / "catalog")
    ctx = EngineContext(cat, SourceChain([FillOnlySource()]))
    r = analyze(ctx, "cajamarca_west", "airs_rh_surf_day")
    assert r.verdict.label == "cant_tell" and r.gates.checks[0].code == "all_fill"


def test_user_window_crossing_drift_is_flagged_and_not_fully_significant(ctx):
    r = analyze(ctx, "cajamarca_west", "airs_rh_surf_day", start="2005-01")
    assert r.window.end == "2026-10"
    assert any(c.code == "drift_years_included" for c in r.chips)
    assert r.verdict.label != "significant"


def test_user_window_before_drift_has_no_drift_warning(ctx):
    r = analyze(ctx, "cajamarca_west", "airs_rh_surf_day", start="2003-01", end="2021-12")
    assert not any(c.code == "drift_years_included" for c in r.chips)


def test_scientific_sentence_names_only_checks_that_ran(ctx):
    r = analyze(ctx, "cajamarca_west", "airs_rh_surf_day")
    sci = r.verdict.sentence.scientific
    assert "leave-one-year-out" in sci
    # v2: AIRS humidity now pairs with NASA POWER RH2M (a different instrument), so the cross-check runs.
    assert "cross-check" in sci


def test_step_month_detects_a_jump_and_ignores_noise():
    rng = np.random.default_rng(0)
    months = month_range("2000-01", "2009-12")
    noise = rng.normal(0, 1, len(months))
    assert step_month(months, noise, 1.0, 0.0) is None
    jumped = noise.copy()
    jumped[84:] += 4.0
    found = step_month(months, jumped, 1.0, 0.0)
    assert found is not None and "2006" <= found[:4] <= "2007"


def test_year_crossing_season_rejected():
    cat = Catalog.load(ROOT / "catalog")
    region = cat.regions["wisconsin"]
    region.declared_seasons.append(
        DeclaredSeason(variable="gpm_precip", id="winter", name={"simple": "w", "scientific": "w"}, months=[12, 1, 2])
    )
    with pytest.raises(ValueError, match="year end"):
        cat.validate_links()


def test_season_gates_use_season_months(ctx):
    r = analyze(ctx, "cajamarca_west", "airs_rh_surf_night", season_id="wet")
    comp = next(c for c in r.gates.checks if c.code == "completeness")
    assert comp.passed
