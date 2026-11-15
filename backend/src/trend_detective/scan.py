"""Stage 2 ("Results"): run the decisive tests for every variable of a theme in a region,
over ONE shared window, then correct for multiple comparisons (Benjamini–Hochberg).

This is not selection: which variables are worth investigating is decided in stage 1
(selection.py) before any trend. The shared window keeps records of different lengths
(e.g. MERRA-2 from 1980 vs AIRS 2002–2021) from biasing the ranking toward long records;
the detail view still uses each variable's full record.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from .catalog import RegionCard, VariableCard
from .contract import AnalysisResult, Availability, ScanEntry, ScanResult, ShortlistLabel, Text
from .engine import ENGINE_VERSION, EngineContext, analyze_region
from .gates import MIN_YEARS
from .prepare import resolve_window, window_years
from .sources import LiveSourceUnavailable
from .stats import benjamini_hochberg
from .timeutil import month_index

MAX_PREFETCH_WORKERS = 8

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


def _failed(r: AnalysisResult, code: str) -> bool:
    return any(c.code == code and not c.passed for c in r.gates.checks)


def availability_of(r: AnalysisResult) -> Availability:
    """B1: can this place answer with this variable? Read off the gates, never off the trend."""
    if _failed(r, "fetch_failed"):
        return "fetch_failed"
    if _failed(r, "no_data") or _failed(r, "coverage"):
        return "no_data_here"
    if _failed(r, "record_length"):
        return "too_short"
    if _failed(r, "completeness") or (r.gates.passed and r.trend is None):
        return "too_many_gaps"
    return "available"


def _availability_reason(avail: Availability, r: AnalysisResult, var: VariableCard) -> Text:
    """Kid-friendly reason a variable has no result for this place (Scientific keeps the gate detail)."""
    failed = {c.code: c.detail for c in r.gates.checks if not c.passed}
    if avail == "fetch_failed":
        return failed["fetch_failed"]
    if avail == "no_data_here":
        g = failed.get("no_data") or failed["coverage"]
        sci, sci_es = g.scientific, g.scientific_es or g.scientific
        if var.domain == "land":
            simple = "No data for this spot. This measurement only covers land."
            simple_es = "No hay datos para este lugar. Esta medición solo cubre la tierra."
        elif var.domain == "ocean":
            simple = "No data for this spot. This measurement only covers the ocean."
            simple_es = "No hay datos para este lugar. Esta medición solo cubre el océano."
        elif "coverage" in failed and "no_data" not in failed:
            simple = "No data for this spot. This measurement does not reach this far."
            simple_es = "No hay datos para este lugar. Esta medición no llega hasta aquí."
        else:
            simple = "No data for this spot."
            simple_es = "No hay datos para este lugar."
        return Text(simple=simple, scientific=sci, simple_es=simple_es, scientific_es=sci_es)
    if avail == "too_short":
        rl = failed["record_length"]
        return Text(simple="This spot has too few years of data for this measurement. " + rl.simple,
                    scientific=rl.scientific,
                    simple_es="Este lugar tiene muy pocos años de datos para esta medición. " + (rl.simple_es or rl.simple),
                    scientific_es=rl.scientific_es or rl.scientific)
    gap = failed.get("completeness")
    return Text(simple="Too many months are missing here to tell." + (f" {gap.simple}" if gap else ""),
                scientific=gap.scientific if gap else r.verdict.sentence.scientific,
                simple_es="Faltan demasiados meses aquí para saberlo." + (f" {gap.simple_es or gap.simple}" if gap else ""),
                scientific_es=(gap.scientific_es or gap.scientific) if gap
                else (r.verdict.sentence.scientific_es or r.verdict.sentence.scientific))


def prefetch_series(ctx: EngineContext, region: RegionCard, variable_ids: list[str]) -> dict[str, Exception]:
    """Fetch every needed series at once (live sources take seconds each) so the analysis loop
    hits the context's cache. Returns the live-source failures; they are never cached as 'no data'.
    Results are identical to fetching one by one: each series is keyed by variable and region."""
    ids = list(dict.fromkeys(variable_ids))
    failures: dict[str, Exception] = {}

    def one(vid: str) -> None:
        try:
            ctx.series(vid, region)
        except LiveSourceUnavailable as exc:
            failures[vid] = exc

    if len(ids) > 1:
        with ThreadPoolExecutor(max_workers=min(MAX_PREFETCH_WORKERS, len(ids))) as pool:
            list(pool.map(one, ids))
    elif ids:
        one(ids[0])
    return failures


def common_window(ctx: EngineContext, region: RegionCard, variable_ids: list[str]) -> tuple[str, str] | None:
    """Overlap of the variables' default windows (drift cuts included), if >= MIN_YEARS long."""
    starts, ends = [], []
    for vid in variable_ids:
        try:
            s = ctx.series(vid, region)
        except LiveSourceUnavailable:
            continue  # recorded as fetch_failed by the analysis; it just does not shape the window
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
    members = [(v, role) for v, role in ctx.catalog.theme_members(theme_id) if v.listed]
    # Members and their cross-check partners, fetched concurrently; failures are reported, not cached.
    wanted = [v.id for v, _ in members] + [
        v.cross_check for v, _ in members if v.cross_check and ctx.catalog.variables[v.cross_check].listed
    ]
    failed = prefetch_series(ctx, region, wanted)
    cw = common_window(ctx, region, [v.id for v, _ in members if v.id not in failed])
    results = []
    for var, role in members:
        if cw:
            r = analyze_region(ctx, region, var.id, start=cw[0], end=cw[1], theme_id=theme_id,
                               window_reason="common", failed_fetches=failed)
        else:
            r = analyze_region(ctx, region, var.id, theme_id=theme_id, failed_fetches=failed)
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
        avail = availability_of(r)
        if avail != "available":
            why = reason = _availability_reason(avail, r, var)
        entries.append(ScanEntry(
            variable_id=var.id, name=var.name, role=role, source_type=var.source.type,
            shortlist_label=short, verdict_label=label,
            slope_per_decade=r.trend.slope_per_decade if r.trend else None,
            units=var.units.info(), p_decisive=ps[i], p_adjusted=p_adj,
            worth_investigating=bool(sel and sel.worth_investigating),
            mdt_per_decade=sel.mdt_per_decade if sel else None,
            why=why,
            reason=reason,
            availability=avail,
            instrument_id=var.source.instrument_id,
            yearly_series=r.yearly_series,
            cross_check=r.robustness.cross_check,
        ))

    has_xcheck = {v.id: v.cross_check is not None for v, _ in members}  # card has a partner
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
        place=_place(ctx, region),
    )


def _place(ctx: EngineContext, region: RegionCard):
    """Place profile from facts known before any trend (AR6 region, climate group, wet/dry months)."""
    from .place import profile_place

    try:
        return profile_place(ctx, region)
    except Exception:  # the profile is context only; never let it break a scan
        return None


def scan(ctx: EngineContext, region_id: str, theme_id: str, cache: dict | None = None) -> ScanResult:
    """Scan a catalog region. `cache` is accepted for backward compatibility and unused:
    scan results use the shared window, unlike the per-variable default results."""
    if region_id not in ctx.catalog.regions:
        raise KeyError(f"unknown region {region_id}")
    return scan_region(ctx, ctx.catalog.regions[region_id], theme_id)
