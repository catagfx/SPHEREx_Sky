"""The IRSA cutout job (POST /api/irsa-cutout runs it in a background thread):
coordinates -> FITS passes (bundled archive, else live IRSA, else an opt-in simulation) -> images, report,
optional email -> a catalog entry the viewer can open. Progress is reported through backend.state.update_job."""

import concurrent.futures
import csv
import glob
import json
import math
import os
import re
import shutil
import traceback

from .config import CUSTOM_OUT_DIR, IRSA_TAP_TIMEOUT, MOVERS_CUTOUTS_DIR, MOVERS_HITS_CSV, mover
from .coords import deg_to_sexagesimal, find_benchmark, parse_user_coordinates
from .irsa import fast_range_cutout, fast_tap_query
from .mailer import build_and_send_email
from .render import render_fits_series_to_images
from .state import JOBS, JOBS_LOCK, update_job
from .synthetic import create_synthetic_spherex_fits


def _bundled_hits(ra_deg, dec_deg):
    """Rows of data/movers_hits.csv (pre-fetched IRSA observations) within 0.38° of the coordinates."""
    rows = []
    if not os.path.exists(MOVERS_HITS_CSV):
        return rows
    with open(MOVERS_HITS_CSV, "r", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            try:
                dist = math.hypot(mover.dra(ra_deg, float(r["ra"])) * math.cos(math.radians(dec_deg)), dec_deg - float(r["dec"]))
                if dist <= 0.38:
                    rows.append(r)
            except Exception:
                continue
    return rows


def _tap_query(ra_deg, dec_deg, fov_deg):
    """ADQL for the SPHEREx Level 2 exposures intersecting the field (survey window MJD 60760-61400)."""
    return (
        mover.SELECT
        + f"WHERE INTERSECTS(p.poly, CIRCLE('ICRS', {ra_deg:.5f}, {dec_deg:.5f}, {max(0.25, fov_deg):.3f})) = 1 "
        + "AND p.time_bounds_lower >= 60760 AND p.time_bounds_lower <= 61400"
    )


def _covering_rows(tap_rows, ra_deg, dec_deg, det, resolved_name, kind):
    """TAP rows whose footprint really covers the target (with margin), as hit rows."""
    for r in tap_rows:
        tm = (float(r["tlo"]) + float(r["thi"])) / 2.0
        poly = mover.parse_poly_any(r["poly"], ra_deg, dec_deg)
        if poly is not None and mover.covered_with_margin(poly, ra_deg, dec_deg):
            m = re.search(r"\?([^/]+)/", r["did"])
            yield {
                "target": resolved_name,
                "kind": kind,
                "obs_id": m.group(1) if m else r["did"],
                "det": (r["band"] or "").replace("SPHEREx-", "") or det,
                "mjd": f"{tm:.5f}",
                "ra": f"{ra_deg:.6f}",
                "dec": f"{dec_deg:.6f}",
                "vmag": "nan",
                "download_url": r["download_url"],
                "poly": r["poly"],
            }


def _cut_live_passes(job_id, rows, det, fov_deg, max_frames, job_dir, total_hits):
    """Choose well-separated passes and cut them via parallel HTTP byte-range requests; returns FITS paths."""
    det_rows = [r for r in rows if r["det"] == det] or rows
    F, sel = mover.choose_epochs(det_rows, max_frames)
    if not sel or len(sel) < 2:
        F, sel = mover.choose_epochs(det_rows, max_frames, gap_days=0.05, min_cov=0.35)
    if not sel:
        return []
    F["w_deg"] = fov_deg
    F["h_deg"] = round(fov_deg * 0.75, 4)
    update_job(
        job_id,
        stage="downloading_fits",
        progress=55,
        log=f"Selected {len(sel)} optimal survey passes in {det} ({total_hits} total hits). Fetching Level 2 FITS detector strips via parallel HTTP Byte-Range & reprojecting...",
    )

    def cut_one(item):
        idx_s, r = item
        stamp = "%d" % round(float(r["mjd"]) * 24)
        dest = os.path.join(job_dir, f"IRSA_{det}_{r['obs_id']}_{stamp}.fits")
        update_job(job_id, log=f"Fetching exposure {idx_s+1}/{len(sel)}: {r['obs_id']} ({det}) via HTTP Range...")
        try:
            if fast_range_cutout(r, F, dest):
                return idx_s, dest
        except Exception as range_err:
            update_job(job_id, log=f"HTTP Range notice on {r['obs_id']}: {range_err}")
        return idx_s, None

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(cut_one, enumerate(sel)))
    return [p for _, p in sorted(results, key=lambda x: x[0]) if p and os.path.exists(p)]


