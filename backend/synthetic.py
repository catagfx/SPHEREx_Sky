"""Illustrative synthetic FITS fields, ONLY when the user opts in (allow_synthetic) and no real IRSA data exists.
Every header and observation id is tagged SYNTHETIC so it is never mistaken for archive data."""

import math
import os

import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits

from .config import mover

# three survey passes ~6 months apart: (DATE-OBS, MJD, obs id, wavelength um)
SIM_EPOCHS = [
    ("2025-06-18T08:24:12", 60844.3501, "SYNTHETIC_SIM_PASS1", 1.184),
    ("2025-12-19T19:15:44", 61028.8026, "SYNTHETIC_SIM_PASS2", 1.342),
    ("2026-06-22T04:51:09", 61213.2022, "SYNTHETIC_SIM_PASS3", 1.468),
]


def create_synthetic_spherex_fits(ra_deg, dec_deg, pmra, pmdec, det, target_name, kind, job_dir, fov_deg=0.30):
    """Writes 3 simulated WCS FITS passes (a random star field + the moving target) into job_dir."""
    w_deg = max(0.10, min(0.60, float(fov_deg or 0.30)))
    h_deg = round(w_deg * 0.75, 4)
    F = dict(ra=round(ra_deg, 5), dec=round(dec_deg, 5), w_deg=w_deg, h_deg=h_deg, scale_arcsec=6.15)
    wout, W, H = mover.target_wcs(F)

    seed = int(abs(round(ra_deg * 1000) * 73856093 ^ round((dec_deg + 90) * 1000) * 19349663)) % (2**31 - 1)
    rng = np.random.RandomState(seed)

    n_stars = rng.randint(28, 45)
    star_x = rng.uniform(6, W - 6, size=n_stars)
    star_y = rng.uniform(6, H - 6, size=n_stars)
    star_flux = np.exp(rng.uniform(1.2, 5.2, size=n_stars))
    star_sigma = rng.uniform(1.1, 1.9, size=n_stars)

    yy, xx = np.mgrid[:H, :W]
    base_field = np.zeros((H, W), dtype=np.float32)
    for sx, sy, sf, ss in zip(star_x, star_y, star_flux, star_sigma):
        base_field += sf * np.exp(-((xx - sx) ** 2 + (yy - sy) ** 2) / (2.0 * ss ** 2))

    # a target without a known proper motion still moves visibly
    eff_pmra = pmra if abs(pmra) + abs(pmdec) > 50 else 3200.0
    eff_pmdec = pmdec if abs(pmra) + abs(pmdec) > 50 else -2100.0

    fits_paths = []
    for idx, (date_obs, mjd, obs_id, wl) in enumerate(SIM_EPOCHS):
        dt_yr = (mjd - SIM_EPOCHS[1][1]) / 365.25
        cur_ra = (ra_deg + eff_pmra * dt_yr / (3.6e6 * max(0.1, math.cos(math.radians(dec_deg))))) % 360.0
        cur_dec = max(-89.9, min(89.9, dec_deg + eff_pmdec * dt_yr / 3600000.0))

        ox, oy = wout.world_to_pixel(SkyCoord(cur_ra, cur_dec, unit="deg"))
        fx, fy = float(ox), float(oy)

        noise = rng.normal(0.0, 0.35, size=(H, W)).astype(np.float32)
        target_amp = 145.0 * (1.0 + 0.12 * math.sin(idx * 1.7))
        target_psf = target_amp * np.exp(-((xx - fx) ** 2 + (yy - fy) ** 2) / (2.0 * 1.65 ** 2))
        arr = (base_field + target_psf + noise).astype("f4")

        hd = wout.to_header()
        hd["DATE-OBS"] = date_obs
        hd["MJD-OBS"] = mjd
        hd["OBJECT"] = target_name
        hd["OBJTYPE"] = kind
        hd["OBSID"] = obs_id
        hd["SIMULATD"] = (True, "Illustrative synthetic simulation (not real IRSA data)")
        hd["DETECTOR"] = det
        hd["OBJRA"] = cur_ra
        hd["OBJDEC"] = cur_dec
        hd["OBJX"] = fx
        hd["OBJY"] = fy
        hd["OBJCX"] = fx
        hd["OBJCY"] = fy
        hd["OBJFLUX"] = (float(target_amp * 0.62), "Simulated aperture flux [MJy/sr]")
        hd["BUNIT"] = "MJy/sr"
        hd["COVERAGE"] = (1.0, "fraction of the field covered")
        hd["OBJWL"] = (wl, "wavelength at the object [um]")

        dest = os.path.join(job_dir, f"SYNTHETIC_{det}_{obs_id}.fits")
        fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(arr, header=hd, name="IMAGE")]).writeto(dest, overwrite=True)
        fits_paths.append(dest)

    return fits_paths
