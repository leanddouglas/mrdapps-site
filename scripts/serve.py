#!/usr/bin/env python3
"""mrdapps.com landing-page server.

Serves ./public on 127.0.0.1:8090. Adds one extra route per registered app:

    GET /healthz/<slug>  ->  proxies the app's local /health endpoint
                             on this Mac and returns JSON with `ok` and
                             `latency_ms` fields.

The proxy exists because the landing page runs at https://mrdapps.com/
and the per-app health endpoints (e.g. https://transcript.mrdapps.com/health)
don't return CORS headers, so a browser fetch is blocked. Calling them
locally over loopback sidesteps that — the request never leaves the Mac.
"""

from __future__ import annotations

import json
import os
import socketserver
import sys
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler

PORT = 8090
HOST = "127.0.0.1"
HERE = os.path.dirname(os.path.abspath(__file__))


def _find_public(start: str) -> str:
    # Works from both layouts:
    #   - Repo:    <repo>/scripts/serve.py  ->  <repo>/public
    #   - Runtime: <root>/serve.py          ->  <root>/public
    for candidate in (os.path.join(start, "public"), os.path.join(start, "..", "public")):
        candidate = os.path.normpath(candidate)
        if os.path.isdir(candidate):
            return candidate
    return os.path.normpath(os.path.join(start, "public"))


PUBLIC = _find_public(HERE)

# slug -> local /health URL on this Mac (loopback only).
APPS: dict[str, str] = {
    "transcript": "http://127.0.0.1:8765/health",
}

PROXY_TIMEOUT_S = 2.5


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC, **kwargs)

    def do_GET(self):  # noqa: N802 — stdlib signature
        if self.path == "/healthz" or self.path.startswith("/healthz/"):
            slug = self.path[len("/healthz/") :].split("?", 1)[0].strip("/") if self.path != "/healthz" else ""
            self._proxy_health(slug)
            return
        super().do_GET()

    def _proxy_health(self, slug: str) -> None:
        url = APPS.get(slug)
        if not url:
            self._send_json(404, {"ok": False, "error": "unknown app"})
            return

        started = time.monotonic()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "mrdapps-healthz/1.0"})
            with urllib.request.urlopen(req, timeout=PROXY_TIMEOUT_S) as resp:
                raw = resp.read()
                upstream_status = resp.status
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            elapsed_ms = int((time.monotonic() - started) * 1000)
            self._send_json(502, {"ok": False, "error": str(e), "latency_ms": elapsed_ms})
            return

        elapsed_ms = int((time.monotonic() - started) * 1000)

        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send_json(502, {"ok": False, "error": "non-json upstream", "latency_ms": elapsed_ms})
            return

        if not isinstance(data, dict):
            self._send_json(502, {"ok": False, "error": "unexpected upstream shape", "latency_ms": elapsed_ms})
            return

        data["ok"] = bool(data.get("ok", upstream_status == 200))
        data["latency_ms"] = elapsed_ms
        self._send_json(200, data)

    def _send_json(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt: str, *args) -> None:  # quieter logs
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> None:
    if not os.path.isdir(PUBLIC):
        sys.stderr.write(f"public/ not found at {PUBLIC}\n")
        sys.exit(1)
    with Server((HOST, PORT), Handler) as httpd:
        sys.stderr.write(f"mrdapps-site listening on http://{HOST}:{PORT} (serving {PUBLIC})\n")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
