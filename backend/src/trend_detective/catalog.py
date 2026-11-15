"""Knowledge catalog: variable, theme, region and glossary cards (catalog/*.yaml)."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

from .contract import RegionRef, Text, UnitsInfo, VariableRef

Role = Literal["target", "driver", "response", "cross_check"]
# What a variable measures, in the words of the published assessments (catalog/expectations.yaml).
VariableKind = Literal["temperature", "rainfall", "humidity", "soil_water", "haze", "no2", "other"]


class Card(BaseModel):
    """Catalog cards reject unknown keys, so a YAML typo fails loudly."""

    model_config = ConfigDict(extra="forbid")


class Units(Card):
    native: str
    display: str
    simple: str
    scale: float = 1.0
    offset: float = 0.0
    decimals: int = 2
    simple_es: str | None = None  # Spanish kid unit, e.g. "puntos de humedad"

    def to_display(self, native_value: float) -> float:
        return native_value * self.scale + self.offset

    def info(self) -> UnitsInfo:
        return UnitsInfo(display=self.display, simple=self.simple, decimals=self.decimals)


class Source(Card):
    instrument: str
    platform: str | None = None
    type: Literal["observed", "model"]
    instrument_id: str | None = None  # key into catalog/instruments.yaml
    delivered_by: str | None = None  # e.g. "NASA POWER": a delivery service, not an instrument


class InstrumentCard(Card):
    """A satellite instrument or computer model that our variables come from (catalog/instruments.yaml)."""

    id: str
    name: Text
    kind: Literal["satellite", "model"]
    platform: str | None = None
    since: int
    measures: Text  # what it gives us
    how: Text  # how it measures, in kid words for simple
    live: Literal["giovanni", "power", "offline"]
    link: str | None = None
    assimilates: list[str] = Field(default_factory=list)  # instrument ids whose data this model ingests (not independent)


class Artifact(Card):
    kind: str
    start: str  # "YYYY-MM"
    action: Literal["end_window_before", "flag"]
    note: Text


class Words(Card):
    """Kid sentence parts, e.g. 'Yes, {subject} {verb} {up} in {region}.'"""

    subject: str
    verb: Literal["is", "are"]
    up: str
    down: str


class WordsEs(Card):
    """Spanish counterpart of Words. Whole phrases, because Spanish needs gender and number agreement:
    'Si, {subject} {up} en {region}.' / 'Es muy pronto para saber si {subject} {changing} en {region}.'"""

    subject: str  # with article, e.g. "las tardes", "el aire"
    up: str  # predicate, e.g. "se vuelven más húmedas"
    down: str
    changing: str  # agrees with the subject, e.g. "están cambiando"


class KidUnits(Card):
    """Whole-number 'then vs now' for the simple view: display value * scale, then label."""

    scale: float = 1.0
    label: str
    label_es: str | None = None


class VariableCard(Card):
    id: str
    giovanni_id: str | None = None
    power_param: str | None = None  # NASA POWER parameter (live source)
    name: Text
    definition: Text
    source: Source
    units: Units
    grid_deg: float
    record_start: str
    record_end: str | None = None
    coverage: Literal["global"] | list[float] = "global"  # or [W, S, E, N]
    cadence: Literal["monthly", "daily", "hourly"] = "monthly"  # daily and hourly are averaged to months by the source
    min_valid_days: int | None = None  # daily only: a month counts only with at least this many valid days
    domain: Literal["any", "land", "ocean"] = "any"
    listed: bool = True  # false hides the card from every list (e.g. offline-only with no data)
    floor: float | None = None
    artifacts: list[Artifact] = Field(default_factory=list)
    cross_check: str | None = None
    kind: VariableKind = "other"  # which published assessments (AR6) speak about this variable
    reference_trend_per_decade: float | None = None  # published typical trend size (stage-1 detectability)
    reference_source: str | None = None
    words: Words
    words_es: WordsEs | None = None
    kid_units: KidUnits
    themes: dict[str, Role]

    def ref(self) -> VariableRef:
        return VariableRef(
            id=self.id,
            giovanni_id=self.giovanni_id,
            name=self.name,
            definition=self.definition,
            source_type=self.source.type,
            instrument=self.source.instrument,
            units=self.units.info(),
            instrument_id=self.source.instrument_id,
            platform=self.source.platform,
            delivered_by=self.source.delivered_by,
            cell_deg=self.grid_deg,
        )


class Geometry(Card):
    """bbox: an area (W, S, E, N). shape: a Giovanni shape with its bounding box.
    point: one place; bbox = [lon, lat, lon, lat] (a live source returns its grid cell)."""

    kind: Literal["bbox", "shape", "point"]
    bbox: list[float]  # W, S, E, N
    shape_ref: str | None = None
    area_fraction: float = 1.0

    def cells(self, grid_deg: float) -> float:
        if self.kind == "point":
            return 1.0
        w, s, e, n = self.bbox
        return ((e - w) / grid_deg) * ((n - s) / grid_deg) * self.area_fraction


class DeclaredSeason(Card):
    variable: str
    id: str
    name: Text
    months: list[int]


class Expectation(Card):
    """Stage-1 check (b): a cited, published reason to expect change in this region."""

    variable: str
    direction: Literal["up", "down", "either"]
    expected_per_decade: float | None = None
    reason: Text
    source: str


# Metrics that describe extremes or events, not the monthly mean we test. A statement about them is context only.
EXTREME_METRICS = frozenset({"hot_extremes", "heavy_precipitation", "meteorological_drought"})


class PublishedExpectation(Card):
    """A checked statement from the IPCC AR6 regional assessment (catalog/expectations.yaml).

    direction: up | down | either | unclear. `unclear` = the source says data are limited or evidence is low
    confidence; it is never read as "nothing is happening". `confidence` is the source's own wording and is
    kept apart from our "how sure are we" meter. `partial`: the statement holds for parts of the region, so a
    place that disagrees may simply lie outside them (never reported as "differs")."""

    ar6_region: str  # AR6 acronym, or GLOBAL_LAND for a worldwide pattern
    ar6_region_name: str | None = None
    place: str | None = None
    variable_kind: VariableKind
    metric: str | None = None
    direction: Literal["up", "down", "either", "unclear"]
    partial: bool = False
    confidence: str  # the source's own words, e.g. "High confidence"; never our meter
    confidence_es: str | None = None
    period: str
    statement: Text
    source: str
    checked_by: str
    opened_at: str

    @property
    def about_extremes(self) -> bool:
        """True when the statement is about extremes or events, so it must not stand in for a MONTHLY MEAN trend."""
        return self.metric in EXTREME_METRICS


class RegionCard(Card):
    id: str
    name: Text
    description: Text
    regime: str
    geometry: Geometry
    comparison_region: str | None = None
    listed: bool = True  # False hides it from the region picker (e.g. a comparison box)
    expectations: list[Expectation] = Field(default_factory=list)
    declared_seasons: list[DeclaredSeason] = Field(default_factory=list)

    def ref(self) -> RegionRef:
        return RegionRef(id=self.id, name=self.name)

    def expectation_for(self, variable_id: str) -> Expectation | None:
        return next((e for e in self.expectations if e.variable == variable_id), None)

    def seasons_for(self, variable_id: str) -> list[DeclaredSeason]:
        return [s for s in self.declared_seasons if s.variable == variable_id]


class ThemeCard(Card):
    id: str
    name: Text
    question: Text
    parent: str | None = None  # a sub-topic names its top-level theme (one level only)


class GlossaryTerm(Card):
    id: str
    term: Text
    definition: Text


class Catalog(BaseModel):
    variables: dict[str, VariableCard]
    themes: dict[str, ThemeCard]
    regions: dict[str, RegionCard]
    glossary: dict[str, GlossaryTerm]
    instruments: dict[str, InstrumentCard] = Field(default_factory=dict)
    published: list[PublishedExpectation] = Field(default_factory=list)

    def theme_members(self, theme_id: str) -> list[tuple[VariableCard, Role]]:
        return [(v, v.themes[theme_id]) for v in self.variables.values() if theme_id in v.themes]

    @classmethod
    def load(cls, catalog_dir: Path) -> Catalog:
        def read(name: str) -> list[dict]:
            with open(catalog_dir / name, encoding="utf-8") as f:
                return yaml.safe_load(f) or []

        variables = {d["id"]: VariableCard(**_stringify_months(d)) for d in read("variables.yaml")}
        themes = {d["id"]: ThemeCard(**d) for d in read("themes.yaml")}
        regions = {d["id"]: RegionCard(**d) for d in read("regions.yaml")}
        glossary = {d["id"]: GlossaryTerm(**d) for d in read("glossary.yaml")}
        instruments = (
            {d["id"]: InstrumentCard(**d) for d in read("instruments.yaml")}
            if (catalog_dir / "instruments.yaml").exists() else {}
        )
        published = (
            [PublishedExpectation(**_stringify_dates(d)) for d in read("expectations.yaml")]
            if (catalog_dir / "expectations.yaml").exists() else []
        )
        cat = cls(variables=variables, themes=themes, regions=regions, glossary=glossary, instruments=instruments,
                  published=published)
        cat.validate_links()
        return cat

    def validate_links(self) -> None:
        for v in self.variables.values():
            if v.source.instrument_id and self.instruments and v.source.instrument_id not in self.instruments:
                raise ValueError(f"{v.id}: unknown instrument_id {v.source.instrument_id}")
            if v.cross_check and v.cross_check not in self.variables:
                raise ValueError(f"{v.id}: unknown cross_check {v.cross_check}")
            for t in v.themes:
                if t not in self.themes:
                    raise ValueError(f"{v.id}: unknown theme {t}")
        for t in self.themes.values():
            if not t.parent:
                continue
            parent = self.themes.get(t.parent)
            if parent is None:
                raise ValueError(f"{t.id}: unknown parent theme {t.parent}")
            if parent.parent:
                raise ValueError(f"{t.id}: parent {t.parent} is itself a sub-topic (one level only)")
            for v in self.variables.values():
                if t.id in v.themes and t.parent not in v.themes:
                    raise ValueError(f"{v.id}: in sub-topic {t.id} but not in its parent theme {t.parent}")
        for inst in self.instruments.values():
            for a in inst.assimilates:
                if a not in self.instruments:
                    raise ValueError(f"{inst.id}: assimilates unknown instrument {a}")
        for r in self.regions.values():
            if r.comparison_region and r.comparison_region not in self.regions:
                raise ValueError(f"{r.id}: unknown comparison_region {r.comparison_region}")
            for s in r.declared_seasons:
                if s.variable not in self.variables:
                    raise ValueError(f"{r.id}: season for unknown variable {s.variable}")
                if not s.months or any(not 1 <= m <= 12 for m in s.months) or s.months != sorted(set(s.months)):
                    raise ValueError(
                        f"{r.id}/{s.variable}/{s.id}: months must be unique, 1-12 and ascending "
                        "(seasons crossing the year end are not supported yet)"
                    )


def _stringify_dates(d: dict) -> dict:
    """YAML reads an unquoted 2026-11-15 as a date; the card keeps it as text."""
    d = dict(d)
    if d.get("opened_at") is not None:
        d["opened_at"] = str(d["opened_at"])
    return d


def _stringify_months(d: dict) -> dict:
    """YAML reads 2002-09 as a string but 2002-09-01 as a date; keep months as strings."""
    d = dict(d)
    for k in ("record_start", "record_end"):
        if d.get(k) is not None:
            d[k] = str(d[k])[:7]
    d["artifacts"] = [{**a, "start": str(a["start"])[:7]} for a in d.get("artifacts", [])]
    return d
