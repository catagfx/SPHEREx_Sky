#!/usr/bin/env python3
"""Find SPHEREx images of moving objects (asteroids, comets) and cut out a fixed-field series for each.

How it works
  1. JPL Horizons gives each object's sky position for every day.
  2. IRSA's TAP service (tables spherex.plane and spherex.artifact) lists the SPHEREx images whose footprint covers it.
  3. For each object it picks a few images taken within about 3 days, in one detector band,
     downloads them, re-projects them onto ONE patch of sky (stars stay put, the object moves),
     and keeps only the small result.

Setup (once):   pip install astropy numpy reproject astroquery
Step 0 (only if step 1 fails): python find_and_cut_movers.py probe   (prints what IRSA answers)
Step 1:         python find_and_cut_movers.py find
                (prints how many SPHEREx images cover each object, and writes movers_hits.csv)
Step 2:         python find_and_cut_movers.py cut
                (downloads about 5 full images per object, about 70 MB each, and cuts them)
Upload the .fits files from the folder "movers_cutouts" and movers_hits.csv afterwards.

Stars:    --targets "Barnard's star:Barnard:star" "WISE J085510.83-071442.5:WISE0855:star"   (SIMBAD name : label : star)
          For stars the cut step picks one image per visit period on one patch of sky, so the star's motion shows.
Options:  --targets 1:Ceres:asteroid 4:Vesta:asteroid   (number or name : label : kind)
          --start 2025-06-01 --stop 2026-06-30          (search period, default: mission start to today)
          --det D2 --frames 5 --only Vesta Ceres         (cut step: detector band, frames per object, which objects)
          --scale 12                                     (cut step: smaller output files)
          --pair D5 [--skip-primary]                     (cut step: the SAME exposures in a second color band)
"""
import argparse, csv, io, math, os, re, sys, time, urllib.parse, urllib.request
from datetime import date
try:
    import numpy as np
    from astropy.io import fits
    from astropy.wcs import WCS
    from astropy.coordinates import SkyCoord
    from astropy.time import Time
    import astropy.units as u
except ImportError:
    sys.exit("Please run:  pip install astropy numpy pillow requests   and then run this script again.")

try:
    from astroquery.jplhorizons import Horizons
except ImportError:
    Horizons = None

try:
    from reproject import reproject_interp
except ImportError:
    reproject_interp = None

TAP_URL = "https://irsa.ipac.caltech.edu/TAP/sync"
DEFAULT_TARGETS = ["1:Ceres:asteroid", "4:Vesta:asteroid", "2:Pallas:asteroid", "3:Juno:asteroid"]
STAR_KINDS = ("star", "variable", "browndwarf")
FORCE_SCALE = None   # arcseconds per pixel; set with --scale 12 to keep the files small
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HITS = os.path.join(_REPO_ROOT, "data", "movers_hits.csv")
OUT = os.path.join(_REPO_ROOT, "data", "movers_cutouts")

# ---------------------------------------------------------------- small helpers
def fetch(url, dest=None, data=None, tries=6):
    url = urllib.parse.quote(url, safe=":/?=&%+,;'()")
    for k in range(tries):
        try:
            req = urllib.request.Request(url, data=data)
            with urllib.request.urlopen(req, timeout=240) as r:
                if dest is None:
                    return r.read()
                total, got = int(r.headers.get("Content-Length") or 0), 0
                with open(dest, "wb") as f:
                    while True:
                        chunk = r.read(1 << 20)
                        if not chunk: break
                        f.write(chunk); got += len(chunk)
                        if total: print("\r   %d / %d MB" % (got >> 20, total >> 20), end="", flush=True)
                print()
                return True
        except Exception as e:
            wait = 5 * (k + 1)
            print("   try %d failed (%s); waiting %d s" % (k + 1, e, wait))
            time.sleep(wait)
    return None

