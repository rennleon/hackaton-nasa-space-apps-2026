"""Place profile (AR6 region, Koppen-Geiger group, wet/dry months, high up, words).

Runs offline on cached NASA POWER JSON in data/cache/power (the five test places are all cached).
"""

import re
from pathlib import Path

import pytest

from trend_detective.catalog import Catalog, Geometry, RegionCard
from trend_detective.contract import Text
from trend_detective.engine import EngineContext
from trend_detective.place import ar6_region_at, koppen_geiger, profile_place, wet_dry_months
from trend_detective.sources.base import SourceChain
from trend_detective.sources.power import PowerSource

ROOT = Path(__file__).resolve().parents[2]
BANNED = re.compile(
    r"p-value|\bsignifican|\bdecade|\banomal|autocorrelation|percentage points|confidence interval|"
    r"statistically|mann.kendall|\bols\b|hamed|%RH|kg m|\bK\b|[0-9]",
    re.IGNORECASE,
)


@pytest.fixture(scope="module")
def ctx() -> EngineContext:
    power = PowerSource(cache_dir=ROOT / "data" / "cache" / "power", offline=True)
    return EngineContext(Catalog.load(ROOT / "catalog"), SourceChain([power]))


def point(lon: float, lat: float, rid: str = "custom_t") -> RegionCard:
    t = Text(simple="x", scientific="x")
    return RegionCard(id=rid, name=t, description=t, regime="user-defined", listed=False,
                      geometry=Geometry(kind="point", bbox=[lon, lat, lon, lat]))


# -- AR6 point-in-polygon -------------------------------------------------------------

@pytest.mark.parametrize("lon,lat,code", [
    (77.21, 28.61, "SAS"), (-60.02, -3.10, "NSA"), (5.52, 22.79, "SAH"), (-78.0, -6.5, "NWS"),
    (-89.8, 44.8, "ENA"), (2.35, 48.85, "WCE"), (170.0, 66.0, "RAR"), (-175.0, 66.5, "RAR"),
])
def test_ar6_lookup(lon, lat, code):
    assert ar6_region_at(lon, lat)[0] == code


def test_ar6_ocean_is_none_and_longitude_wraps():
    assert ar6_region_at(-30.0, 0.0) is None  # mid-Atlantic
    assert ar6_region_at(77.21 + 360, 28.61)[0] == "SAS"


# -- Koppen-Geiger rules (Beck et al. 2018, Table 2), hand-made climatologies ------------

def test_koppen_main_groups_and_subtypes():
    assert koppen_geiger([27] * 12, [200] * 12) == "Af"
    assert koppen_geiger([27] * 12, [100, 100, 100, 100, 100, 5, 5, 5, 100, 100, 100, 100]) == "Aw"
    assert koppen_geiger([27] * 12, [300] * 8 + [80] * 4) == "Af"  # driest month 80 >= 60
    assert koppen_geiger([27] * 12, [250] * 11 + [40]) == "Am"  # 40 >= 100 - 2840/25 (= -13.6)
    assert koppen_geiger([30] * 12, [3] * 12) == "BWh"
    assert koppen_geiger([10] * 12, [10] * 12) == "BWk"
    assert koppen_geiger([22] * 12, [40] * 12) == "BSh"  # MAP 480 < 10*(2*22+14) = 580, >= 290
    assert koppen_geiger([-20] * 12, [0] * 12) == "EF"  # Pthreshold < 0 when MAT < -7, so never B there
    assert koppen_geiger([-20] * 12, [100] * 12) == "EF"
    assert koppen_geiger([5, 5, 5, 6, 8, 9, 9, 9, 8, 6, 5, 5], [150] * 12) == "ET"
    # Cfb: oceanic
    assert koppen_geiger([4, 5, 7, 9, 13, 16, 18, 18, 15, 11, 7, 5], [60] * 12) == "Cfb"
    # Csa: Mediterranean, dry summer in the northern hemisphere
    assert koppen_geiger([9, 10, 12, 14, 18, 22, 25, 25, 22, 17, 13, 10],
                         [90, 70, 60, 50, 30, 10, 3, 5, 30, 70, 90, 100]) == "Csa"
    # Dfb continental, Dfc subarctic, Dwd very cold dry winter
    assert koppen_geiger([-10, -8, -2, 5, 12, 17, 20, 19, 13, 6, -2, -8], [60] * 12) == "Dfb"
    assert koppen_geiger([-20, -16, -8, -1, 6, 12, 15, 12, 6, -2, -12, -18], [40] * 12) == "Dfc"
    assert koppen_geiger([-45, -40, -25, -8, 4, 12, 14, 10, 2, -15, -35, -43],
                         [3, 2, 3, 10, 25, 40, 50, 50, 25, 20, 10, 4]) == "Dwd"


def test_koppen_southern_hemisphere_summer_is_oct_mar():
    # Same shape as Csa, shifted six months: still Csa (dry summer), not Cwa or something else
    t = [9, 10, 12, 14, 18, 22, 25, 25, 22, 17, 13, 10]
    p = [90, 70, 60, 50, 30, 10, 3, 5, 30, 70, 90, 100]
    assert koppen_geiger(t[6:] + t[:6], p[6:] + p[:6]) == "Csa"
    # A southern summer-dry year used with northern summer logic would not match: swap temperature only
    assert koppen_geiger(t, p[6:] + p[:6]) != "Csa"


