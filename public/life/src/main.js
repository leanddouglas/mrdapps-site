// Entry point. Routes between onboarding and counter, wires up tickers,
// language, share/snapshot, and persistence.

import { compute, formatDays, pad2, startTicker } from './counter.js';
import { promptForToday } from './prompts.js';
import {
  buildShareURL,
  readURLProfile,
  clearURLParams,
  shareLink,
  shareImage,
  renderSnapshot,
  canvasToBlob,
  downloadBlob,
} from './share.js';
import { setLang, getLang, t, applyI18n, detectLang } from './i18n.js';

const STORAGE_KEY = 'life.profile.v1';
const LANG_KEY = 'life.lang.v1';

// ─────────────────────── Lifespan defaults ───────────────────────
//
// Country × gender → expected years at birth. Sources:
//   Canada — StatCan 2024 (~80.3 male, ~84.3 female), rounded.
//   Brazil — IBGE 2024 (~73.3 male, ~79.5 female), rounded.
//   USA    — CDC 2023 (~75.8 male, ~81.1 female), rounded.
//   Other  — WHO 2024 global average.
// "x" gender takes the mid-point.
const LIFESPAN_TABLE = {
  ca: { m: 80, f: 84, x: 82 },
  br: { m: 74, f: 80, x: 77 },
  us: { m: 76, f: 81, x: 79 },
  other: { m: 71, f: 76, x: 74 },
};

function defaultLifespan(country, gender) {
  const t = LIFESPAN_TABLE[country] || LIFESPAN_TABLE.other;
  return t[gender] || t.x;
}

function avgForReference(country, gender) {
  return defaultLifespan(country, gender);
}

// ─────────────────────── Profile model ───────────────────────

function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || !p.birthdate || !p.lifespan) return null;
    return p;
  } catch {
    return null;
  }
}

function saveProfile(p) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

function clearProfile() {
  localStorage.removeItem(STORAGE_KEY);
}

function isValidProfile(p) {
  if (!p || !p.birthdate || !p.lifespan) return false;
  const d = new Date(p.birthdate);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  if (d > now) return false;
  if (now.getFullYear() - d.getFullYear() > 120) return false;
  if (p.lifespan < 1 || p.lifespan > 120) return false;
  return true;
}

// ─────────────────────── Views ───────────────────────

const body = document.body;
const els = {
  onboardForm:    document.getElementById('onboard-form'),
  birthdate:      document.querySelector('input[name="birthdate"]'),
  name:           document.querySelector('input[name="name"]'),
  country:        document.querySelector('select[name="country"]'),
  lifespan:       document.querySelector('input[name="lifespan"]'),
  lifespanOut:    document.querySelector('output[name="lifespan-out"]'),
  genderRadios:   document.querySelectorAll('input[name="gender"]'),

  greeting:       document.querySelector('[data-counter-greeting]'),
  days:           document.querySelector('[data-counter-days]'),
  hH:             document.querySelector('[data-counter-h]'),
  hM:             document.querySelector('[data-counter-m]'),
  hS:             document.querySelector('[data-counter-s]'),
  progressBar:    document.querySelector('[data-progress-bar]'),
  progressPct:    document.querySelector('[data-progress-pct]'),
  promptText:     document.querySelector('[data-prompt-text]'),
  reference:      document.querySelector('[data-reference]'),

  langBtn:        document.querySelector('[data-action="lang"]'),
  editBtn:        document.querySelector('[data-action="edit"]'),
  resetBtn:       document.querySelector('[data-action="reset"]'),
  shareBtn:       document.querySelector('[data-action="share"]'),
  snapshotBtn:    document.querySelector('[data-action="snapshot"]'),

  toast:          document.querySelector('[data-toast]'),
  snapDialog:     document.querySelector('[data-snapshot-dialog]'),
  snapCanvas:     document.querySelector('[data-snap-canvas]'),
  snapTabs:       document.querySelectorAll('[data-snap-tab]'),
  snapClose:      document.querySelector('[data-action="snapshot-close"]'),
  snapDownload:   document.querySelector('[data-action="snap-download"]'),
  snapShare:      document.querySelector('[data-action="snap-share"]'),
};

function setView(view) {
  body.dataset.view = view;
  document.querySelectorAll('.view').forEach((el) => {
    el.hidden = el.dataset.view !== view;
  });
  els.editBtn.hidden = view !== 'counter';
}

// ─────────────────────── Onboarding ───────────────────────

