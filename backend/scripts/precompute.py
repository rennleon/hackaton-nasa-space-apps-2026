"""Precompute job: run the engine for every region x variable with data (default
settings and each declared season), scan every theme, and export the catalog as
JSON. Output is the static data the front end serves (web/public/data by default).

Run: uv run python scripts/precompute.py [--out PATH]
"""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

from trend_detective.api import custom_region
from trend_detective.contract import Text
from trend_detective.engine import EngineContext, analyze, analyze_region, repo_root
from trend_detective.scan import availability_of, scan, scan_region

# Ready-made example places for the start page: point regions built like api.custom_region, with fixed ids
# and names (not in regions.yaml). Order matters: "where" files list the pre-loaded regions, then these.
EXAMPLES = [
    ("ex_delhi", 28.61, 77.21, "Delhi, India", "Delhi, India (point 28.61, 77.21)",
     "Delhi, India", "Delhi, India (punto 28,61; 77,21)"),
    ("ex_manaus", -3.10, -60.02, "Amazon near Manaus, Brazil", "Amazon near Manaus, Brazil (point -3.10, -60.02)",
     "Amazonía cerca de Manaos, Brasil", "Amazonía cerca de Manaos, Brasil (punto -3,10; -60,02)"),
    ("ex_tamanrasset", 22.79, 5.52, "Sahara near Tamanrasset, Algeria",
     "Sahara near Tamanrasset, Algeria (point 22.79, 5.52)",
     "Sahara cerca de Tamanrasset, Argelia", "Sahara cerca de Tamanrasset, Argelia (punto 22,79; 5,52)"),
]
WHERE_REGIONS = ["cajamarca_highlands", "cajamarca_high_only", "wisconsin"]


def example_regions():
    out = []
    for rid, lat, lon, simple, sci, simple_es, sci_es in EXAMPLES:
        base = custom_region("point", (lon, lat))
        out.append(base.model_copy(update={
            "id": rid, "name": Text(simple=simple, scientific=sci, simple_es=simple_es, scientific_es=sci_es),
            "description": Text(simple=f"{simple}: a spot on the map.",
                                scientific=f"{sci}; NASA POWER and Giovanni grid cells.",
                                simple_es=f"{simple_es}: un punto en el mapa.",
                                scientific_es=f"{sci_es}; celdas de NASA POWER y Giovanni."),
        }))
    return out


def where_entry(region, kind: str, res, var) -> dict:
    """One place in a `where/<variable>.json` file: the variable's default-window verdict there."""
    w, s, e, n = region.geometry.bbox
    tr = res.trend
    direction = None
    if tr is not None and tr.slope_per_decade != 0:
        direction = "up" if tr.slope_per_decade > 0 else "down"
    return {
        "place_id": region.id,
        "name": region.name.model_dump(mode="json"),
        "kind": kind,
        "region_id": region.id if kind == "region" else None,
        "lat": round((s + n) / 2, 4),  # a point's own latitude, or the centre of the box
        "lon": round((w + e) / 2, 4),
        "label": res.verdict.label,
        "certainty": res.verdict.certainty,
        "direction": direction,
        "slope_per_decade": tr.slope_per_decade if tr else None,
        "ci_low": tr.ci_low if tr else None,
        "ci_high": tr.ci_high if tr else None,
        "units": var.units.info().model_dump(mode="json"),
        "window_start": res.window.start if res.window else None,
        "window_end": res.window.end if res.window else None,
        "availability": availability_of(res),
        "headline": res.verdict.headline.model_dump(mode="json"),
        "how_much": res.verdict.how_much.model_dump(mode="json"),
    }


def dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = obj.model_dump(mode="json") if hasattr(obj, "model_dump") else obj
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def dump_shared_windows(ctx, out: Path, dir_id: str, region, sc, written: set[Path]) -> None:
    """Each scanned variable at the scan's shared window, exactly as the scan ran it, so a shortlist card opens
    on its own numbers offline: `results/<dir>/<var>__win_<start>_<end>.json` (read by web StaticClient).

    Several themes can share one window, so the file is theme-neutral (theme_id=None, like the API with no theme)
    and is written once per run: a Heat window file must not say "warm nights question"."""
    if not (sc.common_window and sc.window_start and sc.window_end):
        return
    for e in sc.entries:
        path = out / "results" / dir_id / f"{e.variable_id}__win_{sc.window_start}_{sc.window_end}.json"
        if path in written:
            continue
        res = analyze_region(ctx, region, e.variable_id, start=sc.window_start, end=sc.window_end,
                             theme_id=None, window_reason="common")
        dump(path, res)
        written.add(path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=repo_root() / "web" / "public" / "data")
    args = ap.parse_args()
    ctx = EngineContext.from_repo()
    cat = ctx.catalog
    out: Path = args.out
    written: set[Path] = set()  # shared-window files already written in this run

    dump(out / "catalog" / "regions.json", [r.model_dump(mode="json") for r in cat.regions.values()])
    dump(out / "catalog" / "themes.json", [t.model_dump(mode="json") for t in cat.themes.values()])
    dump(out / "catalog" / "variables.json", [v.model_dump(mode="json") for v in cat.variables.values()])
    dump(out / "catalog" / "glossary.json", [g.model_dump(mode="json") for g in cat.glossary.values()])
    dump(out / "catalog" / "instruments.json", [i.model_dump(mode="json") for i in cat.instruments.values()])

    for region in cat.regions.values():
        cache: dict = {}
        for var in cat.variables.values():
            res = analyze(ctx, region.id, var.id)
            cache[(region.id, var.id)] = res
            dump(out / "results" / region.id / f"{var.id}.json", res)
            if res.provenance is None:
                continue
            for s in region.seasons_for(var.id):
                dump(out / "results" / region.id / f"{var.id}__{s.id}.json",
                     analyze(ctx, region.id, var.id, season_id=s.id))
            print(f"{region.id:22s} {var.id:22s} {res.verdict.label}")
        for theme in cat.themes.values():
            sc = scan(ctx, region.id, theme.id, cache)
            dump(out / "results" / region.id / f"scan_{theme.id}.json", sc)
            dump_shared_windows(ctx, out, region.id, region, sc, written)

    # Example places: the same results as a pre-loaded region, plus one "where else?" file per listed variable.
    listed = [v for v in cat.variables.values() if v.listed]
    where: dict[str, list[dict]] = {v.id: [] for v in listed}
    for rid in WHERE_REGIONS:
        for var in listed:
            where[var.id].append(where_entry(cat.regions[rid], "region", analyze(ctx, rid, var.id), var))
    for region in example_regions():
        for var in listed:
            res = analyze_region(ctx, region, var.id)
            dump(out / "results" / region.id / f"{var.id}.json", res)
            where[var.id].append(where_entry(region, "example", res, var))
            print(f"{region.id:22s} {var.id:22s} {res.verdict.label}")
        for theme in cat.themes.values():
            sc = scan_region(ctx, region, theme.id)
            dump(out / "results" / region.id / f"scan_{theme.id}.json", sc)
            dump_shared_windows(ctx, out, region.id, region, sc, written)
    generated = date.today().isoformat()
    for var in listed:
        dump(out / "where" / f"{var.id}.json",
             {"variable_id": var.id, "generated": generated, "places": where[var.id]})
    print("wrote", out)


if __name__ == "__main__":
    main()
