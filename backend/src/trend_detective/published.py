"""Published findings (IPCC AR6 regional assessment) for a place and a variable.

Two uses, both fed by `catalog/expectations.yaml`:
  * Stage 1, check (b) "expectation" (R1): a cited reason to expect change, known BEFORE any trend is computed.
  * C3 "What scientists found here": after the verdict, does our result agree with the statement? Never causal.

Which AR6 region? The region card's CENTRE decides (for a point: the point; for a box: the middle of the box).
A region split across two AR6 regions (Wisconsin straddles CNA and ENA at about 90 W) therefore takes the region
that holds its centre, and a place exactly on a boundary takes whichever polygon the point-in-polygon test finds
first; AR6 assesses CNA and ENA the same way for every variable we use here, except drought, which is only ever
"unclear" or context. A region card's own cited expectation (regions.yaml) always wins over this lookup for stage 1.

Which statements count? Only statements about a MONTHLY MEAN (mean temperature, mean rain, humidity, AOD, NO2,
soil-moisture drought). Statements about extremes or events (hot extremes, heavy rain, dry spells) never stand in
for a mean variable: they come back as `context`, to be shown in the Scientific view labelled "about extremes".
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .catalog import Catalog, PublishedExpectation, RegionCard, VariableCard
from .contract import Label, PublishedFinding, SelectionCheck, Text
from .place import ar6_region_at

GLOBAL_LAND = "GLOBAL_LAND"  # a worldwide pattern; the only entry that is not tied to one AR6 region


@dataclass
class PublishedMatch:
    ar6: tuple[str, str] | None  # (code, name) of the AR6 region holding the region's centre
    mean: PublishedExpectation | None = None  # the entry that speaks about the monthly mean
    context: list[PublishedExpectation] = field(default_factory=list)  # about extremes: shown as context only


def ar6_of(region: RegionCard) -> tuple[str, str] | None:
    """AR6 region of the region's centre (the tie rule for regions that straddle a boundary)."""
    w, s, e, n = region.geometry.bbox
    return ar6_region_at((w + e) / 2, (s + n) / 2)


def match(catalog: Catalog, region: RegionCard, variable: VariableCard) -> PublishedMatch:
    ar6 = ar6_of(region)
    if ar6 is None or variable.kind == "other":
        return PublishedMatch(ar6)
    entries = [e for e in catalog.published if e.variable_kind == variable.kind and e.ar6_region == ar6[0]]
    if not entries and variable.kind == "humidity":  # no regional humidity assessment: the worldwide land pattern
        entries = [e for e in catalog.published if e.variable_kind == "humidity" and e.ar6_region == GLOBAL_LAND]
    return PublishedMatch(
        ar6,
        mean=next((e for e in entries if not e.about_extremes), None),
        context=[e for e in entries if e.about_extremes],
    )


def _who(entry: PublishedExpectation) -> tuple[str, str, str, str]:
    """(simple, simple_es, scientific label, scientific_es label) of who is speaking."""
    if entry.ar6_region == GLOBAL_LAND:
        return ("This is what scientists who studied the world's land say.", "Esto dicen los científicos que estudiaron las tierras del mundo.",
                "IPCC AR6 (worldwide land pattern, not a regional finding)",
                "IPCC AR6 (patrón mundial de las tierras, no un hallazgo regional)")
    return ("This is what scientists who studied this region say.", "Esto dicen los científicos que estudiaron esta región.",
            f"IPCC AR6, region {entry.ar6_region}", f"IPCC AR6, región {entry.ar6_region}")


def statement_text(entry: PublishedExpectation) -> Text:
    """The statement for the 'What scientists found here' line. The confidence words are the IPCC's own
    (Scientific only), so they are never mistaken for our "how sure are we" meter."""
    who, who_es, sci, sci_es = _who(entry)
    st = entry.statement
    if entry.about_extremes:
        return Text(
            simple=f"About extreme days, not the average. {who} {st.simple}",
            scientific=f"About extremes (not the monthly mean we test). {sci}. IPCC confidence: {entry.confidence}. {st.scientific}",
            simple_es=f"Sobre días extremos, no sobre el promedio. {who_es} {st.simple_es or st.simple}",
            scientific_es=f"Sobre extremos (no sobre la media mensual que analizamos). {sci_es}. Confianza según el IPCC: "
                          f"{entry.confidence_es or entry.confidence}. {st.scientific_es or st.scientific}",
        )
    return Text(
        simple=f"{who} {st.simple}",
        scientific=f"{sci}. IPCC confidence: {entry.confidence}. {st.scientific}",
        simple_es=f"{who_es} {st.simple_es or st.simple}",
        scientific_es=f"{sci_es}. Confianza según el IPCC: {entry.confidence_es or entry.confidence}. "
                      f"{st.scientific_es or st.scientific}",
    )


