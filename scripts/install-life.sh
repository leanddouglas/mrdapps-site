#!/usr/bin/env bash
# Install / refresh the life-mrdapps LaunchAgent on hermes-hub.
#
# Lives at ~/Library/Application Support/life-mrdapps/ — same TCC-safe pattern
# as mrdapps-site and Transcript-Master.
#
# After this script succeeds you still need TWO things on the Cloudflare side
# to make `life.mrdapps.com` actually resolve:
#
#   1. DNS record:
#        cloudflared tunnel route dns <your-tunnel-name> life.mrdapps.com
#      (or add a proxied CNAME `life` -> `<tunnel-id>.cfargotunnel.com` in
#      the Cloudflare dashboard).
#
#   2. cloudflared ingress (~/.cloudflared/config.yml on this Mac):
#        ingress:
#          # ... existing rules ...
#          - hostname: life.mrdapps.com
#            service: http://127.0.0.1:8810
#          - service: http_status:404
#      Then:
#        sudo launchctl kickstart -k system/com.cloudflare.cloudflared
#
# Re-run install-life.sh any time you edit public/life/, life-serve.py, or
# the plist — it's idempotent.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME="$HOME/Library/Application Support/life-mrdapps"
AGENT_SRC="$REPO/server/com.servusgroup.life-mrdapps.plist"
AGENT_DST="$HOME/Library/LaunchAgents/com.servusgroup.life-mrdapps.plist"
LABEL="com.servusgroup.life-mrdapps"

echo "→ syncing runtime files to: $RUNTIME"
mkdir -p "$RUNTIME"
/usr/bin/rsync -a --delete "$REPO/public/life/" "$RUNTIME/public/"
/usr/bin/rsync -a "$REPO/scripts/life-serve.py" "$RUNTIME/life-serve.py"

echo "→ installing LaunchAgent"
mkdir -p "$HOME/Library/LaunchAgents"
/bin/cp -f "$AGENT_SRC" "$AGENT_DST"

echo "→ reloading LaunchAgent"
launchctl unload "$AGENT_DST" 2>/dev/null || true
launchctl load   "$AGENT_DST"

sleep 1
if launchctl list | grep -q "$LABEL"; then
  echo "→ loaded:"
  launchctl list | awk -v l="$LABEL" '$3 == l { print "  pid="$1" status="$2" label="$3 }'
else
  echo "× LaunchAgent did not load — check ~/Library/Logs/life-mrdapps.log"
  exit 1
fi

echo "→ smoke test"
sleep 1
if curl -sf http://127.0.0.1:8810/ -o /dev/null; then
  echo "  http://127.0.0.1:8810/             OK"
else
  echo "  http://127.0.0.1:8810/             FAIL"
  tail -n 20 "$HOME/Library/Logs/life-mrdapps.log" || true
  exit 1
fi
echo "  http://127.0.0.1:8810/manifest.webmanifest →"
curl -s http://127.0.0.1:8810/manifest.webmanifest | head -c 200 | sed 's/^/    /'
echo ""
echo ""
echo "Next: add the Cloudflare DNS + cloudflared ingress (see header of this script)."
echo "done."
