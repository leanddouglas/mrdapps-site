// mrdapps.com — landing page liveness checks.
// Self-contained. No deps. Probes each card's same-origin /healthz/<app>
// endpoint, which the local server proxies to the app's localhost /health.

const REFRESH_MS = 30_000;
const TIMEOUT_MS = 3_000;

const cards = Array.from(document.querySelectorAll('.card[data-health]'));
const pill = document.querySelector('.status-pill');
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

async function probe(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = performance.now();
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    const elapsed = Math.round(performance.now() - t0);
    if (!res.ok) return { ok: false };
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return { ok: false };
    const data = await res.json();
    if (!data || data.ok !== true) return { ok: false };
    const latency = Number.isFinite(data.latency_ms) ? data.latency_ms : elapsed;
    return { ok: true, latency };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

function renderCard(card, result) {
  const dot = card.querySelector('.status .dot');
  const label = card.querySelector('.status .label');
  const latency = card.querySelector('.latency');
  if (result.ok) {
    dot.dataset.status = 'live';
    label.textContent = 'live';
    latency.textContent = `${result.latency}ms`;
    latency.classList.add('is-visible');
  } else {
    dot.dataset.status = 'offline';
    label.textContent = 'offline';
    latency.textContent = '';
    latency.classList.remove('is-visible');
  }
}

function renderPill(allOk, anyChecked) {
  if (!pill) return;
  const dot = pill.querySelector('.dot');
  const label = pill.querySelector('.label');
  if (!anyChecked) {
    pill.dataset.status = 'loading';
    dot.dataset.status = 'loading';
    label.textContent = 'checking…';
    return;
  }
  if (allOk) {
    pill.dataset.status = 'ok';
    dot.dataset.status = 'live';
    label.textContent = 'all systems operational';
  } else {
    pill.dataset.status = 'down';
    dot.dataset.status = 'offline';
    label.textContent = 'degraded';
  }
}

async function tick() {
  if (cards.length === 0) {
    renderPill(true, true);
    return;
  }
  const results = await Promise.all(cards.map((c) => probe(c.dataset.health)));
  cards.forEach((card, i) => renderCard(card, results[i]));
  renderPill(results.every((r) => r.ok), true);
}

tick();
setInterval(tick, REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') tick();
});
