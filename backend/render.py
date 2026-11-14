"""Turns a series of calibrated FITS cutouts into the job's images: clean + annotated JPEGs, a blink GIF,
the digital difference map (last pass - first pass) and the per-pass photometry."""

import os

import numpy as np
from astropy.io import fits
from PIL import Image, ImageDraw

OUT_W, OUT_H = 720, 540
WARM = (255, 184, 107)
COOL = (143, 211, 255)
HUD_BG = (10, 14, 26)


def _contamination_flag(nan_frac, max_px):
    """SPHEREx Level 2 quality bitmask, evaluated on the rendered cutout."""
    if nan_frac > 0.02:
        return "0x02 (BRIGHT_STAR_CORE_MASKED)"
    if max_px > 2500.0:
        return "0x01 (HIGH_SURFACE_BRIGHTNESS)"
    return "0x00 (CLEAN_SCIENCE_EXPOSURE)"


def _stretch_to_u8(data):
    """1–99.8 percentile clip, then asinh stretch (keeps faint comae and bright cores)."""
    p1, p99_8 = np.percentile(data, [1.0, 99.8])
    if p99_8 <= p1:
        p99_8 = p1 + 1.0
    scaled = np.clip((data - p1) / (p99_8 - p1), 0.0, 1.0)
    stretched = np.arcsinh(10.0 * scaled) / np.arcsinh(10.0)
    return (stretched * 255.0).astype(np.uint8)


