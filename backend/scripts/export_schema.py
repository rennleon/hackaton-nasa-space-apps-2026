"""Export the result contract as JSON Schema for the front end (contract/*.schema.json).

Serialization mode marks fields that always appear in the JSON (even with defaults) as required.

Run: uv run python scripts/export_schema.py
"""

import json
from pathlib import Path

from trend_detective.contract import AnalysisResult, ScanResult

OUT = Path(__file__).resolve().parents[2] / "contract"


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for name, model in {"analysis-result": AnalysisResult, "scan-result": ScanResult}.items():
        path = OUT / f"{name}.schema.json"
        path.write_text(json.dumps(model.model_json_schema(mode="serialization"), indent=2, ensure_ascii=False) + "\n")
        print("wrote", path)


if __name__ == "__main__":
    main()