def test_koppen_arid_threshold_depends_on_rain_season():
    t = [20] * 12  # flat temperatures: summer is Apr-Sep, winter Oct-Mar; MAT 20, MAP 600 in all three cases
    summer_rain = [0, 0, 0, 100, 100, 100, 100, 100, 100, 0, 0, 0]  # >70% in summer: Pthreshold 2*20+28 = 68
    winter_rain = summer_rain[6:] + summer_rain[:6]  # >70% in winter: Pthreshold 2*20 = 40
    even_rain = [50] * 12  # Pthreshold 2*20+14 = 54
    assert koppen_geiger(t, summer_rain) == "BSh"  # 600 < 10*68
    assert koppen_geiger(t, winter_rain) == "Aw"  # 600 >= 10*40, so not arid
    assert koppen_geiger(t, even_rain) == "Aw"  # 600 >= 10*54


def test_koppen_rejects_bad_input():
    with pytest.raises(ValueError):
        koppen_geiger([1.0] * 11, [1.0] * 12)


# -- wet / dry months -------------------------------------------------------------------

def test_wet_dry_months_circular_and_seasonal_rule():
    p = [200, 220, 120, 40, 20, 5, 3, 5, 10, 30, 60, 150]  # wet runs across the new year
    wet, dry = wet_dry_months(p)
    assert wet == [1, 2, 3, 12] and dry == [6, 7, 8]
    assert wet_dry_months([50] * 12) == ([], [])  # no seasons
    assert wet_dry_months([60, 70, 80, 90, 100, 110, 100, 90, 80, 70, 60, 50]) == ([], [])  # ratio < 2


# -- whole profile on cached POWER data ------------------------------------------------

def test_cajamarca_highlands(ctx):
    p = profile_place(ctx, ctx.catalog.regions["cajamarca_highlands"])
    assert (p.ar6_region_code, p.ar6_region_name) == ("NWS", "N.W.South-America")
    assert p.climate_group == "temperate" and p.climate_code == "Cfb"
    assert p.high_up is True and 1500 < p.elevation_m_model < 3500
    assert p.wet_months == [1, 2, 3, 4] and p.dry_months == [6, 7, 8]


def test_wisconsin(ctx):
    p = profile_place(ctx, ctx.catalog.regions["wisconsin"])
    assert p.ar6_region_code == "ENA"
    assert p.climate_group == "cold" and p.climate_code.startswith("D")
    assert p.high_up is False and 200 < p.elevation_m_model < 500


@pytest.mark.parametrize("lon,lat,ar6,group,code,high", [
    (77.21, 28.61, "SAS", "dry", "BSh", False),  # Delhi: MERRA-2 rain is lower than gauges, so steppe
    (-60.02, -3.10, "NSA", "tropical", "Af", False),  # Manaus
    (5.52, 22.79, "SAH", "dry", "BWh", True),  # Tamanrasset: grid height 1681 m
])
def test_example_points(ctx, lon, lat, ar6, group, code, high):
    p = profile_place(ctx, point(lon, lat))
    assert (p.ar6_region_code, p.climate_group, p.climate_code, p.high_up) == (ar6, group, code, high)
    assert p.wet_months and p.dry_months and not set(p.wet_months) & set(p.dry_months)


def test_text_follows_plain_language_rules(ctx):
    regions = [ctx.catalog.regions["cajamarca_highlands"], ctx.catalog.regions["wisconsin"],
               point(77.21, 28.61), point(-60.02, -3.10), point(5.52, 22.79)]
    for r in regions:
        p = profile_place(ctx, r)
        for sentence in re.split(r"(?<=\.)\s+", p.text.simple):
            assert len(sentence.split()) <= 12, sentence
            assert not BANNED.search(sentence), sentence
        assert "computer model estimate" in p.text.simple
        assert "model-grid elevation" in p.text.scientific
        assert "Beck et al. 2018" in p.text.scientific and p.ar6_region_code in p.text.scientific
    t = profile_place(ctx, point(5.52, 22.79)).text
    assert t.simple.startswith("Your place is very dry and hot.") and "high up" in t.simple
    ready = profile_place(ctx, point(5.52, 22.79, rid="ex_tamanrasset")).text
    assert ready.simple.startswith("This place is very dry and hot.") and ready.simple_es.startswith("Este lugar es muy seco")
    assert "Köppen–Geiger BWh" in t.scientific and "IPCC AR6 region SAH (Sahara)" in t.scientific


def test_no_data_still_gives_ar6(tmp_path):
    power = PowerSource(cache_dir=tmp_path, offline=True)  # empty cache, no network
    bare = EngineContext(Catalog.load(ROOT / "catalog"), SourceChain([power]))
    p = profile_place(bare, point(5.52, 22.79))
    assert p.ar6_region_code == "SAH"
    assert p.climate_group is None and p.high_up is None and p.wet_months == []
