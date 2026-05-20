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

# slug -> probe config. Two modes:
#   json_health  -> upstream returns JSON with `ok: bool`; we forward it.
#   status_ok    -> any 2xx/3xx counts as ok=true; upstream body is ignored.
# A bare string is treated as json_health for backward compatibility.
APPS: dict[str, object] = {
    "transcript":     {"url": "http://127.0.0.1:8765/health",     "mode": "json_health"},
    "geo":            {"url": "http://100.121.62.15:8766/health", "mode": "json_health"},
    "books":          {"url": "http://127.0.0.1:8801/",           "mode": "status_ok"},
    "tracker":        {"url": "http://127.0.0.1:8800/",           "mode": "status_ok"},
    "ops":            {"url": "http://127.0.0.1:8802/",           "mode": "status_ok"},
    "training":       {"url": "http://127.0.0.1:8804/",           "mode": "status_ok"},
    "servusbotassistant": {"url": "http://127.0.0.1:8767/api/health", "mode": "json_health"},
    "sorriso":        {"url": "http://127.0.0.1:8805/",           "mode": "status_ok"},
    "sorriso-themes": {"url": "http://127.0.0.1:8806/",           "mode": "status_ok"},
    "cars":           {"url": "http://127.0.0.1:8807/health",     "mode": "status_ok"},
    "scrape":         {"url": "http://127.0.0.1:8808/api/stats",  "mode": "status_ok"},
    "simmind":        {"url": "http://127.0.0.1:8809/docs",       "mode": "status_ok"},
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
        entry = APPS.get(slug)
        if not entry:
            self._send_json(404, {"ok": False, "error": "unknown app"})
            return

        if isinstance(entry, str):
            url, mode = entry, "json_health"
        else:
            url = entry["url"]
            mode = entry.get("mode", "json_health")

        started = time.monotonic()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "mrdapps-healthz/1.0"})
            with urllib.request.urlopen(req, timeout=PROXY_TIMEOUT_S) as resp:
                raw = resp.read()
                upstream_status = resp.status
        except urllib.error.HTTPError as e:
            elapsed_ms = int((time.monotonic() - started) * 1000)
            if mode == "status_ok" and 200 <= e.code < 400:
                self._send_json(200, {"ok": True, "status": e.code, "latency_ms": elapsed_ms})
            else:
                self._send_json(200, {"ok": False, "status": e.code, "latency_ms": elapsed_ms})
            return
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            elapsed_ms = int((time.monotonic() - started) * 1000)
            self._send_json(502, {"ok": False, "error": str(e), "latency_ms": elapsed_ms})
            return

        elapsed_ms = int((time.monotonic() - started) * 1000)

        if mode == "status_ok":
            ok = 200 <= upstream_status < 400
            self._send_json(200, {"ok": ok, "status": upstream_status, "latency_ms": elapsed_ms})
            return

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
