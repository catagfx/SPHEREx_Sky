"""Sky coordinates: parsing user input, sexagesimal formatting, matching the bundled benchmarks."""

import math
import re

import astropy.units as u
from astropy.coordinates import SkyCoord

from .config import KNOWN_BENCHMARKS, mover


def sky_distance_deg(ra_deg, dec_deg, ra2, dec2):
    """Small-angle separation (degrees) between (ra_deg, dec_deg) and (ra2, dec2)."""
    return math.hypot(mover.dra(ra_deg, ra2) * math.cos(math.radians(dec_deg)), dec_deg - dec2)


def find_benchmark(ra_deg, dec_deg, max_deg):
    """The first bundled benchmark within max_deg of the coordinates, or None."""
    for bm in KNOWN_BENCHMARKS:
        if sky_distance_deg(ra_deg, dec_deg, bm["ra"], bm["dec"]) <= max_deg:
            return bm
    return None


def parse_user_coordinates(ra_str, dec_str, target_name=""):
    """
    Parses decimal degrees or sexagesimal RA/Dec strings, or resolves target_name via SIMBAD.
    Returns (ra_deg, dec_deg, pmra, pmdec, resolved_name, kind).
    """
    ra_s = str(ra_str if ra_str is not None else "").strip()
    dec_s = str(dec_str if dec_str is not None else "").strip()
    tname = str(target_name if target_name is not None else "").strip()

    if (not ra_s or not dec_s) and tname:
        for bm in KNOWN_BENCHMARKS:
            if tname.lower() in bm["name"].lower() or tname.lower() == bm["id"]:
                return bm["ra"], bm["dec"], bm["pmra"], bm["pmdec"], bm["name"], bm["kind"]
        try:
            ra0, dec0, pmra, pmdec, _ = mover.star_params(tname)
            return float(ra0), float(dec0), float(pmra), float(pmdec), tname, "star"
        except Exception as e:
            raise ValueError(f"Could not resolve object name '{tname}' via SIMBAD: {e}")

    def parse_single(val_str, is_dec=False):
        s = val_str.strip()
        s_clean = re.sub(r"[°dD\s]+$", "", s)
        try:
            v = float(s_clean)
            if is_dec and (v < -90 or v > 90):
                raise ValueError("Declination must be between -90° and +90°.")
            if not is_dec:
                v = v % 360.0
            return v
        except ValueError:
            pass

        sign = -1.0 if s.startswith("-") else 1.0
        has_hms = bool(re.search(r"[hHmMsS]", s)) and not is_dec
        nums = [abs(float(x)) for x in re.findall(r"[-+]?\d+\.?\d*", s)]
        if not nums:
            raise ValueError(f"Invalid coordinate format: '{val_str}'")
        d = nums[0] + (nums[1] / 60.0 if len(nums) > 1 else 0.0) + (nums[2] / 3600.0 if len(nums) > 2 else 0.0)
        if not is_dec and (has_hms or ":" in s or len(nums) >= 2) and nums[0] <= 24.0:
            d *= 15.0
        return sign * d if is_dec else (d % 360.0)

    ra_deg = parse_single(ra_s, is_dec=False)
    dec_deg = parse_single(dec_s, is_dec=True)

    for bm in KNOWN_BENCHMARKS:
        if sky_distance_deg(ra_deg, dec_deg, bm["ra"], bm["dec"]) < 0.35:
            return ra_deg, dec_deg, bm["pmra"], bm["pmdec"], (tname or bm["name"]), bm["kind"]

    return ra_deg, dec_deg, 0.0, 0.0, (tname or f"J{ra_deg:06.2f}{dec_deg:+06.2f}"), "star"


def deg_to_sexagesimal(ra_deg, dec_deg):
    c = SkyCoord(ra=ra_deg * u.deg, dec=dec_deg * u.deg, frame="icrs")
    ra_hms = c.ra.to_string(unit=u.hourangle, sep=("h ", "m ", "s"), precision=2, pad=True)
    dec_dms = c.dec.to_string(unit=u.deg, sep=("° ", "′ ", "″"), precision=1, alwayssign=True, pad=True)
    return ra_hms, dec_dms
