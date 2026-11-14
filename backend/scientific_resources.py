"""SPHEREx Partner Scientific Resources (CSA / NEOSSat / CADC) loader & validator."""

import json
import os
from urllib.parse import urlparse
from .config import ROOT_DIR

SCIENTIFIC_RESOURCES_PATHS = [
    os.path.join(ROOT_DIR, "scientific_resources.json"),
    os.path.join(ROOT_DIR, "ui", "src", "data", "scientific_resources.json"),
]

REQUIRED_FIELDS = ("id", "title", "description", "details", "source", "url")


def validate_scientific_resource(raw_item: dict, index: int = 0) -> dict:
    """Validate a single scientific resource dictionary against the BE 1 / BE 2 schema."""
    item = raw_item if isinstance(raw_item, dict) else {}
    missing_fields = []

    for field in REQUIRED_FIELDS:
        val = item.get(field)
        if not isinstance(val, str) or not val.strip():
            missing_fields.append(field)

    raw_url = item.get("url", "").strip() if isinstance(item.get("url"), str) else ""
    parsed = urlparse(raw_url) if raw_url else None
    has_valid_url = bool(parsed and parsed.scheme in ("http", "https") and parsed.netloc)

    if not has_valid_url and "url" not in missing_fields:
        missing_fields.append("url")

    return {
        "id": item.get("id", "").strip() if isinstance(item.get("id"), str) and item.get("id").strip() else f"resource-{index + 1}",
        "title": item.get("title", "").strip() if isinstance(item.get("title"), str) and item.get("title").strip() else "Untitled Scientific Resource",
        "description": item.get("description", "").strip() if isinstance(item.get("description"), str) and item.get("description").strip() else "Short description unavailable for this scientific resource.",
        "details": item.get("details", "").strip() if isinstance(item.get("details"), str) and item.get("details").strip() else "Detailed astronomical explanation is currently unavailable.",
        "source": item.get("source", "").strip() if isinstance(item.get("source"), str) and item.get("source").strip() else "CSA (Canadian Space Agency)",
        "url": raw_url if has_valid_url else None,
        "hasValidUrl": has_valid_url,
        "isValid": len(missing_fields) == 0,
        "missingFields": missing_fields,
    }


def load_scientific_resources() -> dict:
    """Load and validate all resources from scientific_resources.json."""
    target_path = next((p for p in SCIENTIFIC_RESOURCES_PATHS if os.path.exists(p)), None)
    if not target_path:
        return {
            "ok": False,
            "count": 0,
            "validCount": 0,
            "resources": [],
            "errors": ["scientific_resources.json not found."],
        }

    with open(target_path, "r", encoding="utf-8") as f:
        raw_data = json.load(f)

    items = raw_data if isinstance(raw_data, list) else raw_data.get("resources", [])
    errors = []
    seen_ids = set()
    validated_list = []

    for idx, entry in enumerate(items):
        validated = validate_scientific_resource(entry, idx)
        if not validated["isValid"]:
            errors.append(
                f"Resource [{idx}] ('{validated['id']}') missing/invalid fields: {', '.join(validated['missingFields'])}"
            )
        if validated["id"] in seen_ids:
            errors.append(f"Duplicate resource id: '{validated['id']}'")
        seen_ids.add(validated["id"])
        validated_list.append(validated)

    valid_count = sum(1 for r in validated_list if r["isValid"])
    return {
        "ok": len(errors) == 0 and len(validated_list) > 0,
        "count": len(validated_list),
        "validCount": valid_count,
        "resources": validated_list,
        "errors": errors,
    }
