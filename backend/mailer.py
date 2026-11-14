"""Email delivery of a job's report: SMTP settings (env / process memory only, never written to disk),
the MIME package (.eml kept next to the job), authenticated SMTP, then direct MX as a fallback."""

import datetime
import os
import smtplib
import subprocess
from email.mime.application import MIMEApplication
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from .report import render_report_html, render_plain_text

# In-memory runtime SMTP config (NEVER persisted to disk to prevent credential leaks)
RUNTIME_SMTP_CONFIG = {}
SMTP_KEYS = ("host", "port", "user", "pass", "from_email")


def load_smtp_config():
    """Reads SMTP config strictly from environment variables or in-memory session state."""
    cfg = {
        "host": os.environ.get("SMTP_HOST", "smtp.gmail.com"),
        "port": int(os.environ.get("SMTP_PORT", "587") or 587),
        "user": os.environ.get("SMTP_USER", ""),
        "pass": os.environ.get("SMTP_PASS", ""),
        "from_email": os.environ.get("SMTP_FROM", ""),
    }
    for k in SMTP_KEYS:
        if RUNTIME_SMTP_CONFIG.get(k):
            cfg[k] = RUNTIME_SMTP_CONFIG[k]
    return cfg


def save_smtp_config_in_memory(new_cfg):
    """Stores SMTP config in process memory ONLY (never written to disk)."""
    for k in SMTP_KEYS:
        if k in new_cfg and new_cfg[k] is not None:
            if k == "pass" and new_cfg[k] == "••••••••":
                continue
            RUNTIME_SMTP_CONFIG[k] = new_cfg[k]
    user_val = RUNTIME_SMTP_CONFIG.get("user", "")
    if user_val and not RUNTIME_SMTP_CONFIG.get("host"):
        domain = user_val.split("@")[-1].lower()
        if "gmail.com" in domain:
            RUNTIME_SMTP_CONFIG["host"] = "smtp.gmail.com"
            RUNTIME_SMTP_CONFIG["port"] = 587
        elif "outlook.com" in domain or "hotmail.com" in domain or "live.com" in domain:
            RUNTIME_SMTP_CONFIG["host"] = "smtp-mail.outlook.com"
            RUNTIME_SMTP_CONFIG["port"] = 587
        elif "yahoo.com" in domain:
            RUNTIME_SMTP_CONFIG["host"] = "smtp.mail.yahoo.com"
            RUNTIME_SMTP_CONFIG["port"] = 587
    return load_smtp_config()


def _inline_image(path, subtype, cid, filename):
    with open(path, "rb") as f:
        img = MIMEImage(f.read(), _subtype=subtype)
    img.add_header("Content-ID", f"<{cid}>")
    img.add_header("Content-Disposition", "inline", filename=filename)
    return img


def _build_message(job_id, job_data, job_dir, frames_meta, gif_path, diff_path, sender_addr, recipient):
    is_synthetic = bool(job_data.get("is_synthetic", False))
    msg = MIMEMultipart("mixed")
    subj_prefix = "[SYNTHETIC DEMO]" if is_synthetic else "[NASA SPHEREx Sky]"
    msg["Subject"] = f"{subj_prefix} Cutout Report: {job_data['target_name']} (RA {job_data['ra']:.3f}°, Dec {job_data['dec']:+.3f}°)"
    msg["From"] = f"SPHEREx IRSA Cutout Service <{sender_addr}>"
    msg["To"] = recipient
    msg["Date"] = datetime.datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S +0000")

    related = MIMEMultipart("related")
    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(render_plain_text(job_data, frames_meta), "plain", "utf-8"))
    alt.attach(MIMEText(render_report_html(job_id, job_data, frames_meta, use_cid=True), "html", "utf-8"))
    related.attach(alt)

    if os.path.exists(gif_path):
        related.attach(_inline_image(gif_path, "gif", "blink_gif", "blink_animation.gif"))
    if os.path.exists(diff_path):
        related.attach(_inline_image(diff_path, "jpeg", "diff_map", "difference_map.jpg"))
    for i, fm in enumerate(frames_meta):
        apath = os.path.join(job_dir, fm["annotated_file"])
        if os.path.exists(apath):
            related.attach(_inline_image(apath, "jpeg", f"frame_{i}", fm["annotated_file"]))
    msg.attach(related)

    for fm in frames_meta:
        if os.path.exists(fm["fits_path"]):
            with open(fm["fits_path"], "rb") as f:
                part = MIMEApplication(f.read(), Name=fm["fits_file"])
            part["Content-Disposition"] = f'attachment; filename="{fm["fits_file"]}"'
            msg.attach(part)
    return msg


