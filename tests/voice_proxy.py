"""HTTP regression tests for the Python voice proxy and static credential protection."""
import http.client
import http.server
import json
import os
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import backend.http_server as web


class Upstream(http.server.BaseHTTPRequestHandler):
    received = []

    def log_message(self, *args):
        pass

    def respond(self):
        size = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(size)
        self.received.append((self.command, self.path, dict(self.headers), body))
        status = 503 if self.path.endswith("/unavailable") else 201 if self.command == "POST" else 200
        raw = json.dumps({"ok": True, "path": self.path}).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Retry-After", "30")
        self.end_headers()
        self.wfile.write(raw)

    do_GET = respond
    do_POST = respond

    def do_OPTIONS(self):
        self.received.append((self.command, self.path, dict(self.headers), b""))
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "https://sky.example.com")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()


class QuietHandler(web.SPHERExRequestHandler):
    def log_message(self, *args):
        pass


class VoiceProxyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.upstream = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
        cls.site = web.ThreadedHTTPServer(("127.0.0.1", 0), QuietHandler)
        for server in (cls.upstream, cls.site):
            threading.Thread(target=server.serve_forever, daemon=True).start()
        cls.environment = patch.dict(os.environ, {"VOICE_TARGET": "http://127.0.0.1:" + str(cls.upstream.server_port)})
        cls.environment.start()
        cls.directory = tempfile.TemporaryDirectory()
        cls.root = patch.object(web, "ROOT_DIR", cls.directory.name)
        cls.root.start()
        Path(cls.directory.name, ".env").write_text("PRIVATE=should-never-leak")
        Path(cls.directory.name, "index.html").write_text("Public page")

    @classmethod
    def tearDownClass(cls):
        cls.root.stop()
        cls.environment.stop()
        for server in (cls.site, cls.upstream):
            server.shutdown()
            server.server_close()
        cls.directory.cleanup()

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.site.server_port, timeout=5)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_get_and_post_are_forwarded_with_status_body_and_headers(self):
        status, headers, body = self.request("GET", "/api/rooms/health")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["path"], "/api/rooms/health")
        self.assertEqual(headers["Cache-Control"], "no-store")
        status, headers, _ = self.request("POST", "/api/rooms", '{"name":"Orion"}', {
            "Content-Type": "application/json", "Origin": "https://sky.example.com",
            "X-Forwarded-For": "spoofed",
        })
        self.assertEqual(status, 201)
        method, path, forwarded, body = Upstream.received[-1]
        self.assertEqual((method, path, body), ("POST", "/api/rooms", b'{"name":"Orion"}'))
        self.assertEqual(forwarded["Origin"], "https://sky.example.com")
        self.assertEqual(forwarded["X-Forwarded-For"], "127.0.0.1")
        self.assertEqual(headers["Retry-After"], "30")
        self.assertEqual(self.request("GET", "/api/rooms/unavailable")[0], 503)

    def test_options_reaches_voice_origin_policy(self):
        status, headers, body = self.request("OPTIONS", "/api/rooms", headers={
            "Origin": "https://sky.example.com", "Access-Control-Request-Headers": "content-type",
        })
        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "https://sky.example.com")
        self.assertEqual(body, b"")
        self.assertEqual(Upstream.received[-1][2]["Access-Control-Request-Headers"], "content-type")

    def test_large_and_chunked_requests_are_rejected(self):
        self.assertEqual(self.request("POST", "/api/rooms", "x" * 4097)[0], 400)
        self.assertEqual(self.request("POST", "/api/rooms", headers={"Transfer-Encoding": "chunked"})[0], 400)

    def test_unavailable_node_returns_a_useful_json_error(self):
        with patch.dict(os.environ, {"VOICE_TARGET": "invalid://localhost"}):
            status, _, body = self.request("GET", "/api/rooms/health")
        self.assertEqual(status, 502)
        self.assertIn("voice server", json.loads(body)["error"])

    def test_static_site_cannot_expose_credentials_or_server_packages(self):
        for path in ("/.env", "/%2eenv", "/voice-server/.env", "/.git/config", "/node_modules/package.json"):
            self.assertEqual(self.request("GET", path)[0], 404, path)
            self.assertEqual(self.request("HEAD", path)[0], 404, path)
        self.assertEqual(self.request("GET", "/index.html")[0], 200)


if __name__ == "__main__":
    unittest.main()

