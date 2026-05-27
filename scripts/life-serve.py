#!/usr/bin/env python3
"""life.mrdapps.com server.

Serves the Life Counter PWA at the root of port 8810 (so cloudflared can
ingress `life.mrdapps.com` -> `http://127.0.0.1:8810` without any path
rewriting).

Pure static, no upstream health-proxy magic — Life has no backend.

Layout matches the mrdapps-site convention so install-life.sh can rsync
the public/life tree to ~/Library/Application Support/life-mrdapps/public.
"""

from __future__ import annotations

import os
import socketserver
import sys
from http.server import SimpleHTTPRequestHandler

PORT = 8810
HOST = "127.0.0.1"
HERE = os.path.dirname(os.path.abspath(__file__))


def _find_public(start: str) -> str:
    # Repo layout:    <repo>/scripts/life-serve.py -> <repo>/public/life
    # Runtime layout: <root>/life-serve.py         -> <root>/public
    for candidate in (
        os.path.join(start, "..", "public", "life"),
        os.path.join(start, "public"),
    ):
        candidate = os.path.normpath(candidate)
        if os.path.isdir(candidate):
            return candidate
    return os.path.normpath(os.path.join(start, "public"))


PUBLIC = _find_public(HERE)


class Handler(SimpleHTTPRequestHandler):
    # Loose security defaults a static PWA wants.
    extra_headers = (
        ("X-Content-Type-Options", "nosniff"),
        ("Referrer-Policy", "no-referrer"),
        ("X-Frame-Options", "DENY"),
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC, **kwargs)

    def end_headers(self):
        for k, v in self.extra_headers:
            self.send_header(k, v)
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> None:
    if not os.path.isdir(PUBLIC):
        sys.stderr.write(f"public/ not found at {PUBLIC}\n")
        sys.exit(1)
    with Server((HOST, PORT), Handler) as httpd:
        sys.stderr.write(f"life-mrdapps listening on http://{HOST}:{PORT} (serving {PUBLIC})\n")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