function initOnboardingDefaults(profile) {
  // Birth date — max today; default 30y ago for a sensible starting point.
  const todayISO = new Date().toISOString().slice(0, 10);
  els.birthdate.max = todayISO;
  if (profile && profile.birthdate) {
    els.birthdate.value = profile.birthdate;
  } else {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 30);
    els.birthdate.placeholder = d.toISOString().slice(0, 10);
  }

  if (profile && profile.name) els.name.value = profile.name;

  // Country — detect from locale once; otherwise default to global.
  const country = (profile && profile.country) || guessCountry();
  els.country.value = country;

  // Gender — restore if set.
  if (profile && profile.gender) {
    els.genderRadios.forEach((r) => { r.checked = r.value === profile.gender; });
  }

  // Lifespan — restore explicit, else derive from country+gender, else 85.
  const gender = profile?.gender || 'x';
  const derived = defaultLifespan(country, gender);
  const initial = (profile && profile.lifespan) || derived;
  els.lifespan.value = initial;
  els.lifespanOut.value = initial;

  // Auto-update lifespan default when country/gender change (unless user has touched the slider).
  let userTouched = !!(profile && profile.lifespan);
  els.lifespan.addEventListener('input', () => {
    userTouched = true;
    els.lifespanOut.value = els.lifespan.value;
  });

  const refreshDerived = () => {
    if (userTouched) return;
    const c = els.country.value;
    const g = [...els.genderRadios].find((r) => r.checked)?.value || 'x';
    const d = defaultLifespan(c, g);
    els.lifespan.value = d;
    els.lifespanOut.value = d;
  };
  els.country.addEventListener('change', refreshDerived);
  els.genderRadios.forEach((r) => r.addEventListener('change', refreshDerived));
}

function guessCountry() {
  const lang = (navigator.language || '').toLowerCase();
  if (lang.endsWith('-br') || lang === 'pt' || lang === 'pt-br') return 'br';
  if (lang.endsWith('-ca') || lang === 'fr-ca') return 'ca';
  if (lang.endsWith('-us') || lang === 'en-us') return 'us';
  return 'other';
}

els.onboardForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const profile = {
    birthdate: els.birthdate.value,
    name: (els.name.value || '').trim().slice(0, 40),
    country: els.country.value,
    gender: [...els.genderRadios].find((r) => r.checked)?.value || '',
    lifespan: Number(els.lifespan.value),
  };
  if (!isValidProfile(profile)) {
    showToast(t('onboard.invalid'));
    return;
  }
  saveProfile(profile);
  clearURLParams();
  enterCounter(profile);
});

// ─────────────────────── Counter ───────────────────────

let activeStopper = null;
let currentProfile = null; // the profile being displayed (may differ from localStorage on shared-link views)

function enterCounter(profile) {
  currentProfile = profile;
  if (activeStopper) { activeStopper(); activeStopper = null; }

  // Greeting
  if (profile.name) {
    const phrase = t('counter.greetingNamed', { name: profile.name });
    els.greeting.innerHTML = '';
    els.greeting.appendChild(document.createTextNode(phrase));
  } else {
    els.greeting.textContent = t('counter.greetingAnon');
  }

  // Reference line
  const avg = avgForReference(profile.country || 'other', profile.gender || 'x');
  els.reference.textContent = t('counter.reference', { avg });

  // Today's prompt
  const prompt = promptForToday();
  els.promptText.textContent = prompt[getLang()] || prompt.en;

  setView('counter');

  // Tick — recompute every visible second.
  let lastDays = -1;
  const tick = () => {
    const c = compute(profile.birthdate, profile.lifespan, new Date());
    if (c.past) {
      els.days.textContent = '0';
      els.hH.textContent = '00';
      els.hM.textContent = '00';
      els.hS.textContent = '00';
      els.progressBar.style.width = '100%';
      els.progressPct.textContent = '100%';
      els.reference.textContent = t('counter.passed');
      return;
    }
    if (c.remainingDays !== lastDays) {
      els.days.textContent = formatDays(c.remainingDays, getLang());
      // Restart day-pulse animation
      els.days.style.animation = 'none';
      // Force reflow then re-apply
      void els.days.offsetWidth;
      els.days.style.animation = '';
      lastDays = c.remainingDays;
    }
    els.hH.textContent = pad2(c.h);
    els.hM.textContent = pad2(c.m);
    els.hS.textContent = pad2(c.s);
    els.progressBar.style.width = c.livedPct.toFixed(2) + '%';
    els.progressPct.textContent = c.livedPct.toFixed(1) + '%';
  };
  activeStopper = startTicker(tick);
}

