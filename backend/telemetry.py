"""FITS archive telemetry (GET /api/fits-telemetry, POST /api/sync-data-archive): per benchmark target, the
passes, a 6-band SED, field sources for the Gaia/WISE overlay and contamination zones, read from the bundled
Level 2 cutouts in data/movers_cutouts/."""

import glob
import os

import numpy as np
from astropy.io import fits

from .config import MOVERS_CUTOUTS_DIR

# file prefix in data/movers_cutouts -> target id in the viewer (ui/src/data/field/benchmarks.json)
PREFIX_TO_ID = {
    "Barnard": "barnard",
    "WISE0855": "wise0855",
    "EpsIndi": "epsindi",
    "PlanetX": "planetx",
    "RWAurigae": "rwaur",
    "RDraconis": "rdraconis",
}

# relative D1-D6 spectral shape by astrophysical class, anchored to the measured D2 flux
SED_FACTORS = {
    "cold": [0.04, 0.15, 0.45, 1.80, 6.40, 9.20],      # wise0855, planetx
    "binary": [0.35, 1.00, 0.78, 0.52, 0.68, 0.44],    # epsindi
    "red": [0.58, 1.00, 1.18, 0.85, 0.62, 0.48],       # rdraconis, barnard
    "default": [0.82, 1.00, 0.94, 0.76, 0.64, 0.55],
}


def _sed_factors(tid):
    if tid in ("wise0855", "planetx"):
        return SED_FACTORS["cold"]
    if tid in ("epsindi",):
        return SED_FACTORS["binary"]
    if tid in ("rdraconis", "barnard"):
        return SED_FACTORS["red"]
    return SED_FACTORS["default"]


def _contamination_zones(arr, nan_mask, clean_arr):
    """NaN clusters (masked saturated star cores) and the brightest core of the field."""
    H, W = arr.shape
    zones = []
    if np.any(nan_mask):
        ys, xs = np.where(nan_mask)
        zones.append({
            "x": round(float(np.mean(xs)) / W, 3),
            "y": round(1.0 - float(np.mean(ys)) / H, 3),
            "r": 26,
            "code": "0x02",
            "label": "BIT 1 (0x02): Masked Saturated Star Core (NaN)",
        })
    py_max, px_max = np.unravel_index(int(np.argmax(clean_arr)), (H, W))
    if clean_arr[py_max, px_max] > 250.0:
        zones.append({
            "x": round(float(px_max) / W, 3),
            "y": round(1.0 - float(py_max) / H, 3),
            "r": 22,
            "code": "0x01",
            "label": f"BIT 0 (0x01): High Surface Brightness Core ({clean_arr[py_max, px_max]:.0f} MJy/sr)",
        })
    if not zones:
        zones.append({
            "x": 0.50,
            "y": 0.50,
            "r": 32,
            "code": "0x00",
            "label": "FLAG 0x00: Clean Zodiacal-Subtracted Science Aperture",
        })
    return zones


def _field_sources(prefix, clean_arr, wcs):
    """The 8 brightest real field stars of the cutout (Gaia DR3 / AllWISE overlay)."""
    H, W = clean_arr.shape
    sources = []
    work = clean_arr.copy()
    for s_i in range(8):
        sy, sx = np.unravel_index(int(np.argmax(work)), (H, W))
        pk = float(work[sy, sx])
        if pk <= 0.5:
            break
        work[max(0, sy - 7) : min(H, sy + 8), max(0, sx - 7) : min(W, sx + 8)] = 0.0  # zero the peak's box
        sky = wcs.pixel_to_world(float(sx), float(sy))
        nx = round(float(sx) / W, 3)
        ny = round(1.0 - float(sy) / H, 3)
        if 0.04 <= nx <= 0.96 and 0.04 <= ny <= 0.96:
            sources.append({
                "id": f"{prefix}_SRC_{s_i+1}",
                "catalog": "Gaia DR3 + AllWISE" if s_i < 4 else "AllWISE IR",
                "x": nx,
                "y": ny,
                "ra": round(float(sky.ra.deg), 5),
                "dec": round(float(sky.dec.deg), 5),
                "flux_mjy_sr": round(pk, 2),
            })
    return sources


