// Life-counter math.
// Lifespan is in years; end-date is birthdate + lifespan years (calendar-aligned).
// Day count is the integer number of remaining UTC days at the start of today.

const MS_PER_SEC = 1000;
const MS_PER_MIN = 60 * MS_PER_SEC;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export function endDateFor(birthdateISO, lifespanYears) {
  const [y, m, d] = birthdateISO.split('-').map(Number);
  // Anchor end-date at the same calendar day +lifespan years, midnight local.
  const end = new Date(y + Number(lifespanYears), (m || 1) - 1, d || 1, 0, 0, 0, 0);
  return end;
}

export function birthDate(birthdateISO) {
  const [y, m, d] = birthdateISO.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

export function compute(birthdateISO, lifespanYears, now = new Date()) {
  const start = birthDate(birthdateISO);
  const end = endDateFor(birthdateISO, lifespanYears);
  const totalMs = end - start;
  const remainingMs = end - now;
  const elapsedMs = now - start;

  const past = remainingMs <= 0;

  const remDays = Math.max(0, Math.ceil(remainingMs / MS_PER_DAY));
  const remMs = Math.max(0, remainingMs);

  // Hours/min/sec within the partial day until midnight of the end-date.
  const within = remMs % MS_PER_DAY;
  const h = Math.floor(within / MS_PER_HOUR);
  const m = Math.floor((within % MS_PER_HOUR) / MS_PER_MIN);
  const s = Math.floor((within % MS_PER_MIN) / MS_PER_SEC);

  const livedPct = totalMs > 0 ? Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100)) : 0;

  return {
    past,
    remainingDays: remDays,
    remainingMs: remMs,
    h, m, s,
    livedPct,
    totalDays: Math.round(totalMs / MS_PER_DAY),
    elapsedDays: Math.max(0, Math.floor(elapsedMs / MS_PER_DAY)),
  };
}

export function formatDays(n, lang = 'en') {
  // 27,412 (en) / 27.412 (pt) — thousands separators.
  return new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-CA').format(n);
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

// Drive a function ~once per second, aligned to the wall-clock boundary so the
// seconds tick *with* the user's clock instead of drifting a few hundred ms.
// Pauses when the document is hidden; resumes on visibility change.
export function startTicker(fn) {
  let timer = null;
  let stopped = false;

  function schedule() {
    if (stopped) return;
    const now = Date.now();
    const msToNextSecond = 1000 - (now % 1000);
    timer = setTimeout(() => {
      if (stopped) return;
      try { fn(); } catch (e) { console.error(e); }
      schedule();
    }, msToNextSecond + 4); // tiny buffer to avoid double-firing on the same second
  }

  function onVisibility() {
    if (document.hidden) {
      if (timer) { clearTimeout(timer); timer = null; }
    } else if (!timer && !stopped) {
      try { fn(); } catch (e) { console.error(e); }
      schedule();
    }
  }

  // Kick off immediately and align.
  try { fn(); } catch (e) { console.error(e); }
  schedule();
  document.addEventListener('visibilitychange', onVisibility);

  return function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
