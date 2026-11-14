"""Stage 2 ("Results"): run the decisive tests for every variable of a theme in a region,
over ONE shared window, then correct for multiple comparisons (Benjamini–Hochberg).

This is not selection: which variables are worth investigating is decided in stage 1
(selection.py) before any trend. The shared window keeps records of different lengths
(e.g. MERRA-2 from 1980 vs AIRS 2002–2021) from biasing the ranking toward long records;
the detail view still uses each variable's full record.
"""

from __future__ import annotations

from .catalog import RegionCard
from .contract import AnalysisResult, ScanEntry, ScanResult, ShortlistLabel, Text
from .engine import ENGINE_VERSION, EngineContext, analyze_region
from .gates import MIN_YEARS
from .prepare import resolve_window, window_years
from .stats import benjamini_hochberg
from .timeutil import month_index

ORDER: dict[str, int] = {"changing": 0, "possibly_changing": 1, "no_detectable_change": 2, "cant_tell": 3}


def _p_decisive(r: AnalysisResult) -> float | None:
    ps = [t.p for t in r.tests if t.decisive]
    return max(ps) if len(ps) == 2 else None


def _why(r: AnalysisResult, var) -> Text:
    """R1: one reason per variable: why it can't answer here, a cited expectation, or what it can detect."""
    if r.selection is None:
        failed = [c.detail for c in r.gates.checks if not c.passed]
        return failed[0] if failed else var.definition
    by = {c.code: c for c in r.selection.checks}
    for c in r.selection.checks:
        if c.status == "fail":
            return c.detail
    if "expectation" in by and by["expectation"].status == "pass":
        return by["expectation"].detail
    return by["detectability"].detail if "detectability" in by else var.definition


def common_window(ctx: EngineContext, region: RegionCard, variable_ids: list[str]) -> tuple[str, str] | None:
    """Overlap of the variables' default windows (drift cuts included), if >= MIN_YEARS long."""
    starts, ends = [], []
    for vid in variable_ids:
        s = ctx.series(vid, region)
        if s is None:
            continue
        try:
            w = resolve_window(s, ctx.catalog.variables[vid])
        except ValueError:
            continue
        starts.append(w.start)
        ends.append(w.end)
    if not starts:
        return None
    start, end = max(starts, key=month_index), min(ends, key=month_index)
    if month_index(end) < month_index(start) or window_years(start, end) < MIN_YEARS:
        return None
    return start, end


def scan_region(ctx: EngineContext, region: RegionCard, theme_id: str) -> ScanResult:
    if theme_id not in ctx.catalog.themes:
        raise KeyError(f"unknown theme {theme_id}")
    members = ctx.catalog.theme_members(theme_id)
    cw = common_window(ctx, region, [v.id for v, _ in members])
    results = []
    for var, role in members:
        if cw:
            r = analyze_region(ctx, region, var.id, start=cw[0], end=cw[1], theme_id=theme_id, window_reason="common")
        else:
            r = analyze_region(ctx, region, var.id, theme_id=theme_id)
        results.append((var, role, r))

    ps = [_p_decisive(r) for _, _, r in results]
    tested = [i for i, p in enumerate(ps) if p is not None]
    adjusted = dict(zip(tested, benjamini_hochberg([ps[i] for i in tested])))

    entries = []
    for i, (var, role, r) in enumerate(results):
        label = r.verdict.label
        p_adj = adjusted.get(i)
        short: ShortlistLabel
        if label == "cant_tell":
            short = "cant_tell"
        elif label == "significant" and p_adj is not None and p_adj < ctx.alpha:
            short = "changing"
        elif label == "no_detectable_change":
            short = "no_detectable_change"
        else:
            short = "possibly_changing"
        reason = None
        if label == "cant_tell":
            failed = [c.detail for c in r.gates.checks if not c.passed]
            reason = failed[0] if failed else r.verdict.sentence
        sel = r.selection
        why = _why(r, var)
        entries.append(ScanEntry(
            variable_id=var.id, name=var.name, role=role, source_type=var.source.type,
            shortlist_label=short, verdict_label=label,
            slope_per_decade=r.trend.slope_per_decade if r.trend else None,
            units=var.units.info(), p_decisive=ps[i], p_adjusted=p_adj,
            worth_investigating=bool(sel and sel.worth_investigating),
            mdt_per_decade=sel.mdt_per_decade if sel else None,
            why=why,
            reason=reason,
        ))

    has_xcheck = {v.id: v.cross_check is not None for v, _ in members}
    entries.sort(key=lambda e: (
        ORDER[e.shortlist_label],
        not e.worth_investigating,
        e.source_type != "observed",  # ties: observed before model
        not has_xcheck[e.variable_id],  # ties: variables with an independent cross-check first
        e.p_adjusted if e.p_adjusted is not None else 2.0,
    ))
    return ScanResult(
        engine_version=ENGINE_VERSION, region=region.ref(), theme_id=theme_id, alpha=ctx.alpha,
        window_start=cw[0] if cw else None, window_end=cw[1] if cw else None, common_window=cw is not None,
        entries=entries,
    )


def scan(ctx: EngineContext, region_id: str, theme_id: str, cache: dict | None = None) -> ScanResult:
    """Scan a catalog region. `cache` is accepted for backward compatibility and unused:
    scan results use the shared window, unlike the per-variable default results."""
    if region_id not in ctx.catalog.regions:
        raise KeyError(f"unknown region {region_id}")
    return scan_region(ctx, ctx.catalog.regions[region_id], theme_id)
