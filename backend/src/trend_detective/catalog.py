"""Knowledge catalog: variable, theme, region and glossary cards (catalog/*.yaml)."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

from .contract import RegionRef, Text, UnitsInfo, VariableRef

Role = Literal["target", "driver", "response", "cross_check"]


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

    def to_display(self, native_value: float) -> float:
        return native_value * self.scale + self.offset

    def info(self) -> UnitsInfo:
        return UnitsInfo(display=self.display, simple=self.simple, decimals=self.decimals)


class Source(Card):
    instrument: str
    platform: str | None = None
    type: Literal["observed", "model"]


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


class KidUnits(Card):
    """Whole-number 'then vs now' for the simple view: display value * scale, then label."""

    scale: float = 1.0
    label: str


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
    cadence: Literal["monthly"] = "monthly"
    floor: float | None = None
    artifacts: list[Artifact] = Field(default_factory=list)
    cross_check: str | None = None
    reference_trend_per_decade: float | None = None  # published typical trend size (stage-1 detectability)
    reference_source: str | None = None
    words: Words
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
        )


class Geometry(Card):
    kind: Literal["bbox", "shape"]
    bbox: list[float]  # W, S, E, N
    shape_ref: str | None = None
    area_fraction: float = 1.0

    def cells(self, grid_deg: float) -> float:
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


class GlossaryTerm(Card):
    id: str
    term: Text
    definition: Text


class Catalog(BaseModel):
    variables: dict[str, VariableCard]
    themes: dict[str, ThemeCard]
    regions: dict[str, RegionCard]
    glossary: dict[str, GlossaryTerm]

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
        cat = cls(variables=variables, themes=themes, regions=regions, glossary=glossary)
        cat.validate_links()
        return cat

    def validate_links(self) -> None:
        for v in self.variables.values():
            if v.cross_check and v.cross_check not in self.variables:
                raise ValueError(f"{v.id}: unknown cross_check {v.cross_check}")
            for t in v.themes:
                if t not in self.themes:
                    raise ValueError(f"{v.id}: unknown theme {t}")
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


def _stringify_months(d: dict) -> dict:
    """YAML reads 2002-09 as a string but 2002-09-01 as a date; keep months as strings."""
    d = dict(d)
    for k in ("record_start", "record_end"):
        if d.get(k) is not None:
            d[k] = str(d[k])[:7]
    d["artifacts"] = [{**a, "start": str(a["start"])[:7]} for a in d.get("artifacts", [])]
    return d
