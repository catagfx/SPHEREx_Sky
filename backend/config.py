"""Paths, environment (.env) and constants shared by the backend."""

import os
import sys

# Portable project-relative paths (works on any OS / user account)
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(ROOT_DIR, "scripts")
DATA_DIR = os.path.join(ROOT_DIR, "data")
if SCRIPTS_DIR not in sys.path and os.path.isdir(SCRIPTS_DIR):
    sys.path.insert(0, SCRIPTS_DIR)

import find_and_cut_movers as mover  # noqa: E402  (scripts/: IRSA TAP queries, WCS cutouts)

CUSTOM_OUT_DIR = os.path.join(ROOT_DIR, "assets", "custom_cutouts")
MOVERS_HITS_CSV = os.environ.get("SPHEREX_HITS_CSV", os.path.join(DATA_DIR, "movers_hits.csv"))
MOVERS_CUTOUTS_DIR = os.environ.get("SPHEREX_CUTOUTS_DIR", os.path.join(DATA_DIR, "movers_cutouts"))
ENV_FILE_PATH = os.path.join(ROOT_DIR, ".env")

os.makedirs(CUSTOM_OUT_DIR, exist_ok=True)


def load_dotenv_into_environ():
    """Loads local .env file (git-ignored) into os.environ without writing secrets anywhere."""
    if not os.path.exists(ENV_FILE_PATH):
        return
    try:
        with open(ENV_FILE_PATH, "r", encoding="utf-8") as f:
            for line in f:
                s = line.strip()
                if not s or s.startswith("#") or "=" not in s:
                    continue
                k, v = s.split("=", 1)
                k = k.strip()
                v = v.strip().strip("'").strip('"')
                if k and k not in os.environ:
                    os.environ[k] = v
    except Exception:
        pass


load_dotenv_into_environ()

IRSA_TAP_TIMEOUT = float(os.environ.get("IRSA_TAP_TIMEOUT", "25.0"))

# Known benchmark targets in the bundled NASA IRSA Level 2 archive (data/movers_cutouts)
KNOWN_BENCHMARKS = [
    {"id": "barnard", "prefix": "Barnard", "name": "Barnard's Star", "ra": 269.4521, "dec": 4.6934, "pmra": -801.5, "pmdec": 10362.4, "kind": "star", "is_synthetic": False},
    {"id": "wise0855", "prefix": "WISE0855", "name": "WISE 0855-0714", "ra": 133.7862, "dec": -7.2443, "pmra": -8118.0, "pmdec": 680.0, "kind": "browndwarf", "is_synthetic": False},
    {"id": "epsindi", "prefix": "EpsIndi", "name": "Epsilon Indi B", "ra": 331.0758, "dec": -56.7938, "pmra": 3961.0, "pmdec": -2538.0, "kind": "browndwarf", "is_synthetic": False},
    {"id": "planetx", "prefix": "PlanetX", "name": "Planet X (Simulated 450 AU Hypothesis)", "ra": 63.0000, "dec": 18.5000, "pmra": 0.0, "pmdec": 0.0, "kind": "star", "is_synthetic": False},
    {"id": "rwaur", "prefix": "RWAurigae", "name": "RW Aurigae", "ra": 76.9565, "dec": 30.4014, "pmra": 4.0, "pmdec": -24.0, "kind": "variable", "is_synthetic": False},
    {"id": "rdraconis", "prefix": "RDraconis", "name": "R Draconis", "ra": 248.1707, "dec": 66.7556, "pmra": -12.0, "pmdec": -18.0, "kind": "variable", "is_synthetic": False},
]
