"""WebXR / VR backend configuration and landmark catalog (/api/vr-config)."""

import json
import os
from .config import ROOT_DIR

LANDMARKS_PATH = os.path.join(ROOT_DIR, "ui", "src", "data", "landmarks.json")


def get_vr_config_payload():
    """Return WebXR session configuration and the 11 SPHEREx 3D Star Map landmarks."""
    landmarks = []
    if os.path.exists(LANDMARKS_PATH):
        with open(LANDMARKS_PATH, "r", encoding="utf-8") as f:
            raw = json.load(f)
        for idx, row in enumerate(raw):
            landmarks.append({
                "idx": idx,
                "label": row[0],
                "l": float(row[1]),
                "b": float(row[2]),
                "cardTitle": row[3] if len(row) > 3 else row[0],
                "cardSub": row[4] if len(row) > 4 else "",
            })
    return {
        "ok": True,
        "reference_spaces": ["local-floor", "bounded-floor", "local"],
        "optional_features": ["local-floor", "bounded-floor", "hand-tracking"],
        "defaults": {
            "bgIntensity": 0.7,
            "starIntensity": 0.4,
            "dustIntensity": 0.75,
            "uiOpacity": 0.86,
        },
        "landmarks_count": len(landmarks),
        "landmarks": landmarks,
    }