def tap(query):
    body = urllib.parse.urlencode({"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "MAXREC": "20000", "QUERY": query}).encode()
    raw = fetch(TAP_URL, data=body)
    if raw is None: raise RuntimeError("TAP query failed (no answer from IRSA)")
    txt = raw.decode("utf-8", "ignore")
    if txt.lstrip().startswith("<"):
        m = re.search(r'QUERY_STATUS"[^>]*>(.*?)</INFO>', txt, re.S)
        raise RuntimeError("IRSA said: " + re.sub(r"\s+", " ", (m.group(1) if m else txt)).strip()[:700])
    return list(csv.DictReader(io.StringIO(txt)))

def parse_poly(s):
    n = [float(v) for v in re.findall(r"-?\d+\.?\d*(?:[eE][-+]?\d+)?", s.split("ICRS")[1])][:8]
    return np.array(n).reshape(-1, 2)

def parse_ewkb(h):
    """Read a PostGIS polygon given as a hexadecimal string (IRSA's footprint format). Returns (RA, Dec) degrees."""
    import struct, binascii
    b = binascii.unhexlify(h.strip())
    o = "<" if b[0] == 1 else ">"
    t = struct.unpack(o + "I", b[1:5])[0]; pos = 5
    if t & 0x20000000: pos += 4
    if (t & 0xFF) != 3: return None
    pos += 4                                        # number of rings
    n = struct.unpack(o + "I", b[pos:pos + 4])[0]; pos += 4
    pts = np.array(struct.unpack(o + "%dd" % (2 * n), b[pos:pos + 16 * n])).reshape(-1, 2)
    pts[:, 0] %= 360.0
    return pts

def parse_poly_any(text, ra0, dec0):
    """Read a footprint as (RA, Dec) degrees. Accepts 'POLYGON ICRS ...' text, or numbers in radians. Returns None if unreadable."""
    t = (text or "").strip()
    if re.fullmatch(r"[0-9A-Fa-f]{40,}", t):
        try:
            pts = parse_ewkb(t)
        except Exception:
            return None
        if pts is not None and len(pts) >= 4 and all(abs(((p[0] - ra0 + 180) % 360) - 180) < 12 and abs(p[1] - dec0) < 12 for p in pts):
            return pts[:4]
        return None
    try:
        f = [float(v) for v in re.findall(r"-?\d+\.?\d*(?:[eE][-+]?\d+)?", text)]
    except Exception:
        return None
    for conv in (1.0, 180.0 / math.pi):
        n = [v * conv for v in f[:8]]
        if len(n) < 6: return None
        pts = np.array(n[: len(n) // 2 * 2]).reshape(-1, 2)
        pts[:, 0] %= 360.0
        if np.all(np.abs(pts[:, 1]) <= 90) and all(abs(((p[0] - ra0 + 180) % 360) - 180) < 12 and abs(p[1] - dec0) < 12 for p in pts):
            return pts[:4] if len(pts) >= 4 else pts
    return None

def dra(a, b):
    """Signed RA difference a - b in degrees, correct across RA = 0/360."""
    return (np.asarray(a) - np.asarray(b) + 180.0) % 360.0 - 180.0

def inside(poly, ra, dec):
    """Point-in-polygon on a small patch of sky (RA scaled by cos Dec). ra, dec may be arrays."""
    c = math.cos(math.radians(dec if np.isscalar(dec) else float(np.mean(dec))))
    ref = ra if np.isscalar(ra) else float(np.mean(ra))
    px, py = dra(poly[:, 0], ref) * c, poly[:, 1]
    x, y = dra(ra, ref) * c, np.asarray(dec)
    res = np.zeros(np.shape(x), bool)
    j = len(px) - 1
    for i in range(len(px)):
        cond = ((py[i] > y) != (py[j] > y)) & (x < (px[j] - px[i]) * (y - py[i]) / (py[j] - py[i] + 1e-12) + px[i])
        res ^= cond
        j = i
    return res

def covered_with_margin(poly, ra, dec, m=0.15):
    c = math.cos(math.radians(dec))
    pts = [(ra, dec), (ra + m / c, dec), (ra - m / c, dec), (ra, dec + m), (ra, dec - m)]
    return all(bool(inside(poly, a, b)) for a, b in pts)

def interp_pos(jd, jdg, rag, deg):
    ra = np.degrees(np.interp(jd, jdg, np.unwrap(np.radians(rag)))) % 360.0
    return float(ra), float(np.interp(jd, jdg, deg))

def ephem(tid, start, stop):
    o = Horizons(id=tid, id_type="smallbody", location="500", epochs={"start": start, "stop": stop, "step": "1d"})
    e = o.ephemerides(quantities="1,9")
    vm = np.array(e["V"], float) if "V" in e.colnames else np.full(len(e), np.nan)
    return np.array(e["datetime_jd"], float), np.array(e["RA"], float), np.array(e["DEC"], float), vm

def star_params(tid):
    """Return RA, Dec (degrees, epoch J2000), proper motion in RA*cos(Dec) and Dec (mas/yr), and the epoch.
    tid is a SIMBAD name, or typed numbers: "RA,Dec,pmRA,pmDec[@epoch]" (degrees, mas/yr)."""
    m = re.match(r"^\s*(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)(?:@([\d.]+))?\s*$", tid)
    if m:
        ra, dec, pa, pd_ = [float(m.group(k)) for k in (1, 2, 3, 4)]; return ra, dec, pa, pd_, float(m.group(5) or 2000.0)
    from astroquery.simbad import Simbad
    sim = Simbad(); sim.add_votable_fields("pmra", "pmdec")
    t = sim.query_object(tid)
    if t is None or len(t) == 0: raise RuntimeError('SIMBAD does not know "%s"' % tid)
    cols = {c.lower(): c for c in t.colnames}
    ra, dec = t[cols["ra"]][0], t[cols["dec"]][0]
    if isinstance(ra, (str, bytes)):
        c = SkyCoord(str(ra), str(dec), unit=(u.hourangle, u.deg)); ra, dec = c.ra.deg, c.dec.deg
    def num(k):
        try: v = float(t[cols[k]][0]); return v if np.isfinite(v) else 0.0
        except Exception: return 0.0
    return float(ra), float(dec), num("pmra"), num("pmdec"), 2000.0

def star_ephem(tid, start, stop):
    ra0, dec0, pa, pd_, ep = star_params(tid)
    print("   position %.5f %.5f (epoch %.1f), proper motion %.0f, %.0f mas/yr (%.2f arcsec/yr)" % (ra0, dec0, ep, pa, pd_, math.hypot(pa, pd_) / 1000))
    j0 = Time(start).jd; j1 = Time(stop).jd; jdg = np.arange(j0, j1 + 1, 5.0)
    yrs = 2000.0 + (jdg - 2451545.0) / 365.25 - ep
    rag = (ra0 + pa * yrs / (3.6e6 * math.cos(math.radians(dec0)))) % 360.0
    deg = dec0 + pd_ * yrs / 3.6e6
    return jdg, rag, deg, np.full(len(jdg), np.nan)

# ---------------------------------------------------------------- step 1: find
SELECT = ("SELECT 'https://irsa.ipac.caltech.edu/' || a.uri AS download_url, p.obs_publisher_did AS did, "
          "p.time_bounds_lower AS tlo, p.time_bounds_upper AS thi, p.energy_bandpassname AS band, p.poly AS poly "
          "FROM spherex.artifact a JOIN spherex.plane p ON a.planeid = p.planeid ")

def probe():
    for q in ("SELECT TOP 2 * FROM spherex.plane", "SELECT TOP 2 * FROM spherex.artifact",
              SELECT + "WHERE INTERSECTS(p.poly, CIRCLE('ICRS', 156.09, -41.64, 0.2)) = 1 AND p.time_bounds_lower >= 60800 AND p.time_bounds_lower <= 60840"):
        print("\nQUERY:", q[:200])
        try:
            rows = tap(q); print("  rows:", len(rows))
            for r in rows[:1]:
                for k, v in r.items(): print("   ", k, "=", str(v)[:110])
                if "poly" in r: print("    footprint read as (RA, Dec):", None if parse_poly_any(r["poly"], 156.09, -41.64) is None else parse_poly_any(r["poly"], 156.09, -41.64).round(3).tolist())
        except Exception as e:
            print("  FAILED:", e)

def verify_server(cands, ra, dec):
    """Fallback when footprints cannot be read: ask IRSA which candidates really contain the object's position."""
    ok = set()
    for i in range(0, len(cands), 12):
        part = cands[i:i + 12]
        cl = " OR ".join("(p.obs_publisher_did = '%s' AND CONTAINS(POINT('ICRS', %.5f, %.5f), p.poly) = 1)" % (c["did"], c["ra"], c["dec"]) for c in part)
        try:
            for r in tap("SELECT p.obs_publisher_did AS did FROM spherex.plane p WHERE " + cl): ok.add(r["did"])
        except Exception as e:
            print("   verification failed:", e)
    return ok

def find(targets, start, stop, win=8):
    rows_out = []
    for spec in targets:
        tid, name, kind = (spec.split(":") + ["", ""])[:3]
        name, kind = name or tid, kind or "asteroid"
        print("\n==", name, "(" + kind + ")")
        try:
            jdg, rag, deg, vm = (star_ephem if kind in STAR_KINDS else ephem)(tid, start, stop)
        except Exception as e:
            print("   Horizons failed:", e); continue
        mjd0, mjd1 = jdg[0] - 2400000.5, jdg[-1] - 2400000.5
        n_hit, shown = 0, False
        t = mjd0
        w_ = (mjd1 - mjd0 + 1) if kind in STAR_KINDS else win
        while t < mjd1:
            t2 = min(t + w_, mjd1)
            ts = np.linspace(t, t2, 5)
            pos = [interp_pos(x + 2400000.5, jdg, rag, deg) for x in ts]
            cra, cde = pos[2]
            rad = (0.6 if kind in STAR_KINDS else 2.6) + max(math.hypot(float(dra(p[0], cra)) * math.cos(math.radians(cde)), p[1] - cde) for p in pos)
            q = (SELECT + "WHERE INTERSECTS(p.poly, CIRCLE('ICRS', %.5f, %.5f, %.3f)) = 1 AND p.time_bounds_lower >= %.5f AND p.time_bounds_lower <= %.5f"
                 % (cra, cde, rad, t, t2))
            try:
                rows = tap(q)
            except Exception as e:
                print("   query failed for MJD %.1f: %s" % (t, e)); rows = []
            cands = []
            for r in rows:
                try:
                    tm = (float(r["tlo"]) + float(r["thi"])) / 2
                    ra, dec = interp_pos(tm + 2400000.5, jdg, rag, deg)
                    poly = parse_poly_any(r["poly"], ra, dec)
                    if not shown: print("   example footprint text:", r["poly"][:90], "->", "readable" if poly is not None else "NOT readable"); shown = True
                    m = re.search(r"\?([^/]+)/", r["did"]); obs = m.group(1) if m else r["did"]
                    c = dict(did=r["did"], obs_id=obs, det=(r["band"] or "").replace("SPHEREx-", "") or "?", mjd=tm, ra=ra, dec=dec,
                             vmag=float(np.interp(tm + 2400000.5, jdg, vm)), url=r["download_url"], poly=r["poly"], pts=poly)
                    cands.append(c)
                except Exception:
                    continue
            keep = [c for c in cands if (c["pts"] is not None and covered_with_margin(c["pts"], c["ra"], c["dec"]))]
            unread = [c for c in cands if c["pts"] is None]
            if unread:
                good = verify_server(unread, 0, 0); keep += [c for c in unread if c["did"] in good]
            for c in keep:
                rows_out.append(dict(target=name, kind=kind, obs_id=c["obs_id"], det=c["det"], mjd="%.5f" % c["mjd"], ra="%.6f" % c["ra"], dec="%.6f" % c["dec"],
                                     vmag="%.2f" % c["vmag"], download_url=c["url"], poly=c["poly"]))
            n_hit += len(keep)
            print("   MJD %.0f-%.0f: %d images checked, %d total hits so far" % (t, t2, len(rows), n_hit))
            t = t2 + 1e-6
    with open(HITS, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["target", "kind", "obs_id", "det", "mjd", "ra", "dec", "vmag", "download_url", "poly"])
        w.writeheader(); w.writerows(rows_out)
    print("\nSummary (images whose footprint covers the object):")
    for name in sorted({r["target"] for r in rows_out}):
        rs = [r for r in rows_out if r["target"] == name]
        dets = {}
        for r in rs: dets[r["det"]] = dets.get(r["det"], 0) + 1
        ms = [float(r["mjd"]) for r in rs]
        print("  %-8s %5d images, bands %s, MJD %.0f to %.0f, V about %.1f to %.1f" % (name, len(rs), dict(sorted(dets.items())), min(ms), max(ms),
              min(float(r["vmag"]) for r in rs), max(float(r["vmag"]) for r in rs)))
    print("Wrote", HITS, "- run 'python find_and_cut_movers.py cut' next, and send me", HITS)

# ---------------------------------------------------------------- step 2: choose frames and cut
def make_field(rows):
    ras = np.array([float(r["ra"]) for r in rows]); des = np.array([float(r["dec"]) for r in rows])
    rel = dra(ras, ras[0])
    dec0 = float((des.min() + des.max()) / 2); c = math.cos(math.radians(dec0))
    ra0 = float((ras[0] + (rel.min() + rel.max()) / 2) % 360.0)
    spx, spy = (rel.max() - rel.min()) * c, des.max() - des.min()
    w = min(2.4, max(1.2, spx + 0.9, (spy + 0.9) / 0.75)); h = w * 0.75
    return dict(ra=round(ra0, 4), dec=round(dec0, 4), w_deg=round(w, 3), h_deg=round(h, 3), scale_arcsec=FORCE_SCALE or (12.0 if w > 1.5 else 6.15))

def coverage(row, F, n=25):
    c = math.cos(math.radians(F["dec"]))
    xs = np.linspace(-F["w_deg"] / 2, F["w_deg"] / 2, n); ys = np.linspace(-F["h_deg"] / 2, F["h_deg"] / 2, n)
    X, Y = np.meshgrid(xs, ys)
    pts = parse_poly_any(row["poly"], F["ra"], F["dec"])
    if pts is None: return 1.0
    return float(inside(pts, F["ra"] + X / c, F["dec"] + Y).mean())

def choose(rows, max_frames, win_days=4.5, span_max=1.5, min_cov=0.85):
    rows = sorted(rows, key=lambda r: float(r["mjd"])); best = None
    for i in range(len(rows)):
        t0 = float(rows[i]["mjd"]); thin, last = [], -9
        for r in rows[i:]:
            m = float(r["mjd"])
            if m - t0 > win_days: break
            if m - last >= 1.5 / 24: thin.append(r); last = m
        while len(thin) >= 2:
            ras = [float(r["ra"]) for r in thin]; des = [float(r["dec"]) for r in thin]
            rel = dra(np.array(ras), ras[0])
            if max((rel.max() - rel.min()) * math.cos(math.radians(des[0])), max(des) - min(des)) <= span_max: break
            thin = thin[:-1]
        if len(thin) < 2: continue
        F = make_field(thin); keep = [r for r in thin if coverage(r, F) >= min_cov]
        if len(keep) < 2: continue
        if len(keep) > max_frames:
            idx = np.linspace(0, len(keep) - 1, max_frames).round().astype(int); keep = [keep[k] for k in idx]
        F = make_field(keep)
        score = (len(keep), -float(np.nanmean([float(r["vmag"]) for r in keep])))
        if best is None or score > best[0]: best = (score, F, keep)
    return (best[1], best[2]) if best else (None, [])

def choose_epochs(rows, max_frames, gap_days=45.0, min_cov=0.9):
    """For stars: one image per visit period (at least gap_days apart), all on the same small patch of sky."""
    rows = sorted(rows, key=lambda r: float(r["mjd"])); groups, last = [], None
    for r in rows:
        m = float(r["mjd"])
        if last is None or m - last > gap_days: groups.append([])
        groups[-1].append(r); last = m
    if not groups: return None, []
    ras = np.array([float(r["ra"]) for r in rows]); des = np.array([float(r["dec"]) for r in rows]); rel = dra(ras, ras[0])
    F = dict(ra=round(float((ras[0] + (rel.min() + rel.max()) / 2) % 360.0), 5), dec=round(float((des.min() + des.max()) / 2), 5), w_deg=0.3, h_deg=0.225, scale_arcsec=6.15)
    sel = []
    for g in groups:
        best = max(g, key=lambda r: coverage(r, F, 15))
        if coverage(best, F, 15) >= min_cov: sel.append(best)
    if len(sel) > max_frames:
        idx = np.linspace(0, len(sel) - 1, max_frames).round().astype(int); sel = [sel[k] for k in idx]
    return F, sel

def target_wcs(F):
    s = F["scale_arcsec"] / 3600.0
    W, H = int(round(F["w_deg"] / s)), int(round(F["h_deg"] / s))
    w = WCS(naxis=2); w.wcs.ctype = ["RA---TAN", "DEC--TAN"]; w.wcs.crval = [F["ra"], F["dec"]]
    w.wcs.cdelt = [-s, s]; w.wcs.crpix = [W / 2 + 0.5, H / 2 + 0.5]
    return w, W, H

def process(full, row, F, dest):
    wout, W, H = target_wcs(F)
    ra, dec = float(row["ra"]), float(row["dec"])
    with fits.open(full) as hdul:
        img = hdul["IMAGE"]; win = WCS(img.header, fobj=hdul); data = img.data.astype("f4")
        if "ZODI" in hdul and hdul["ZODI"].data is not None:
            z = hdul["ZODI"].data.astype("f4"); data = data - np.where(np.isfinite(z), z, np.nanmedian(z))
        arr, fp = reproject_interp((data, win), wout, shape_out=(H, W), order="bilinear")
        arr = (arr - np.nanmedian(arr)).astype("f4")
        hd = wout.to_header()
        ox, oy = wout.world_to_pixel(SkyCoord(ra, dec, unit="deg"))
        ix, iy = int(round(float(ox))), int(round(float(oy)))
        near = arr[max(iy - 8, 0):iy + 9, max(ix - 8, 0):ix + 9] if (0 <= ix < W and 0 <= iy < H) else np.zeros((0, 0))
        if near.size == 0 or np.isfinite(near).mean() < 0.3: raise RuntimeError("the object is outside this image")   # a bright object may leave NaN pixels at its centre; that is fine
        for k in ("DATE-OBS", "MJD-OBS"):
            if k in img.header: hd[k] = img.header[k]
        hd["OBJECT"], hd["OBJTYPE"] = row["target"], row["kind"]
        hd["VMAG"] = float(row["vmag"]) if np.isfinite(float(row["vmag"])) else -99.0
        hd["OBSID"], hd["DETECTOR"], hd["OBJRA"], hd["OBJDEC"] = row["obs_id"], row["det"], ra, dec
        x, y = wout.world_to_pixel(SkyCoord(ra, dec, unit="deg")); hd["OBJX"], hd["OBJY"] = float(x), float(y)
        try:
            yy, xx = np.mgrid[:H, :W]; rr = np.hypot(xx - float(ox), yy - float(oy)); bk = np.nanmedian(arr[(rr > 8) & (rr < 14)])
            hd["OBJFLUX"] = (float(np.nanmean(arr[rr < 2.5]) - bk), "mean MJy/sr within 2.5 px of the predicted position")
            win_ = (rr < 4) & np.isfinite(arr); wgt = np.clip(arr - bk, 0, None) * win_
            if wgt.sum() > 0:
                cxm, cym = float((xx * wgt).sum() / wgt.sum()), float((yy * wgt).sum() / wgt.sum()); sk = wout.pixel_to_world(cxm, cym)
                hd["OBJCX"], hd["OBJCY"], hd["OBJCRA"], hd["OBJCDEC"] = cxm, cym, float(sk.ra.deg), float(sk.dec.deg)
        except Exception as e:
            print("   (could not measure the object:", e, ")")
        hd["BUNIT"] = "MJy/sr"; hd["COVERAGE"] = (float(np.isfinite(arr).mean()), "fraction of the field covered")
        try:
            sw = WCS(img.header, hdul, key="W"); px, py = win.world_to_pixel(SkyCoord(ra, dec, unit="deg"))
            wave, band = sw.pixel_to_world(float(px), float(py)); hd["OBJWL"] = (float(wave.to("um").value), "wavelength at the object [um]")
        except Exception as e:
            print("   (could not compute wavelength:", e, ")")
        fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(arr, header=hd, name="IMAGE")]).writeto(dest, overwrite=True)

def cut(det, frames, only=None, pair=None, skip_primary=False):
    if not os.path.exists(HITS): sys.exit("Run 'python find_and_cut_movers.py find' first.")
    rows = list(csv.DictReader(open(HITS)))
    os.makedirs(OUT, exist_ok=True); manifest = ["file,target,kind,date,obs_id,detector,ra,dec,vmag"]
    for name in sorted({r["target"] for r in rows}):
        if only and name.lower() not in [o.lower() for o in only]: continue
        rs = [r for r in rows if r["target"] == name and r["det"] == det]
        F, sel = choose_epochs(rs, frames) if rs and rs[0]["kind"] in STAR_KINDS else choose(rs, frames)
        print("\n==", name, "-", len(rs), "images in", det, "->", len(sel), "chosen")
        if not sel: print("   no suitable set of frames; try --det D1 or D3"); continue
        print("   field: RA %.3f Dec %.3f, %.2f x %.2f degrees" % (F["ra"], F["dec"], F["w_deg"], F["h_deg"]))
        todo = [] if skip_primary else [(r, det) for r in sel]
        if pair:   # the SAME exposures seen in a second detector band, on the SAME patch of sky
            for r in sel:
                pr = next((x for x in rows if x["target"] == name and x["det"] == pair and x["obs_id"] == r["obs_id"]), None)
                if pr: todo.append((pr, pair))
                else: print("   no", pair, "image for exposure", r["obs_id"])
        for r, d in todo:
            mjd = float(r["mjd"]); stamp = "%d" % round(mjd * 24)
            dest = os.path.join(OUT, "%s_%s_%s_%s.fits" % (name, d, r["obs_id"], stamp))
            row_txt = ",".join([os.path.basename(dest), name, r["kind"], "%.4f" % mjd, r["obs_id"], d, r["ra"], r["dec"], r["vmag"]])
            if os.path.exists(dest) and os.path.getsize(dest) > 1000:
                print("  ", os.path.basename(dest), "already done"); manifest.append(row_txt); continue
            print("  ", r["obs_id"], d, "MJD %.3f" % mjd)
            url = r["download_url"]
            if not url.lower().split("?")[0].endswith(".fits"):
                print("   unexpected download link:", url[:100]); continue
            full = os.path.join(OUT, "_full_" + os.path.basename(url.split("?")[0]))
            if not (os.path.exists(full) and os.path.getsize(full) > 1 << 20):
                print("   downloading the full image (about 70 MB)")
                if not fetch(url, full): print("   download failed; skipping"); continue
            try:
                process(full, r, F, dest); os.remove(full)
                print("   saved", os.path.basename(dest), os.path.getsize(dest) // 1024, "KB"); manifest.append(row_txt)
            except Exception as e:
                print("   processing failed:", e)
    open(os.path.join(OUT, "manifest.csv"), "w").write("\n".join(manifest) + "\n")
    print("\nDone. Upload the .fits files from the folder:", OUT, "and the file", HITS)

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Find and cut SPHEREx images of moving objects")
    ap.add_argument("step", choices=["probe", "find", "cut"])
    ap.add_argument("--targets", nargs="*", default=DEFAULT_TARGETS)
    ap.add_argument("--start", default="2025-06-01"); ap.add_argument("--stop", default=str(date.today()))
    ap.add_argument("--det", default="D2"); ap.add_argument("--frames", type=int, default=5)
    ap.add_argument("--scale", type=float, default=None, help="cut step: arcseconds per pixel of the result, e.g. --scale 12 for smaller files")
    ap.add_argument("--pair", default=None, help="cut step: also cut the same exposures in this second band, e.g. --pair D5 (D2 pairs with D5, D1 with D4, D3 with D6)")
    ap.add_argument("--skip-primary", action="store_true", help="cut step: only cut the --pair band")
    ap.add_argument("--only", nargs="*", default=None, help="cut step: only these object names, e.g. --only Vesta Ceres")
    a = ap.parse_args()
    FORCE_SCALE = a.scale
    probe() if a.step == "probe" else find(a.targets, a.start, a.stop) if a.step == "find" else cut(a.det, a.frames, a.only, a.pair, a.skip_primary)
