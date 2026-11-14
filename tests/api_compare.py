"""Compare the API of two running backends (e.g. before / after a backend change): every endpoint, plus a full
cutout job on a bundled benchmark (no network needed) including the images it renders.

    python tests/api_compare.py http://localhost:8080 http://localhost:8091
"""
import hashlib
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JOB = {"ra": "269.4521", "dec": "4.6934", "target_name": "Barnard's Star", "detector": "D2", "fov": 0.30, "email": "", "allow_synthetic": False}
FILES = ["frame_0.jpg", "frame_1.jpg", "frame_2.jpg", "annotated_0.jpg", "annotated_2.jpg", "blink_animation.gif", "difference_map.jpg", "email_preview.html"]


def call(base, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, headers={"Content-Type": "application/json"}, method="GET" if body is None else "POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def normalized(value, job_id=None):
    s = json.dumps(value, ensure_ascii=False)
    if job_id:
        s = s.replace(job_id, "JOBID")
    s = re.sub(r'"(created_at|updated_at|synced_at)": "[^"]*"', r'"\1": "T"', s)
    return re.sub(r"\[\d\d:\d\d:\d\d\] ", "[t] ", s)


def run_job(base):
    _, start = call(base, "/api/irsa-cutout", JOB)
    job_id = start["job_id"]
    for _ in range(240):
        _, status = call(base, f"/api/irsa-status/{job_id}")
        if status.get("status") in ("completed", "done", "error", "no_coverage"):
            return job_id, status
        time.sleep(0.5)
    return job_id, status


def main(old, new):
    diffs = []

    def same(name, a, b):
        if a == b:
            print("OK  ", name)
            return
        i = next((k for k in range(min(len(a), len(b))) if a[k] != b[k]), min(len(a), len(b)))
        diffs.append(name)
        print("DIFF", name, "\n   old:", a[max(0, i - 80):i + 120], "\n   new:", b[max(0, i - 80):i + 120])

    for path, body in [("/api/fits-telemetry", None), ("/api/sync-data-archive", {}), ("/api/smtp-config", None),
                       ("/api/irsa-status/does-not-exist", None), ("/api/nope", {}), ("/api/smtp-config", {})]:
        so, jo = call(old, path, body)
        sn, jn = call(new, path, body)
        same(f"{'POST' if body is not None else 'GET '} {path}", f"{so} {normalized(jo)}", f"{sn} {normalized(jn)}")

    (jid_old, st_old), (jid_new, st_new) = run_job(old), run_job(new)
    print(f"jobs: {jid_old} {st_old.get('status')} / {jid_new} {st_new.get('status')}")
    same("cutout job result", normalized(st_old, jid_old), normalized(st_new, jid_new))
    out = os.path.join(ROOT, "assets", "custom_cutouts")
    for name in FILES:
        fo, fn = os.path.join(out, jid_old, name), os.path.join(out, jid_new, name)
        if not (os.path.exists(fo) and os.path.exists(fn)):
            diffs.append(name)
            print("MISS", name)
            continue
        bo, bn = open(fo, "rb").read(), open(fn, "rb").read()
        if name.endswith(".html"):
            bo, bn = bo.replace(jid_old.encode(), b"JOBID"), bn.replace(jid_new.encode(), b"JOBID")
        same(f"file {name}", hashlib.sha1(bo).hexdigest(), hashlib.sha1(bn).hexdigest())
    for jid in (jid_old, jid_new):  # the test jobs' output is not kept
        shutil.rmtree(os.path.join(out, jid), ignore_errors=True)

    print(f"\napi compare: {len(diffs)} difference(s) {diffs if diffs else ''}")
    return 1 if diffs else 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1].rstrip("/"), sys.argv[2].rstrip("/")))