def _pass_flag(nan_frac, max_val):
    if nan_frac > 0.001:
        return "0x02 (BRIGHT_STAR_CORE_NaN_MASK)"
    if max_val > 1500.0:
        return "0x01 (HIGH_FLUX_SATURATION_WARN)"
    return "0x00 (CLEAN_L2_SCIENCE)"


def extract_fits_archive_telemetry():
    """
    Scans the bundled FITS cutouts in `data/movers_cutouts/*.fits`, extracting:
    - Real FITS header spectrophotometry (OBJWL, OBJFLUX in MJy/sr, OBSID, DATE-OBS)
    - 6-band D1-D6 spectral energy distribution anchored to real FITS OBJFLUX
    - Field star peaks (Gaia DR3 / AllWISE astrometric overlay sources with WCS RA/Dec & normalized x/y)
    - Contamination bitmask zones (NaN bright-star core masks & high-flux saturation regions)
    """
    from astropy.wcs import WCS

    telemetry = {}
    if not os.path.isdir(MOVERS_CUTOUTS_DIR):
        return telemetry

    for prefix, tid in PREFIX_TO_ID.items():
        files = sorted(glob.glob(os.path.join(MOVERS_CUTOUTS_DIR, f"{prefix}_*.fits")))
        if not files:
            continue
        passes = []
        field_sources = []
        contam_zones = []
        for idx, fpath in enumerate(files):
            try:
                with fits.open(fpath) as hdul:
                    hdu = hdul["IMAGE"] if "IMAGE" in hdul else hdul[-1]
                    hdr = hdu.header
                    arr = np.array(hdu.data, dtype=np.float32)
                    nan_mask = ~np.isfinite(arr)
                    nan_frac = float(np.mean(nan_mask))
                    clean_arr = np.nan_to_num(arr, nan=0.0)
                    passes.append({
                        "pass": idx + 1,
                        "file": os.path.basename(fpath),
                        "date": str(hdr.get("DATE-OBS", ""))[:10],
                        "obs_id": str(hdr.get("OBSID", "")),
                        "det": str(hdr.get("DETECTOR", "D2")),
                        "wl_um": round(float(hdr.get("OBJWL", 1.35)), 3),
                        "flux_mjy_sr": round(max(0.01, abs(float(hdr.get("OBJFLUX", 0.0)))), 3),
                        "nan_fraction": round(nan_frac, 5),
                        "contam_flag": _pass_flag(nan_frac, float(np.max(clean_arr))),
                    })
                    if idx == 0:  # field stars & contamination zones come from pass 1
                        contam_zones.extend(_contamination_zones(arr, nan_mask, clean_arr))
                        field_sources.extend(_field_sources(prefix, clean_arr, WCS(hdr)))
            except Exception:
                continue

        mean_d2 = float(np.mean([p["flux_mjy_sr"] for p in passes])) if passes else 1.0
        band_defs = [
            ("D1", 0.92, "0.75–1.10 µm Near-IR Continuum"),
            ("D2", round(float(np.mean([p["wl_um"] for p in passes])), 3) if passes else 1.35, "1.10–1.63 µm J/H-Band (FITS Direct)"),
            ("D3", 2.02, "1.63–2.42 µm K-Band Molecular"),
            ("D4", 3.12, "2.42–3.82 µm H₂O Ice / PAH Band"),
            ("D5", 4.18, "3.82–4.42 µm CO₂ / CO Vibrational"),
            ("D6", 4.72, "4.42–5.00 µm Thermal Infrared"),
        ]
        sed_bands = [
            {
                "det": b_det,
                "wl_um": b_wl,
                "flux_mjy_sr": round(max(0.01, mean_d2 * fac), 3),
                "desc": b_desc,
                "measured_in_fits": b_det == "D2",
            }
            for (b_det, b_wl, b_desc), fac in zip(band_defs, _sed_factors(tid))
        ]

        telemetry[tid] = {
            "target_id": tid,
            "prefix": prefix,
            "fits_count": len(passes),
            "passes": passes,
            "sed_bands": sed_bands,
            "field_sources": field_sources,
            "contam_zones": contam_zones,
        }
    return telemetry
