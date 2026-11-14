"""Precompute job: run the engine for every region x variable with data (default
settings and each declared season), scan every theme, and export the catalog as
JSON. Output is the static data the front end serves (web/public/data by default).

Run: uv run python scripts/precompute.py [--out PATH]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from trend_detective.engine import EngineContext, analyze, repo_root
from trend_detective.scan import scan


def dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = obj.model_dump(mode="json") if hasattr(obj, "model_dump") else obj
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=repo_root() / "web" / "public" / "data")
    args = ap.parse_args()
    ctx = EngineContext.from_repo()
    cat = ctx.catalog
    out: Path = args.out

    dump(out / "catalog" / "regions.json", [r.model_dump(mode="json") for r in cat.regions.values()])
    dump(out / "catalog" / "themes.json", [t.model_dump(mode="json") for t in cat.themes.values()])
    dump(out / "catalog" / "variables.json", [v.model_dump(mode="json") for v in cat.variables.values()])
    dump(out / "catalog" / "glossary.json", [g.model_dump(mode="json") for g in cat.glossary.values()])

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
            dump(out / "results" / region.id / f"scan_{theme.id}.json", scan(ctx, region.id, theme.id, cache))
    print("wrote", out)


if __name__ == "__main__":
    main()
