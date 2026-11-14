"""The VERSION file is the single source of truth (RELEASING.md); the engine must report it."""

from pathlib import Path

from trend_detective import ENGINE_VERSION


def test_engine_version_matches_version_file():
    assert ENGINE_VERSION == (Path(__file__).resolve().parents[2] / "VERSION").read_text().strip()
