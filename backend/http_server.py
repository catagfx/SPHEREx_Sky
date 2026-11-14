"""HTTP server: the static site (project root) + the JSON API used by the viewer.

  GET  /api/fits-telemetry        FITS archive telemetry (explorer overlays, SED)
  GET  /api/smtp-config           SMTP status (never the password)
  GET  /api/irsa-status/<job_id>  progress / result of a cutout job
  GET  /api/irsa-jobs             the last 10 jobs
  POST /api/irsa-cutout           start a cutout job
  POST /api/smtp-config           session SMTP credentials (localhost only, memory only)
  POST /api/sync-data-archive     re-index data/movers_cutouts
"""

import datetime
import http.server
import json
import os
import re
import socketserver
import threading
import urllib.parse
import uuid

from .config import CUSTOM_OUT_DIR, ROOT_DIR
from .jobs import execute_irsa_cutout_job
from .mailer import load_smtp_config, save_smtp_config_in_memory
from .state import JOBS, JOBS_LOCK, check_rate_limit, utc_now_iso
from .telemetry import extract_fits_archive_telemetry

LOCALHOST = ("127.0.0.1", "::1", "localhost")


def _smtp_status(cfg):
    return {
        "host": cfg.get("host", ""),
        "port": cfg.get("port", 587),
        "user": cfg.get("user", ""),
        "has_password": bool(cfg.get("pass")),
        "configured": bool(cfg.get("host") and cfg.get("user") and cfg.get("pass")),
    }


class SPHERExRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def send_json(self, data, status=200):
        raw = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    # ---- GET ----

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path

        if path.startswith("/api/irsa-status/"):
            return self._job_status(path.split("/api/irsa-status/")[-1].strip("/"))

        if path == "/api/smtp-config":
            cfg = load_smtp_config()
            status = _smtp_status(cfg)
            return self.send_json({
                "host": status["host"],
                "port": status["port"],
                "user": status["user"],
                "from_email": cfg.get("from_email", ""),
                "has_password": status["has_password"],
                "configured": status["configured"],
            })

        if path == "/api/irsa-jobs":
            with JOBS_LOCK:
                recent = list(JOBS.values())[-10:]
            return self.send_json({"jobs": recent})

        if path == "/api/fits-telemetry":
            telemetry = extract_fits_archive_telemetry()
            return self.send_json({
                "ok": True,
                "archive_dir": "data/movers_cutouts",
                "targets_count": len(telemetry),
                "telemetry": telemetry,
            })

        return super().do_GET()

    def _job_status(self, raw_id):
        job_id = re.sub(r"[^a-zA-Z0-9_-]", "", raw_id)
        with JOBS_LOCK:
            job = JOBS.get(job_id)
        if not job:  # finished in an earlier server run
            disk_json = os.path.join(CUSTOM_OUT_DIR, job_id, "job_result.json")
            if os.path.exists(disk_json):
                with open(disk_json, "r", encoding="utf-8") as f:
                    job = json.load(f)
        if not job:
            return self.send_json({"error": "Job not found"}, status=404)
        return self.send_json(job)

    # ---- POST ----

    def do_POST(self):
        client_ip = self.client_address[0] if self.client_address else "unknown"
        if not check_rate_limit(client_ip, max_per_min=20):
            return self.send_json({"error": "Rate limit exceeded. Please wait a moment."}, status=429)

        path = urllib.parse.urlparse(self.path).path
        length = int(self.headers.get("Content-Length") or 0)
        body_raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(body_raw.decode("utf-8"))
        except Exception:
            return self.send_json({"error": "Invalid JSON body"}, status=400)

        if path == "/api/smtp-config":
            # Security: only localhost may set runtime in-memory SMTP credentials (never written to disk)
            if client_ip not in LOCALHOST:
                return self.send_json({"error": "SMTP configuration is restricted to localhost (.env)"}, status=403)
            return self.send_json({"ok": True, **_smtp_status(save_smtp_config_in_memory(payload))})

        if path == "/api/irsa-cutout":
            # Security: ignore an inline smtp override that does not come from localhost
            if client_ip not in LOCALHOST:
                payload.pop("smtp", None)
            return self.send_json(self._start_job(payload))

        if path == "/api/sync-data-archive":
            telemetry = extract_fits_archive_telemetry()
            return self.send_json({
                "ok": True,
                "synced_at": utc_now_iso(),
                "targets_synced": len(telemetry),
                "total_fits_indexed": sum(v.get("fits_count", 0) for v in telemetry.values()),
                "telemetry": telemetry,
            })

        return self.send_json({"error": "Unknown API endpoint"}, status=404)

    def _start_job(self, payload):
        job_id = "spx_" + uuid.uuid4().hex[:8]
        now = utc_now_iso()
        with JOBS_LOCK:
            JOBS[job_id] = {
                "job_id": job_id,
                "status": "queued",
                "stage": "queued",
                "progress": 5,
                "created_at": now,
                "updated_at": now,
                "params": {k: v for k, v in payload.items() if k != "smtp"},
                "logs": [f"[{datetime.datetime.utcnow().strftime('%H:%M:%S')}] Job {job_id} queued for NASA IRSA IPAC processing."],
            }
        threading.Thread(target=execute_irsa_cutout_job, args=(job_id, payload), daemon=True).start()
        return {"ok": True, "job_id": job_id, "status": "queued"}


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def serve(port, host="0.0.0.0"):
    server = ThreadedHTTPServer((host, port), SPHERExRequestHandler)
    print(f"SPHEREx Sky Unified Server + IRSA Cutout API listening on http://localhost:{port}/")
    server.serve_forever()
