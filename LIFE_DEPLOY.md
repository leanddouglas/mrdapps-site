# Life — Deployment Handoff for the hermes-hub agent

You are continuing work that was started in a cloud Claude Code session. That
session could not reach `hermes-hub` (no Tailscale, sandboxed network), so the
last three steps have to run **on hermes-hub itself**. That's you.

The user is `doug@servusgroup.com`. Be conservative — confirm anything
destructive before doing it.

---

## TL;DR

Deploy a new card on the mrdapps.com dashboard: **Life** — a calm, bilingual,
shareable PWA mortality counter. It runs as its **own LaunchAgent on port
8810**, served at **`life.mrdapps.com`** via the existing `cloudflared`
tunnel on hermes-hub.

Three commands away from done.

---

## What was built (already merged-ready on a branch)

- **Branch:** `claude/life-counter-pwa-91Agp`
- **Repo:** `leanddouglas/mrdapps-site`
- **Latest commit:** `6979013` — "Wire Life to life.mrdapps.com on port 8810"
- **PR:** open as draft (check `gh pr list` or the GitHub UI)

Files added/changed on that branch:

| Path | Purpose |
| --- | --- |
| `public/life/` | The PWA itself — `index.html`, `app.js`, `style.css`, `manifest.webmanifest`, `sw.js`, icons |
| `scripts/life-serve.py` | Standalone Python HTTP server, binds `127.0.0.1:8810` |
| `server/com.servusgroup.life-mrdapps.plist` | LaunchAgent, label `com.servusgroup.life-mrdapps` |
| `scripts/install-life.sh` | Idempotent installer — sync files, load agent, kickstart |
| `public/index.html` | New dashboard card → `https://life.mrdapps.com`, health probe `/healthz/life` |
| `scripts/serve.py` | Added `"life"` health entry → `http://127.0.0.1:8810/` |

Architecture notes:
- Separate process, **not** mounted under `mrdapps-site`. Independent restart,
  independent crash domain.
- Runtime files live in `~/Library/Application Support/life-mrdapps/` — same
  TCC-safe pattern as `mrdapps-site` and `Transcript-Master`.
- The dashboard's `/healthz/life` proxy lives in the **existing** mrdapps-site
  server (`scripts/serve.py`), so health checks work as soon as both
  processes are up.

---

## Steps to run on hermes-hub

### 0. Pre-flight

```bash
cd ~/dev/mrdapps-site   # or wherever the working tree lives — adjust if different
git fetch origin
git status              # confirm clean tree before switching branches
```

Find the cloudflared tunnel name (you'll need it in step 2):

```bash
cloudflared tunnel list
# note the Name column — likely something like "hermes-hub" or "mrdapps"
```

### 1. Pull the branch and run the installer

```bash
git checkout claude/life-counter-pwa-91Agp
git pull origin claude/life-counter-pwa-91Agp

# Also refresh the mrdapps-site agent so its serve.py knows about /healthz/life
./scripts/install.sh

# Install the new Life agent
./scripts/install-life.sh
```

`install-life.sh` is idempotent — it rsyncs `public/life/` and `life-serve.py`
into `~/Library/Application Support/life-mrdapps/`, installs the plist into
`~/Library/LaunchAgents/`, bootstraps + kickstarts the agent.

Verify the agent is alive:

```bash
launchctl print "gui/$(id -u)/com.servusgroup.life-mrdapps" | grep -E "state|last exit"
curl -sS http://127.0.0.1:8810/ -o /dev/null -w "%{http_code}\n"   # expect 200
curl -sS http://127.0.0.1:8767/healthz/life                         # expect {"ok":true,...}
```

If the second curl fails, the mrdapps-site agent needs the new `serve.py` —
re-run `./scripts/install.sh` and check `launchctl print
gui/$(id -u)/com.servusgroup.mrdapps-site`.

### 2. Add the Cloudflare DNS record

```bash
cloudflared tunnel route dns <tunnel-name> life.mrdapps.com
```

Replace `<tunnel-name>` with the value from `cloudflared tunnel list`. This
adds a proxied CNAME `life` → `<tunnel-id>.cfargotunnel.com` in the
`mrdapps.com` zone. Re-running is a no-op if the record already exists.

### 3. Add the ingress rule

Edit `~/.cloudflared/config.yml` and add the `life.mrdapps.com` hostname
**above** the catch-all `http_status:404` rule:

```yaml
ingress:
  # ... existing rules above ...
  - hostname: life.mrdapps.com
    service: http://127.0.0.1:8810
  - service: http_status:404
```

Then reload cloudflared:

```bash
sudo launchctl kickstart -k system/com.cloudflare.cloudflared
```

(If cloudflared runs as a LaunchAgent instead of a LaunchDaemon on this
machine, use `launchctl kickstart -k gui/$(id -u)/com.cloudflare.cloudflared`.
`launchctl list | grep cloudflared` will show which.)

### 4. End-to-end verify

```bash
curl -sSI https://life.mrdapps.com | head -5             # 200 OK
curl -sS  https://mrdapps.com/healthz/life               # {"ok":true}
```

Open https://mrdapps.com in a browser — the **Life** card should show a green
status dot. Click through to https://life.mrdapps.com and confirm the counter
renders and the PWA install prompt appears in Chrome/Edge.

---

## After it's green

- Mark the PR ready-for-review and merge (`gh pr ready <num> && gh pr merge --squash`).
- This handoff file (`LIFE_DEPLOY.md`) can be deleted in the merge commit or a
  follow-up — it's only useful until deployment is done.

---

## Rollback

If anything goes sideways:

```bash
# Stop and uninstall the Life agent
launchctl bootout "gui/$(id -u)/com.servusgroup.life-mrdapps" 2>/dev/null || true
rm -f ~/Library/LaunchAgents/com.servusgroup.life-mrdapps.plist
rm -rf ~/Library/Application\ Support/life-mrdapps

# Remove the ingress block from ~/.cloudflared/config.yml, then:
sudo launchctl kickstart -k system/com.cloudflare.cloudflared

# Optional: remove the DNS record from the Cloudflare dashboard
# (cloudflared has no CLI for this — UI only)
```

The dashboard card and `/healthz/life` proxy can be removed by reverting
commit `6979013` and re-running `./scripts/install.sh`.

---

## Open questions to flag back to Doug (don't guess)

- Tunnel name: confirm it from `cloudflared tunnel list` before step 2.
- Working tree path: this doc assumes `~/dev/mrdapps-site`. Adjust if different.
- Whether cloudflared runs as Daemon vs Agent on this Mac — affects the
  `kickstart` target in step 3.
