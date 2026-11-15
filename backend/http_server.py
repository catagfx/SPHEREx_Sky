"""HTTP server: the static site (project root) + the JSON API used by the viewer.

  GET  /api/fits-telemetry        FITS archive telemetry (explorer overlays, SED)
  GET  /api/smtp-config           SMTP status (never the password)
  GET  /api/irsa-status/<job_id>  progress / result of a cutout job
  GET  /api/irsa-jobs             the last 10 jobs
  GET  /api/scientific-resources  CSA / NEOSSat partner resources, validated (scientific_resources.json)
  GET  /api/constellations        the constellation catalog with galactic coordinates
  GET  /api/vr-config             WebXR session defaults + landmarks
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
from .voice import is_voice_path, proxy_voice
try:
    from .constellations import get_constellations_payload
except ImportError:
    get_constellations_payload = None
try:
    from .vr import get_vr_config_payload
except ImportError:
    get_vr_config_payload = None
try:
    from .scientific_resources import load_scientific_resources
except ImportError:
    load_scientific_resources = None

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

    def send_head(self):
        # Static hosting must never expose .env credentials, Git data or installed server packages.
        parts = urllib.parse.unquote(urllib.parse.urlparse(self.path).path).replace("\\", "/").split("/")
        if (any(part.startswith(".") and part not in (".", "..") for part in parts)
                or any(part.lower() in ("voice-server", "node_modules") for part in parts)):
            self.send_error(404)
            return None
        return super().send_head()

    def send_json(self, data, status=200):
        raw = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        if is_voice_path(urllib.parse.urlparse(self.path).path):
            return proxy_voice(self)
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    # ---- GET ----

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path

        if is_voice_path(path):
            return proxy_voice(self)

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

        if path == "/api/constellations" and get_constellations_payload is not None:
            return self.send_json(get_constellations_payload())

        if path == "/api/vr-config" and get_vr_config_payload is not None:
            return self.send_json(get_vr_config_payload())

        if path == "/api/scientific-resources" and load_scientific_resources is not None:
            # read on every request: an edited scientific_resources.json shows without a rebuild or restart
            try:
                return self.send_json(load_scientific_resources())
            except Exception as exc:  # a broken JSON file must not crash the request: the page falls back
                return self.send_json({"ok": False, "count": 0, "validCount": 0, "resources": [],
                                       "errors": [f"scientific_resources.json could not be read: {exc}"]}, status=500)

        if path == "/api/fits-telemetry":
            telemetry = extract_fits_archive_telemetry()
            return self.send_json({
                "ok": True,
                "archive_dir": "data/movers_cutouts",
                "targets_count": len(telemetry),
                "telemetry": telemetry,
            })

        if path == "/rootCA.crt":
            ca_path = os.path.join(ROOT_DIR, ".certs", "rootCA.crt")
            if os.path.exists(ca_path):
                with open(ca_path, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/x-x509-ca-cert")
                self.send_header("Content-Disposition", 'attachment; filename="spherex-rootCA.crt"')
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return

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
        if is_voice_path(urllib.parse.urlparse(self.path).path):
            return proxy_voice(self)
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


def serve(port, host="0.0.0.0", cert_file=None, key_file=None):
    server = ThreadedHTTPServer((host, port), SPHERExRequestHandler)
    proto = "http"
    if not cert_file:
        cert_file = os.environ.get("SPX_CERT_FILE")
    if not key_file:
        key_file = os.environ.get("SPX_KEY_FILE")

    if (not cert_file or not key_file) and os.environ.get("SPX_HTTPS") == "1":
        candidate_cert = os.path.join(ROOT_DIR, ".certs", "dev-cert.pem")
        candidate_key = os.path.join(ROOT_DIR, ".certs", "dev-key.pem")
        if os.path.exists(candidate_cert) and os.path.exists(candidate_key):
            cert_file = candidate_cert
            key_file = candidate_key

    if cert_file and key_file and os.path.exists(cert_file) and os.path.exists(key_file):
        import ssl
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile=cert_file, keyfile=key_file)
        server.socket = context.wrap_socket(server.socket, server_side=True)
        proto = "https"

    print(f"SPHEREx Sky Unified Server + IRSA Cutout API listening on {proto}://localhost:{port}/")
    server.serve_forever()
