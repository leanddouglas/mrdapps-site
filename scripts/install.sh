#!/usr/bin/env bash
# Install / refresh the mrdapps-site LaunchAgent on hermes-hub.
#
# We don't run the site directly from ~/Documents/ because macOS TCC blocks
# LaunchAgents from accessing files there without an explicit grant.
# Instead, the running copy lives in ~/Library/Application Support/, which
# is the same pattern Transcript-Master uses.
#
# Re-run any time you edit public/, serve.py, or the plist — it's idempotent.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME="$HOME/Library/Application Support/mrdapps-site"
AGENT_SRC="$REPO/server/com.servusgroup.mrdapps-site.plist"
AGENT_DST="$HOME/Library/LaunchAgents/com.servusgroup.mrdapps-site.plist"
LABEL="com.servusgroup.mrdapps-site"

echo "→ syncing runtime files to: $RUNTIME"
mkdir -p "$RUNTIME"
/usr/bin/rsync -a --delete "$REPO/public/" "$RUNTIME/public/"
/usr/bin/rsync -a "$REPO/scripts/serve.py" "$RUNTIME/serve.py"

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
  echo "× LaunchAgent did not load — check ~/Library/Logs/mrdapps-site.log"
  exit 1
fi

echo "→ smoke test"
sleep 1
if curl -sf http://127.0.0.1:8090/ -o /dev/null; then
  echo "  http://127.0.0.1:8090/         OK"
else
  echo "  http://127.0.0.1:8090/         FAIL"
  tail -n 20 "$HOME/Library/Logs/mrdapps-site.log" || true
  exit 1
fi
echo "  /healthz/transcript →"
curl -s http://127.0.0.1:8090/healthz/transcript | sed 's/^/    /'
echo ""
echo "done."