def _send_smtp(smtp_cfg, sender_addr, recipient, msg):
    """Authenticated SMTP (465 = SSL, otherwise STARTTLS). Returns (host, port, user, password used)."""
    host = smtp_cfg["host"].strip()
    port = int(smtp_cfg.get("port") or 587)
    user_login = smtp_cfg["user"].strip()
    raw_pwd = smtp_cfg["pass"].strip()
    pwd_login = raw_pwd.replace(" ", "") if "gmail" in host.lower() else raw_pwd  # Gmail app passwords are shown with spaces
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=15) as server:
            server.login(user_login, pwd_login)
            server.sendmail(sender_addr, [recipient], msg.as_string())
    else:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(user_login, pwd_login)
            server.sendmail(sender_addr, [recipient], msg.as_string())
    return host, port, user_login, pwd_login


def _send_direct_mx(domain, sender_addr, recipient, msg):
    """Direct delivery to the recipient domain's MX on port 25; returns the MX host, or None without MX records."""
    mx_out = subprocess.check_output(["dig", "+short", "MX", domain], timeout=3).decode().strip()
    mx_lines = [line.split() for line in mx_out.splitlines() if len(line.split()) >= 2]
    mx_lines.sort(key=lambda x: int(x[0]))
    if not mx_lines:
        return None
    mx_host = mx_lines[0][1].rstrip(".")
    with smtplib.SMTP(mx_host, 25, timeout=2.5) as server:
        server.ehlo("spherex-explorer.org")
        try:
            server.starttls()
            server.ehlo("spherex-explorer.org")
        except Exception:
            pass
        server.sendmail(sender_addr, [recipient], msg.as_string())
    return mx_host


def build_and_send_email(job_id, job_data, job_dir, frames_meta, gif_path, diff_path, smtp_override=None):
    """
    Writes the HTML report preview and the .eml package (cutouts, blink GIF, difference image, photometric table,
    FITS attachments) into job_dir, then delivers it if the job has a recipient. Returns the outcome for the UI.
    """
    recipient = job_data.get("email") or "explorer@spherex-sky.local"
    url_prefix = f"assets/custom_cutouts/{job_id}"
    links = {"eml_url": f"{url_prefix}/SPHEREx_IRSA_{job_id}.eml", "preview_url": f"{url_prefix}/email_preview.html"}

    with open(os.path.join(job_dir, "email_preview.html"), "w", encoding="utf-8") as f:
        f.write(render_report_html(job_id, job_data, frames_meta, use_cid=False))

    smtp_cfg = load_smtp_config()
    if smtp_override and isinstance(smtp_override, dict):
        for k, v in smtp_override.items():
            if v:
                smtp_cfg[k] = v
    sender_addr = smtp_cfg.get("from_email") or smtp_cfg.get("user") or "spherex-pipeline@irsa-explorer.org"

    msg = _build_message(job_id, job_data, job_dir, frames_meta, gif_path, diff_path, sender_addr, recipient)
    with open(os.path.join(job_dir, f"SPHEREx_IRSA_{job_id}.eml"), "wb") as f:
        f.write(msg.as_bytes())

    # If no real recipient email was requested, skip network SMTP and return local dossier links
    if not job_data.get("email"):
        return {
            "status": "local_dossier_only",
            "delivered": False,
            "message": "Cutouts processed directly on page. HTML Report and RFC-822 .eml archive are ready.",
            **links,
        }

    # 1. Authenticated SMTP delivery (credentials in env or memory only — never written to disk)
    smtp_err = None
    if smtp_cfg.get("host") and smtp_cfg.get("user") and smtp_cfg.get("pass"):
        try:
            host, port, user_login, pwd_login = _send_smtp(smtp_cfg, sender_addr, recipient, msg)
            save_smtp_config_in_memory({"host": host, "port": port, "user": user_login, "pass": pwd_login})
            return {
                "status": "sent_smtp",
                "delivered": True,
                "message": f"Email successfully delivered to {recipient} via authenticated SMTP ({host}:{port}).",
                **links,
            }
        except Exception as e:
            smtp_err = str(e)

    # 2. Direct MX delivery on port 25
    domain = recipient.split("@")[-1].strip() if "@" in recipient else ""
    mx_error = None
    if domain:
        try:
            mx_host = _send_direct_mx(domain, sender_addr, recipient, msg)
            if mx_host:
                return {
                    "status": "sent_mx",
                    "delivered": True,
                    "message": f"Email delivered directly to {recipient} via MX server ({mx_host}).",
                    **links,
                }
        except Exception as e:
            mx_error = str(e)

    reason = smtp_err or mx_error or "No SMTP relay credentials configured in .env"
    return {
        "status": "package_ready",
        "delivered": False,
        "message": (
            f"Processed email package generated for {recipient}! "
            f"(Configure SMTP_USER / SMTP_PASS in .env or session settings for remote inbox delivery, "
            f"or open the rendered Email Report / .eml file below)."
        ),
        "technical_note": reason[:220],
        **links,
    }