def _viewer_frames(frames_meta, url_prefix, is_synthetic):
    return [{
        "d": fm["d"],
        "t": fm["t"],
        "b": fm["b"],
        "u": f"{url_prefix}/{fm['clean_file']}",
        "annotated_u": f"{url_prefix}/{fm['annotated_file']}",
        "fits_u": f"{url_prefix}/{fm['fits_file']}",
        "x": fm["x"],
        "y": fm["y"],
        "cov": fm["cov"],
        "obs_id": fm["obs_id"],
        "det": fm["det"],
        "wl": fm["wl"],
        "ra": fm["ra"],
        "dec": fm["dec"],
        "flux": fm["flux"],
        "contam_flag": fm["contam_flag"],
        "is_synthetic": is_synthetic,
    } for fm in frames_meta]


def _catalog_item(job_id, resolved_name, ra_deg, dec_deg, ra_hms, dec_dms, det, fov_deg, data_source, is_synthetic, frames, spectrum_points):
    """A FIELD entry (same shape as ui/src/data/field/*.json) so the explorer can show the processed target."""
    label_suffix = "[SYNTHETIC DEMO]" if is_synthetic else "(IRSA Level 2)"
    return {
        "id": f"custom_{job_id}",
        "label": f"{resolved_name} {label_suffix}",
        "name": resolved_name,
        "kind": "Illustrative Synthetic Simulation" if is_synthetic else "NASA IRSA Level 2 Target",
        "is_synthetic": is_synthetic,
        "data_source": data_source,
        "fov_deg": fov_deg,
        "lab": "dt",
        "crop": 24,
        "r": 20,
        "closeTitle": f"Close-ups on {resolved_name}",
        "tags": ["star", "custom-irsa"] + (["synthetic"] if is_synthetic else ["nasa-benchmark"]),
        "ra": round(ra_deg, 4),
        "dec": round(dec_deg, 4),
        "spectrum_points": spectrum_points,
        "blurb": (
            f"{'[SYNTHETIC SIMULATION] ' if is_synthetic else 'Real NASA IRSA Level 2 cutout at '}RA {ra_deg:.3f}°, Dec {dec_deg:+.3f}° "
            f"(FOV {fov_deg:.2f}°, {len(frames)} passes)."
        ),
        "span": f"{len(frames)} passes ({frames[0]['d']} to {frames[-1]['d']})",
        "caption": (
            f"{'[SYNTHETIC ILLUSTRATIVE SIMULATION] ' if is_synthetic else 'NASA IRSA Level 2 multi-epoch cutouts '}processed via find_and_cut_movers.py "
            f"for {resolved_name} (RA {ra_deg:.4f}°, Dec {dec_deg:+.4f}°, FOV {fov_deg:.2f}°)."
        ),
        "aside": (
            f"<p class=\"small\"><strong>{'⚠️ Synthetic Demo:' if is_synthetic else '✓ Verified IRSA Cutout:'}</strong> "
            f"WCS-registered across {len(frames)} survey passes in Detector {det} (FOV {fov_deg:.2f}°).</p>"
            f"<p class=\"small\">Equatorial: RA {ra_hms}, Dec {dec_dms}. Contamination Bitmask: <code>{frames[0]['contam_flag']}</code>.</p>"
        ),
        "frames": frames,
    }