def expectation_check(entry: PublishedExpectation) -> SelectionCheck:
    """Stage-1 check (b) from an AR6 entry. `unclear` is a caution with the honest text, never a pass;
    `either` (no direction) is a caution too."""
    text = statement_text(entry)
    if entry.direction == "unclear":
        return SelectionCheck(
            code="expectation", status="caution",
            detail=Text(
                simple="Scientists don't have enough data here yet.",
                scientific=f"{text.scientific} Source: {entry.source}",
                simple_es="Los científicos aún no tienen suficientes datos aquí.",
                scientific_es=f"{text.scientific_es} Fuente: {entry.source}",
            ),
        )
    # "either" says change is possible in both directions: a statement without a direction is not a reason to expect change.
    return SelectionCheck(
        code="expectation", status="caution" if entry.direction == "either" else "pass",
        detail=Text(
            simple=text.simple,
            scientific=f"{text.scientific} Source: {entry.source}",
            simple_es=text.simple_es,
            scientific_es=f"{text.scientific_es} Fuente: {entry.source}",
        ),
    )


AR6_LAST_YEAR = 2020  # "since X" statements in IPCC AR6 WGI (2021) assess up to about 2020
MIN_SPAN_SHARE = 0.5  # project rule: compare only when our window covers at least half of the stated period


def stated_span(period: str | None) -> tuple[int, int] | None:
    """(first, last) year of a statement's period text, or None when it is not stated / cannot be read.
    '1961-2015' -> (1961, 2015); 'since about 1950' -> (1950, 2020); 'since the mid-1990s' -> (1995, 2020)."""
    import re

    if not period or "not stated" in period.lower():
        return None
    m = re.search(r"(1[89]\d\d|20\d\d)\s*[-–]\s*(1[89]\d\d|20\d\d)", period)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r"since (?:about |the )?(?:mid-)?(1[89]\d\d|20\d\d)", period)
    if m:
        y = int(m.group(1)) + (5 if "mid-" in period[m.start():m.end()] else 0)
        return y, AR6_LAST_YEAR
    return None


def agreement_of(entry: PublishedExpectation, label: Label | None, slope_per_decade: float | None,
                 window: tuple[int, int] | None = None):
    """agrees / differs / too_soon, or None when the statement has no direction to compare with.

    `agrees`: our verdict is significant with the stated sign. `differs`: significant with the opposite sign,
    never claimed when the statement holds only for parts of the region (our place may lie outside them).
    Everything else (not significant, fragile, no verdict) is `too_soon`: never read as "no change".
    `window` (first, last year of our analysis): agree/differ only when it covers at least MIN_SPAN_SHARE of the
    statement's stated period; a 19-year satellite window says nothing about a 1961-2015 statement. An unknown
    period is not compared either. The shown text for `too_soon` is "our record is too short to compare"."""
    if entry.direction in ("unclear", "either"):
        return None
    if label != "significant" or slope_per_decade is None or slope_per_decade == 0:
        return "too_soon"
    if window is not None:
        span = stated_span(getattr(entry, "period", None))
        if span is None:
            return "too_soon"
        lo, hi = max(window[0], span[0]), min(window[1], span[1])
        if hi - lo + 1 < MIN_SPAN_SHARE * (span[1] - span[0] + 1):
            return "too_soon"
    if (slope_per_decade > 0) == (entry.direction == "up"):
        return "agrees"
    return "too_soon" if entry.partial else "differs"


def finding(entry: PublishedExpectation, label: Label | None = None, slope_per_decade: float | None = None,
            window: tuple[int, int] | None = None) -> PublishedFinding:
    return PublishedFinding(
        statement=statement_text(entry),
        source=entry.source,
        confidence=entry.confidence,
        confidence_es=entry.confidence_es,
        direction=None if entry.direction == "unclear" else entry.direction,
        agreement=None if entry.about_extremes else agreement_of(entry, label, slope_per_decade, window),
        ar6_region=entry.ar6_region,
        scope="extremes" if entry.about_extremes else "mean",
        partial=entry.partial,
    )


def for_result(
    catalog: Catalog, region: RegionCard, variable: VariableCard,
    label: Label | None = None, slope_per_decade: float | None = None,
    m: PublishedMatch | None = None, window: tuple[int, int] | None = None,
) -> tuple[PublishedFinding | None, list[PublishedFinding]]:
    """(published finding for the mean, extremes context) for an analysis result."""
    m = m or match(catalog, region, variable)
    return (
        finding(m.mean, label, slope_per_decade, window) if m.mean else None,
        [finding(e) for e in m.context],
    )
