#!/usr/bin/env bash
# Start the mrdapps.com landing-page server on 127.0.0.1:8090.
#
# The LaunchAgent (server/com.servusgroup.mrdapps-site.plist) invokes this.
# We run scripts/serve.py rather than `python3 -m http.server` so the page
# can probe sibling apps' /health endpoints same-origin (see serve.py for
# the rationale — short version: no CORS headers on the per-app domains).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec /usr/bin/python3 "$HERE/serve.py"