def execute_irsa_cutout_job(job_id, params):
    """Background worker executing the NASA IRSA IPAC cutout, spectrum & optional email workflow."""
    try:
        ra_in = params.get("ra", "")
        dec_in = params.get("dec", "")
        target_in = str(params.get("target_name") or "").strip()
        email_in = str(params.get("email") or "").strip()
        det_raw = str(params.get("detector") or "D2").strip().upper()
        det = det_raw if det_raw.startswith("D") else f"D{det_raw}"
        fov_deg = max(0.10, min(0.60, float(params.get("fov") or 0.30)))
        max_frames = max(2, min(5, int(params.get("frames") or 3)))
        allow_synthetic = bool(params.get("allow_synthetic", False))
        smtp_override = params.get("smtp")

        update_job(
            job_id,
            status="running",
            stage="parsing_coords",
            progress=10,
            fov_deg=fov_deg,
            log=f"Parsing coordinates ({ra_in}, {dec_in}) with field of view {fov_deg:.2f}°...",
        )

        ra_deg, dec_deg, pmra, pmdec, resolved_name, kind = parse_user_coordinates(ra_in, dec_in, target_in)
        if params.get("pmra") not in (None, ""):
            pmra = float(params["pmra"])
        if params.get("pmdec") not in (None, ""):
            pmdec = float(params["pmdec"])

        ra_hms, dec_dms = deg_to_sexagesimal(ra_deg, dec_deg)
        job_dir = os.path.join(CUSTOM_OUT_DIR, job_id)
        os.makedirs(job_dir, exist_ok=True)

        update_job(
            job_id,
            ra=round(ra_deg, 5),
            dec=round(dec_deg, 5),
            ra_hms=ra_hms,
            dec_dms=dec_dms,
            target_name=resolved_name,
            kind=kind,
            email=email_in,
            detector=det,
            stage="querying_irsa",
            progress=20,
            log=f"Resolved ICRS J2000: RA {ra_deg:.4f}° ({ra_hms}), Dec {dec_deg:+.4f}° ({dec_dms}). Checking bundled NASA IRSA Level 2 archive & live TAP...",
        )

        # Step 1: pre-cut real NASA IRSA FITS files of a bundled benchmark (data/movers_cutouts)
        fits_files = []
        data_source = "none"
        is_synthetic = False
        matched_bm = find_benchmark(ra_deg, dec_deg, 0.35)
        matched_rows = _bundled_hits(ra_deg, dec_deg)

        if matched_bm and os.path.isdir(MOVERS_CUTOUTS_DIR):
            cand_fits = sorted(glob.glob(os.path.join(MOVERS_CUTOUTS_DIR, f"{matched_bm['prefix']}_*.fits")))
            if cand_fits:
                for cf in cand_fits[:max_frames]:
                    dest_f = os.path.join(job_dir, os.path.basename(cf))
                    shutil.copy2(cf, dest_f)
                    fits_files.append(dest_f)
                data_source = "irsa_cached_fits"
                update_job(
                    job_id,
                    log=f"Loaded {len(fits_files)} verified NASA IRSA SPHEREx Level 2 FITS cutouts ({matched_bm['prefix']}) from bundled archive ({len(matched_rows)} covering footprints in movers_hits.csv).",
                )

        # Step 2: not bundled -> live NASA IRSA TAP (full 25 s timeout)
        live_tap_ok = False
        if not fits_files:
            update_job(
                job_id,
                stage="querying_irsa_live",
                progress=30,
                log=f"Querying live NASA IRSA TAP service ({mover.TAP_URL}, timeout={IRSA_TAP_TIMEOUT:.0f}s) for covering SPHEREx Level 2 exposures...",
            )
            try:
                tap_rows = fast_tap_query(_tap_query(ra_deg, dec_deg, fov_deg), timeout=IRSA_TAP_TIMEOUT)
                live_tap_ok = True
                for row in _covering_rows(tap_rows, ra_deg, dec_deg, det, resolved_name, kind):
                    matched_rows.append(row)
                update_job(job_id, log=f"Live NASA IRSA TAP query succeeded: {len(matched_rows)} covering footprints found.")
            except Exception as tap_exc:
                update_job(job_id, log=f"Live IRSA TAP query status: {tap_exc}")

        total_hits = len(matched_rows)
        update_job(job_id, total_irsa_hits=total_hits, stage="selecting_epochs", progress=45)

        if not fits_files and matched_rows and live_tap_ok:
            fits_files = _cut_live_passes(job_id, matched_rows, det, fov_deg, max_frames, job_dir, total_hits)
            if fits_files:
                data_source = "irsa_live_fits"

        # Step 3: honest handling when no real FITS files could be retrieved
        if not fits_files:
            if not allow_synthetic:
                msg_no_data = (
                    f"No downloadable NASA IRSA SPHEREx Level 2 FITS cutouts were available for RA {ra_deg:.4f}°, Dec {dec_deg:+.4f}° "
                    f"(IRSA TAP hits found: {total_hits}). To generate an illustrative simulated field for testing, "
                    f"check 'Allow Illustrative Synthetic Simulation if IRSA FITS unavailable'."
                )
                update_job(
                    job_id,
                    status="no_coverage",
                    stage="no_coverage",
                    progress=100,
                    data_source="no_coverage",
                    is_synthetic=False,
                    error=msg_no_data,
                    log=msg_no_data,
                )
                return

            is_synthetic = True
            data_source = "synthetic_simulation"
            update_job(
                job_id,
                stage="processing_fits",
                progress=58,
                is_synthetic=True,
                data_source=data_source,
                log=f"[SYNTHETIC SIMULATION MODE] Generating illustrative 3-pass WCS FITS simulation centered on RA {ra_deg:.4f}°, Dec {dec_deg:+.4f}° (FOV {fov_deg:.2f}°)...",
            )
            fits_files = create_synthetic_spherex_fits(
                ra_deg, dec_deg, pmra, pmdec, det, resolved_name, kind, job_dir, fov_deg=fov_deg
            )

        # Step 4: render FITS cutouts to images, blink GIF, difference map & spectrum
        update_job(
            job_id,
            stage="rendering_cutouts",
            progress=75,
            data_source=data_source,
            is_synthetic=is_synthetic,
            log="Applying Zodi subtraction, WCS tangent-plane alignment, contamination bitmask check, and asinh stretch...",
        )
        frames_meta, gif_path, diff_path, spectrum_points = render_fits_series_to_images(
            fits_files, job_dir, resolved_name, is_synthetic=is_synthetic, fov_deg=fov_deg
        )

        url_prefix = f"assets/custom_cutouts/{job_id}"
        viewer_frames = _viewer_frames(frames_meta, url_prefix, is_synthetic)
        catalog_item = _catalog_item(job_id, resolved_name, ra_deg, dec_deg, ra_hms, dec_dms, det, fov_deg,
                                     data_source, is_synthetic, viewer_frames, spectrum_points)

        # Step 5: report + optional email
        update_job(
            job_id,
            stage="packaging_report",
            progress=90,
            log="Generating HTML report, spectrum telemetry, and optional email package...",
        )
        with JOBS_LOCK:
            snapshot = dict(JOBS[job_id])
        email_result = build_and_send_email(
            job_id, snapshot, job_dir, frames_meta, gif_path, diff_path, smtp_override=smtp_override
        )
        if email_in:
            update_job(job_id, log=email_result["message"])

        update_job(
            job_id,
            status="completed",
            stage="completed",
            progress=100,
            data_source=data_source,
            is_synthetic=is_synthetic,
            fov_deg=fov_deg,
            frames=viewer_frames,
            spectrum_points=spectrum_points,
            blink_gif_url=f"{url_prefix}/blink_animation.gif",
            diff_map_url=f"{url_prefix}/difference_map.jpg",
            catalog_item=catalog_item,
            email_result=email_result,
            log="Processing complete! Multi-epoch cutouts, spectrum, difference map, and report are ready.",
        )

        with JOBS_LOCK:
            with open(os.path.join(job_dir, "job_result.json"), "w", encoding="utf-8") as f:
                json.dump(JOBS[job_id], f, indent=2)

    except Exception as exc:
        update_job(
            job_id,
            status="error",
            stage="error",
            error=str(exc),
            traceback=traceback.format_exc(),
            log=f"Error: {exc}",
        )
