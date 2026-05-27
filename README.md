# mrdapps-site

The landing page for **[mrdapps.com](https://mrdapps.com/)** — a tiny dashboard
that lists the small tools I run on a Mac mini in Richmond, BC, and pings each
one every 30 seconds to show whether it's live.

No frameworks, no build step, no third-party JS. Just static HTML / CSS / a
single ES module, served by a small Python script on `127.0.0.1:8090` and
exposed to the public internet through the same Cloudflare Tunnel that runs
all my other `*.mrdapps.com` subdomains.

---

## How it's hosted

Same pattern as every other app under `mrdapps.com`, documented in detail in
the **Transcript-Master** repo:

> [github.com/leanddouglas/Transcript-Master](https://github.com/leanddouglas/Transcript-Master)
> → `docs/INFRA.md`

The short version:

```
Internet
   │
   ▼
Cloudflare edge   ── TLS terminated here
   │
   │  outbound tunnel (cloudflared on the Mac)
   ▼
hermes-hub (Mac mini)
   │
   ├── 127.0.0.1:8090   mrdapps-site (this repo)        → mrdapps.com, www.mrdapps.com
   ├── 127.0.0.1:8765   Transcript-Master               → transcript.mrdapps.com
   └── 127.0.0.1:NNNN   future apps
```

Nothing inbound is open on the Mac. The tunnel is initiated outbound from
`cloudflared`, which runs as a LaunchAgent.

---

## Repo layout

```
mrdapps-site/
├── public/                                  ← served as the web root
│   ├── index.html
│   ├── styles.css
│   ├── app.js                               ← health-check polling (~80 lines, no deps)
│   ├── favicon.svg
│   └── robots.txt
├── scripts/
│   ├── start.sh                             ← entrypoint the LaunchAgent runs
│   └── serve.py                             ← static server + /healthz/<app> proxy
├── server/
│   └── com.servusgroup.mrdapps-site.plist   ← LaunchAgent template
├── README.md
└── LICENSE
```

### Why a custom Python server instead of `python3 -m http.server`?

One reason: the landing page polls each app's `/health` endpoint to show a
green/red dot. Those endpoints live on different subdomains
(`transcript.mrdapps.com`, etc.) and don't return CORS headers, so a browser
fetch from `mrdapps.com` is blocked from reading the response body.

`serve.py` adds a single extra route — `/healthz/<slug>` — that proxies to the
app's `127.0.0.1:<port>/health` on this same Mac. Same-origin from the
browser's perspective, no CORS wrangling, and the request never leaves the
loopback interface. Adding a new app means adding one line to the `APPS` dict
in `serve.py`.

---

## Run it locally

```bash
bash scripts/start.sh
# → mrdapps-site listening on http://127.0.0.1:8090 (serving .../public)
open http://127.0.0.1:8090
```

## Run it as a LaunchAgent (production setup on hermes-hub)

```bash
bash scripts/install.sh
```

That script:

1. Rsyncs `public/` and `serve.py` into `~/Library/Application Support/mrdapps-site/`.
2. Installs the LaunchAgent plist into `~/Library/LaunchAgents/`.
3. Unloads + loads it.
4. Smoke-tests `http://127.0.0.1:8090/` and `/healthz/transcript`.

Re-run `install.sh` any time you edit `public/`, `serve.py`, or the plist.
It's idempotent.

> **Why two copies of the files?** macOS TCC (Transparency, Consent, and
> Control) blocks LaunchAgents from running scripts inside `~/Documents/`
> without an explicit Full Disk Access grant. Living under
> `~/Library/Application Support/` sidesteps that — and matches what
> Transcript-Master already does on the same Mac.

Useful follow-ups:

```bash
launchctl list | grep mrdapps-site            # should show a PID and status=0
curl -s http://127.0.0.1:8090/ | head -5      # sanity check
tail -f ~/Library/Logs/mrdapps-site.log       # live log
```

## Wire it into the Cloudflare Tunnel

Already done for `mrdapps.com` and `www.mrdapps.com`. For reference (or if
this site ever moves to a different machine), the recipe is in
[Transcript-Master `docs/INFRA.md`](https://github.com/leanddouglas/Transcript-Master/blob/main/docs/INFRA.md).

---

## Sub-app: `life.mrdapps.com` (Life Counter PWA)

The Life Counter (`public/life/`) is a self-contained static PWA. It ships
on its own loopback port (`8810`) under its own LaunchAgent, exactly like
the other `*.mrdapps.com` apps.

```bash
bash scripts/install-life.sh
```

That script:

1. Rsyncs `public/life/` and `life-serve.py` into
   `~/Library/Application Support/life-mrdapps/`.
2. Installs `com.servusgroup.life-mrdapps` into `~/Library/LaunchAgents/`.
3. Loads it and smoke-tests `http://127.0.0.1:8810/`.

Then, on the Mac, finish the Cloudflare wiring:

```bash
# 1. DNS — create the proxied CNAME automatically (or add it in the dashboard):
cloudflared tunnel route dns <your-tunnel-name> life.mrdapps.com

# 2. Ingress — edit ~/.cloudflared/config.yml and add (above the catch-all):
#      - hostname: life.mrdapps.com
#        service: http://127.0.0.1:8810
# Then reload cloudflared:
sudo launchctl kickstart -k system/com.cloudflare.cloudflared
```

The dashboard at `mrdapps.com` already has a Life card and a
`/healthz/life` probe pointing at `127.0.0.1:8810`, so once the LaunchAgent
is loaded the card will go green even before the Cloudflare ingress is
live.

---

## Adding a new app to the dashboard

1. Get the app running on its own loopback port and its own
   `<sub>.mrdapps.com` (see Transcript-Master's `docs/INFRA.md` for the
   4-step ingress recipe).
2. Add one entry to `APPS` in `scripts/serve.py`:
   ```python
   APPS = {
       "transcript": "http://127.0.0.1:8765/health",
       "notes":      "http://127.0.0.1:9000/health",   # new
   }
   ```
3. Add one `<article class="card" data-health="/healthz/notes"> …` block in
   `public/index.html`, modelled on the Transcript-Master card.
4. Reload the LaunchAgent.

The app's `/health` endpoint should return JSON shaped like
`{"ok": true, ...}` — the server augments the response with `latency_ms`
before returning it to the browser.

---

## Design notes

- Dark theme; near-black `#0a0b10`, off-white `#f2f2f6`, one cyan accent
  `#00d4ff` used sparingly (corner brackets, focus states, status dots).
- System fonts only (`-apple-system`, `ui-monospace`) — no webfonts, no CDN.
- Card corners get tiny cyan brackets that brighten on hover.
- Status dots pulse softly when live; the header pill aggregates across all
  apps.
- Faint dot-grid background as texture, not noise (~5% opacity).
- Mobile-first: 1 / 2 / 3 column grid at the usual breakpoints.
- `prefers-reduced-motion` honoured.

---

## License

MIT — see [LICENSE](LICENSE).
