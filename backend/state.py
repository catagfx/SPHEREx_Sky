"""In-memory state: cutout jobs and the per-IP rate limiter (nothing is persisted except job results)."""

import collections
import datetime
import threading
import time

JOBS = {}
JOBS_LOCK = threading.Lock()
RATE_LIMIT_LOG = collections.defaultdict(list)
RATE_LIMIT_LOCK = threading.Lock()


def utc_now_iso():
    return datetime.datetime.utcnow().isoformat() + "Z"


def check_rate_limit(client_ip, max_per_min=20):
    now = time.time()
    with RATE_LIMIT_LOCK:
        history = [t for t in RATE_LIMIT_LOG[client_ip] if now - t < 60.0]
        if len(history) >= max_per_min:
            RATE_LIMIT_LOG[client_ip] = history
            return False
        history.append(now)
        RATE_LIMIT_LOG[client_ip] = history
        return True


def update_job(job_id, **kwargs):
    with JOBS_LOCK:
        if job_id in JOBS:
            JOBS[job_id].update(kwargs)
            JOBS[job_id]["updated_at"] = utc_now_iso()
            if "log" in kwargs:
                JOBS[job_id].setdefault("logs", []).append(
                    f"[{datetime.datetime.utcnow().strftime('%H:%M:%S')}] {kwargs['log']}"
                )