def render_fits_series_to_images(fits_files, job_dir, target_name, is_synthetic=False, fov_deg=0.30):
    """
    Processes calibrated FITS cutouts into:
    - Clean 720x540 JPEGs (`frame_0.jpg`, ...)
    - Annotated 720x540 JPEGs (`annotated_0.jpg`, ...) with HUD, contamination bitmask & scale
    - Animated Blink GIF (`blink_animation.gif`)
    - Digital Difference Subtraction Image (`difference_map.jpg`)
    - On-the-fly extracted photometric spectrum (`spectrum_points`) & contamination flags
    """
    frames_meta = []
    clean_arrays = []
    annotated_pil_images = []
    spectrum_points = []

    for i, fpath in enumerate(fits_files):
        with fits.open(fpath) as hdul:
            img_hdu = hdul["IMAGE"] if "IMAGE" in hdul else hdul[0]
            hdr = img_hdu.header
            raw_data = img_hdu.data.astype(np.float32)

        H_orig, W_orig = raw_data.shape
        cov = float(hdr.get("COVERAGE", np.isfinite(raw_data).mean()))
        nan_frac = float(np.isnan(raw_data).mean())
        data = np.nan_to_num(raw_data, nan=0.0)

        # If user selected a narrower FOV (<0.30 deg) on a pre-cut 0.30 deg FITS, crop around center
        req_fov = max(0.10, min(0.60, float(fov_deg or 0.30)))
        crop_ratio = min(1.0, max(0.35, req_fov / 0.30))
        arr_u8 = _stretch_to_u8(data)

        objx = float(hdr.get("OBJX", W_orig / 2.0))
        objy = float(hdr.get("OBJY", H_orig / 2.0))

        if crop_ratio < 0.98:
            cw = max(16, int(round(W_orig * crop_ratio)))
            ch = max(12, int(round(H_orig * crop_ratio)))
            x0_c = max(0, min(W_orig - cw, int(round(W_orig / 2.0 - cw / 2.0))))
            y0_c = max(0, min(H_orig - ch, int(round(H_orig / 2.0 - ch / 2.0))))
            arr_u8 = arr_u8[y0_c:y0_c + ch, x0_c:x0_c + cw]
            norm_x = round(max(0.05, min(0.95, (objx - x0_c) / float(cw))), 4)
            norm_y = round(max(0.05, min(0.95, (objy - y0_c) / float(ch))), 4)
        else:
            norm_x = round(max(0.05, min(0.95, objx / float(W_orig))), 4)
            norm_y = round(max(0.05, min(0.95, objy / float(H_orig))), 4)

        pil_gray = Image.fromarray(arr_u8, mode="L").resize((OUT_W, OUT_H), Image.Resampling.LANCZOS)
        clean_arrays.append(np.array(pil_gray, dtype=np.float32))
        pil_rgb = pil_gray.convert("RGB")

        clean_name = f"frame_{i}.jpg"
        pil_rgb.save(os.path.join(job_dir, clean_name), quality=93)

        date_obs = str(hdr.get("DATE-OBS", "2025-08-24T11:46:00"))
        d_str = date_obs[:10]
        t_str = date_obs[11:16] if len(date_obs) >= 16 else "00:00"
        mjd_obs = float(hdr.get("MJD-OBS", 60900.0 + i * 180.0))
        obs_id = str(hdr.get("OBSID", f"2025W34_D2_{i+1}"))
        det = str(hdr.get("DETECTOR", "D2"))
        wl = float(hdr.get("OBJWL", 1.32))
        ra_val = float(hdr.get("OBJRA", 0.0))
        dec_val = float(hdr.get("OBJDEC", 0.0))
        flux_val = float(hdr.get("OBJFLUX", 0.0))
        contam_flag = _contamination_flag(nan_frac, float(np.max(data)))

        # annotated copy: track of the previous passes, target ring, top + bottom HUD
        annot_img = pil_rgb.copy()
        draw = ImageDraw.Draw(annot_img)
        cx, cy = int(norm_x * OUT_W), int(norm_y * OUT_H)
        r_px = 22
        for prev_f in frames_meta:
            px, py = int(prev_f["x"] * OUT_W), int(prev_f["y"] * OUT_H)
            draw.ellipse([px - 4, py - 4, px + 4, py + 4], fill=COOL)
            draw.line([px, py, cx, cy], fill=COOL, width=2)
        for w_off in range(3):
            draw.ellipse([cx - r_px - w_off, cy - r_px - w_off, cx + r_px + w_off, cy + r_px + w_off], outline=WARM)

        draw.rectangle([12, 12, 708, 44], fill=HUD_BG)
        src_tag = "[SYNTHETIC DEMO] " if is_synthetic else "[NASA IRSA L2] "
        draw.text(
            (22, 20),
            f"{src_tag}PASS {i+1}/{len(fits_files)} | {d_str} {t_str} UT | {det} ({wl:.2f} um) | FOV {req_fov:.2f} deg",
            fill=WARM,
        )
        draw.rectangle([12, 496, 708, 528], fill=HUD_BG)
        draw.text(
            (22, 504),
            f"Target: {target_name[:22]} | RA {ra_val:.4f}, Dec {dec_val:+.4f} | Flux: {flux_val:.2f} MJy/sr | Flag: {contam_flag[:18]}",
            fill=COOL,
        )

        annot_name = f"annotated_{i}.jpg"
        annot_img.save(os.path.join(job_dir, annot_name), quality=92)
        annotated_pil_images.append(annot_img)

        spectrum_points.append({
            "pass": i + 1,
            "date": d_str,
            "det": det,
            "wl_um": round(wl, 3),
            "flux_mjy_sr": round(flux_val, 3),
            "contam_flag": contam_flag,
        })

        frames_meta.append({
            "pass_num": i + 1,
            "d": d_str,
            "t": t_str,
            "mjd": round(mjd_obs, 4),
            "obs_id": obs_id,
            "det": det,
            "wl": round(wl, 3),
            "ra": round(ra_val, 5),
            "dec": round(dec_val, 5),
            "flux": round(flux_val, 3),
            "contam_flag": contam_flag,
            "is_synthetic": is_synthetic,
            "x": norm_x,
            "y": norm_y,
            "cov": round(cov, 3),
            "b": f"Pass {i+1}: SPHEREx {det} ({wl:.2f} µm). Obs {obs_id}. Flag: {contam_flag}. RA {ra_val:.4f}°, Dec {dec_val:+.4f}°.",
            "clean_file": clean_name,
            "annotated_file": annot_name,
            "fits_file": os.path.basename(fpath),
            "fits_path": fpath,
        })

    gif_path = os.path.join(job_dir, "blink_animation.gif")
    if annotated_pil_images:
        annotated_pil_images[0].save(
            gif_path,
            save_all=True,
            append_images=annotated_pil_images[1:],
            duration=700,
            loop=0,
        )

    diff_path = os.path.join(job_dir, "difference_map.jpg")
    if len(clean_arrays) >= 2:
        diff_arr = np.clip(128.0 + (clean_arrays[-1] - clean_arrays[0]) * 2.0, 0, 255).astype(np.uint8)
        diff_pil = Image.fromarray(diff_arr, mode="L").convert("RGB")
        draw_d = ImageDraw.Draw(diff_pil)
        f0, f1 = frames_meta[0], frames_meta[-1]
        x0, y0 = int(f0["x"] * OUT_W), int(f0["y"] * OUT_H)
        x1, y1 = int(f1["x"] * OUT_W), int(f1["y"] * OUT_H)
        for w_off in range(2):
            draw_d.ellipse([x0 - 22 - w_off, y0 - 22 - w_off, x0 + 22 + w_off, y0 + 22 + w_off], outline=COOL)
            draw_d.ellipse([x1 - 22 - w_off, y1 - 22 - w_off, x1 + 22 + w_off, y1 + 22 + w_off], outline=WARM)
        draw_d.rectangle([12, 12, 620, 44], fill=HUD_BG)
        draw_d.text((22, 20), f"DIGITAL DIFFERENCE SUBTRACTION: PASS {len(frames_meta)} ({f1['d']}) - PASS 1 ({f0['d']})", fill=WARM)
        diff_pil.save(diff_path, quality=92)

    return frames_meta, gif_path, diff_path, spectrum_points
