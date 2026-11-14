"""SPHEREx 20 Constellations backend catalog & coordinate calculator (/api/constellations)."""

import json
import math
import os
from .config import ROOT_DIR

CONSTELLATIONS_PATH = os.path.join(ROOT_DIR, "ui", "src", "data", "constellations.json")


def radec_to_gal(ra_deg: float, dec_deg: float):
    """Convert J2000 equatorial (RA, Dec in degrees) to Galactic (l, b in degrees)."""
    ra = math.radians(ra_deg)
    dec = math.radians(dec_deg)
    ra_gp = math.radians(192.85948)
    dec_gp = math.radians(27.12825)
    l_cp = math.radians(122.93192)

    sin_b = math.sin(dec) * math.sin(dec_gp) + math.cos(dec) * math.cos(dec_gp) * math.cos(ra - ra_gp)
    b = math.asin(max(-1.0, min(1.0, sin_b)))
    y = math.cos(dec) * math.sin(ra - ra_gp)
    x = math.cos(dec_gp) * math.sin(dec) - math.sin(dec_gp) * math.cos(dec) * math.cos(ra - ra_gp)
    l = (l_cp - math.atan2(y, x)) % (2.0 * math.pi)
    if l < 0:
        l += 2.0 * math.pi
    return round(math.degrees(l), 2), round(math.degrees(b), 2)


def get_constellations_payload():
    """Return the 20 SPHEREx constellations with verified J2000 & Galactic coordinates."""
    if not os.path.exists(CONSTELLATIONS_PATH):
        return {"ok": True, "count": 0, "constellations": []}
    with open(CONSTELLATIONS_PATH, "r", encoding="utf-8") as f:
        items = json.load(f)
    for item in items:
        if ("l" not in item or "b" not in item) and item.get("stars"):
            _, ra0, dec0 = item["stars"][0]
            item["l"], item["b"] = radec_to_gal(float(ra0), float(dec0))
    return {
        "ok": True,
        "count": len(items),
        "constellations": items,
    }
