"""NASA/IPAC IRSA access: TAP queries and HTTP byte-range cutouts of SPHEREx Level 2 FITS frames."""

import csv
import io
import re
import urllib.parse
import urllib.request

import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits

from .config import IRSA_TAP_TIMEOUT, mover


def fast_tap_query(query, timeout=None):
    """Queries NASA IRSA TAP sync endpoint with configurable timeout (default 25s)."""
    if timeout is None:
        timeout = IRSA_TAP_TIMEOUT
    body = urllib.parse.urlencode({
        "REQUEST": "doQuery",
        "LANG": "ADQL",
        "FORMAT": "csv",
        "MAXREC": "2500",
        "QUERY": query,
    }).encode()
    req = urllib.request.Request(mover.TAP_URL, data=body)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    txt = raw.decode("utf-8", "ignore")
    if txt.lstrip().startswith("<"):
        m = re.search(r'QUERY_STATUS"[^>]*>(.*?)</INFO>', txt, re.S)
        raise RuntimeError("IRSA TAP error: " + re.sub(r"\s+", " ", (m.group(1) if m else txt)).strip()[:300])
    return list(csv.DictReader(io.StringIO(txt)))


def fast_range_cutout(row, F, dest):
    """
    Fetches only the WCS header (bytes 0-57599) and the ~220 detector rows covering
    the requested sky patch via HTTP Range requests against NASA IRSA IBE (~1.7 MB instead of 62.5 MB).
    Reprojects onto target_wcs(F) and writes a standard calibrated SPHEREx Level 2 FITS cutout.
    """
    from astropy.wcs import WCS
    from reproject import reproject_interp

    url = urllib.parse.quote(row["download_url"], safe=":/?=&%+,;'()")
    req_hdr = urllib.request.Request(url, headers={"Range": "bytes=0-57599"})
    with urllib.request.urlopen(req_hdr, timeout=20) as r:
        head_bytes = r.read()

    pos = 2880
    while pos + 2880 <= len(head_bytes):
        block = head_bytes[pos : pos + 2880].decode("ascii", "ignore")
        pos += 2880
        if "END     " in block:
            break
    hdu1_data_offset = pos
    hdr = fits.Header.fromstring(head_bytes[2880:hdu1_data_offset].decode("ascii", "ignore"))
    n1, n2 = int(hdr.get("NAXIS1", 2040)), int(hdr.get("NAXIS2", 2040))

    ra, dec = float(row["ra"]), float(row["dec"])
    win = WCS(hdr)
    px, py = win.world_to_pixel(SkyCoord(ra, dec, unit="deg"))
    half_rows = max(115, int(round(F.get("w_deg", 0.30) * 3600.0 / 6.15 * 0.85)))
    y0 = max(0, int(round(float(py))) - half_rows)
    y1 = min(n2, int(round(float(py))) + half_rows)
    if y1 <= y0:
        raise RuntimeError("Target coordinates fall outside detector Y bounds")

    b_start = hdu1_data_offset + y0 * n1 * 4
    b_end = hdu1_data_offset + y1 * n1 * 4 - 1
    req_strip = urllib.request.Request(url, headers={"Range": f"bytes={b_start}-{b_end}"})
    with urllib.request.urlopen(req_strip, timeout=35) as r2:
        strip_bytes = r2.read()

    data = np.full((n2, n1), np.nan, dtype="f4")
    data[y0:y1, :] = np.frombuffer(strip_bytes, dtype=">f4").reshape(y1 - y0, n1)

    wout, W, H = mover.target_wcs(F)
    arr, _ = reproject_interp((data, win), wout, shape_out=(H, W), order="bilinear")
    arr = (arr - np.nanmedian(arr)).astype("f4")

    hd = wout.to_header()
    ox, oy = wout.world_to_pixel(SkyCoord(ra, dec, unit="deg"))
    for k in ("DATE-OBS", "MJD-OBS"):
        if k in hdr:
            hd[k] = hdr[k]
    hd["OBJECT"], hd["OBJTYPE"] = row.get("target", "IRSA_Target"), row.get("kind", "star")
    hd["OBSID"], hd["DETECTOR"], hd["OBJRA"], hd["OBJDEC"] = row["obs_id"], row["det"], ra, dec
    hd["OBJX"], hd["OBJY"] = float(ox), float(oy)
    try:
        yy, xx = np.mgrid[:H, :W]
        rr = np.hypot(xx - float(ox), yy - float(oy))
        bk = np.nanmedian(arr[(rr > 8) & (rr < 14)])
        hd["OBJFLUX"] = (float(np.nanmean(arr[rr < 2.5]) - bk), "mean MJy/sr within 2.5 px")
    except Exception:
        hd["OBJFLUX"] = 0.0
    hd["BUNIT"] = "MJy/sr"
    hd["COVERAGE"] = (float(np.isfinite(arr).mean()), "fraction of the field covered")
    det_num = int(str(row.get("det", "D2")).replace("D", "") or 2)
    default_wl = {1: 0.92, 2: 1.35, 3: 2.02, 4: 3.12, 5: 4.12, 6: 4.71}.get(det_num, 1.35)
    hd["OBJWL"] = (round(default_wl + (float(py) / max(1, n2) - 0.5) * 0.32, 3), "wavelength [um]")
    fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(arr, header=hd, name="IMAGE")]).writeto(dest, overwrite=True)
    return True
