#!/usr/bin/env python3
"""
SPHEREx Sky — web server & NASA IRSA IPAC on-demand cutout engine.

Serves the SPHEREx Sky web application and its REST API (backend/): IRSA Level 2 multi-epoch cutouts via
scripts/find_and_cut_movers.py, FITS telemetry (spectra, contamination flags), and optional email reports.

    python server.py [port]        (default 8080, or $PORT; host $HOST, default 0.0.0.0)
"""

import os
import sys

from backend.http_server import serve

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", "8080"))
    serve(port, host=os.environ.get("HOST", "0.0.0.0"))