// ─────────────────────── Lang toggle ───────────────────────

els.langBtn.addEventListener('click', () => {
  const next = getLang() === 'en' ? 'pt' : 'en';
  setLang(next);
  localStorage.setItem(LANG_KEY, next);
  applyI18n();
  // Re-render counter view if active, keeping whichever profile is on screen.
  const profile = currentProfile || loadProfile();
  if (body.dataset.view === 'counter' && profile) enterCounter(profile);
});

// ─────────────────────── Edit / Reset ───────────────────────

els.editBtn.addEventListener('click', () => {
  const p = loadProfile();
  if (activeStopper) { activeStopper(); activeStopper = null; }
  initOnboardingDefaults(p || {});
  setView('onboarding');
});

els.resetBtn.addEventListener('click', () => {
  if (!confirm(t('reset.confirm'))) return;
  clearProfile();
  clearURLParams();
  if (activeStopper) { activeStopper(); activeStopper = null; }
  initOnboardingDefaults(null);
  setView('onboarding');
});

// ─────────────────────── Share ───────────────────────

els.shareBtn.addEventListener('click', async () => {
  // Share what's currently on screen, so re-sharing a shared link works.
  const profile = currentProfile || loadProfile();
  if (!profile) return;
  const url = buildShareURL(profile, getLang());
  const result = await shareLink(url, t('onboard.heading'));
  if (result === 'copied') showToast(t('share.copied'));
  if (result === 'failed') showToast(t('share.failed'));
});

// ─────────────────────── Snapshot ───────────────────────

let currentSnapFormat = 'square';

els.snapshotBtn.addEventListener('click', () => {
  redrawSnap();
  els.snapDialog.showModal();
});

els.snapClose.addEventListener('click', () => els.snapDialog.close());

els.snapTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    currentSnapFormat = tab.dataset.snapTab;
    els.snapTabs.forEach((t) => t.setAttribute('aria-selected', t === tab ? 'true' : 'false'));
    redrawSnap();
  });
});

function redrawSnap() {
  const profile = currentProfile || loadProfile();
  if (!profile) return;
  const prompt = promptForToday();
  renderSnapshot(els.snapCanvas, {
    profile,
    prompt: prompt[getLang()] || prompt.en,
    lang: getLang(),
    format: currentSnapFormat,
  });
}

els.snapDownload.addEventListener('click', async () => {
  const blob = await canvasToBlob(els.snapCanvas);
  if (!blob) return;
  downloadBlob(blob, `life-${currentSnapFormat}.png`);
});

els.snapShare.addEventListener('click', async () => {
  const blob = await canvasToBlob(els.snapCanvas);
  if (!blob) return;
  const profile = currentProfile || loadProfile();
  const url = profile ? buildShareURL(profile, getLang()) : window.location.href;
  const result = await shareImage(blob, url, t('onboard.heading'));
  if (result === 'downloaded') showToast(t('snap.copy'));
});

// ─────────────────────── Toast ───────────────────────

let toastTimer = null;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  // Allow reflow before adding the visible attribute
  requestAnimationFrame(() => els.toast.setAttribute('data-toast-on', ''));
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.removeAttribute('data-toast-on');
    setTimeout(() => { els.toast.hidden = true; }, 220);
  }, 2200);
}

// ─────────────────────── Boot ───────────────────────

function boot() {
  // Language: URL > localStorage > navigator
  const params = new URLSearchParams(window.location.search);
  const urlLang = params.get('lang');
  const stored = localStorage.getItem(LANG_KEY);
  setLang(urlLang || stored || detectLang());
  applyI18n();

  // Profile precedence:
  //   1. URL params, if present, render that counter (so shared links always
  //      show the sender's data — even to recipients who already have their own).
  //      If the recipient has no profile yet, persist the URL profile so a
  //      refresh keeps working.
  //   2. Otherwise, render the recipient's own stored profile.
  //   3. Otherwise, show onboarding.
  const urlProfile = readURLProfile();
  const stashed = loadProfile();
  const profile = urlProfile || stashed;

  if (urlProfile && !stashed) saveProfile(urlProfile);

  if (profile && isValidProfile(profile)) {
    enterCounter(profile);
  } else {
    initOnboardingDefaults(profile);
    setView('onboarding');
  }
}

boot();

// ─────────────────────── Service worker ───────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline registration failure is non-fatal — site still works online.
    });
  });
}
