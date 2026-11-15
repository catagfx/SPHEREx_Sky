"""Forward voice API requests from the built site to the separate Node server."""
import http.client
import os
import urllib.parse


def is_voice_path(path):
    return path == "/api/rooms" or path.startswith("/api/rooms/")


def proxy_voice(handler):
    connection = None
    try:
        target = urllib.parse.urlparse(os.environ.get("VOICE_TARGET", "http://127.0.0.1:8787"))
        if target.scheme not in ("http", "https") or not target.hostname:
            raise ValueError("Invalid VOICE_TARGET")
        size = int(handler.headers.get("Content-Length", "0"))
        if size < 0 or size > 4096 or handler.headers.get("Transfer-Encoding"):
            return handler.send_json({"error": "Invalid voice request size."}, status=400)
        body = handler.rfile.read(size) if size else None
        headers = {"Content-Type": handler.headers.get("Content-Type", "application/json"),
                   "X-Forwarded-For": handler.client_address[0]}
        if handler.headers.get("Origin"):
            headers["Origin"] = handler.headers["Origin"]
        for key in ("Access-Control-Request-Method", "Access-Control-Request-Headers"):
            if handler.headers.get(key):
                headers[key] = handler.headers[key]
        transport = http.client.HTTPSConnection if target.scheme == "https" else http.client.HTTPConnection
        connection = transport(target.hostname, target.port, timeout=15)
        connection.request(handler.command, handler.path, body=body, headers=headers)
        response = connection.getresponse()
        raw = response.read(65537)
        if len(raw) > 65536:
            raise ValueError("Voice response too large")
        handler.send_response(response.status)
        for key, value in response.getheaders():
            if (key.lower() in ("content-type", "cache-control", "x-content-type-options", "retry-after")
                    or key.lower().startswith(("access-control-", "ratelimit"))):
                handler.send_header(key, value)
        handler.send_header("Content-Length", str(len(raw)))
        handler.end_headers()
        handler.wfile.write(raw)
    except (OSError, ValueError, http.client.HTTPException):
        handler.send_json({"error": "Cannot reach the voice server. Start it with npm run voice."}, status=502)
    finally:
        if connection:
            connection.close()
