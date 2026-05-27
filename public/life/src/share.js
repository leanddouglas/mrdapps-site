// URL param encoding + screenshot canvas renderer.

import { compute, formatDays } from './counter.js';
import { t } from './i18n.js';

// ─────────────────────── URL params ───────────────────────

const KEYS = ['b', 'l', 'n', 'g', 'c', 'lang'];

export function buildShareURL(profile, langOverride) {
  const url = new URL(window.location.href);
  url.search = '';
  if (profile.birthdate) url.searchParams.set('b', profile.birthdate);
  if (profile.lifespan)  url.searchParams.set('l', String(profile.lifespan));
  if (profile.name)      url.searchParams.set('n', profile.name);
  if (profile.gender)    url.searchParams.set('g', profile.gender);
  if (profile.country)   url.searchParams.set('c', profile.country);
  if (langOverride)      url.searchParams.set('lang', langOverride);
  return url.toString();
}

export function readURLProfile() {
  const p = new URLSearchParams(window.location.search);
  if (!p.has('b')) return null;
  const profile = {
    birthdate: p.get('b') || '',
    lifespan: Number(p.get('l')) || 0,
    name: p.get('n') || '',
    gender: p.get('g') || '',
    country: p.get('c') || '',
  };
  if (!profile.birthdate || !profile.lifespan) return null;
  return profile;
}

export function clearURLParams() {
  const url = new URL(window.location.href);
  url.search = '';
  history.replaceState(null, '', url);
}

// ─────────────────────── Native share ───────────────────────

export async function shareLink(url, title) {
  if (navigator.share) {
    try {
      await navigator.share({ url, title });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      // fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export async function shareImage(blob, url, title) {
  // Try native share with file first (Safari/Android Chrome support this).
  if (navigator.canShare && navigator.share) {
    const file = new File([blob], 'life.png', { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], url, title });
        return 'shared';
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
      }
    }
  }
  // Fall back to downloading.
  downloadBlob(blob, 'life.png');
  return 'downloaded';
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

// ─────────────────────── Snapshot canvas ───────────────────────
//
// Draws a clean 1080×1080 or 1080×1920 image with no UI chrome:
//
//   • big days-remaining number (serif)
//   • "days remaining" label
//   • optional name + lifespan reference line
//   • prompt text (single line of poetry-card)
//   • subtle tag at the bottom
//
// Uses Canvas 2D so there is no external dependency. Fonts: tries Fraunces
// and Inter (loaded by the page); falls back to Georgia / system.

const PALETTE = {
  bg:    '#15161b',
  ink:   '#ece5d8',
  soft:  '#c9c1b1',
  mute:  '#8a8576',
  faint: '#5b5849',
  accent:'#e8a87c',
};

export function renderSnapshot(canvas, opts) {
  // opts: { profile, prompt, lang, format: 'square' | 'story' }
  const fmt = opts.format === 'story' ? 'story' : 'square';
  const W = 1080;
  const H = fmt === 'story' ? 1920 : 1080;
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background — subtle vertical gradient.
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#181922');
  grad.addColorStop(1, '#101116');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Accent mark — small dot top-left.
  ctx.fillStyle = PALETTE.accent;
  ctx.beginPath();
  ctx.arc(80, fmt === 'story' ? 120 : 90, 14, 0, Math.PI * 2);
  ctx.fill();

  // "life" wordmark
  ctx.fillStyle = PALETTE.soft;
  ctx.font = `400 30px "Fraunces", Georgia, serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText('life', 110, fmt === 'story' ? 120 : 90);

  // Days remaining — compute now.
  const c = compute(opts.profile.birthdate, opts.profile.lifespan, new Date());
  const daysText = formatDays(c.remainingDays, opts.lang);

  // Layout anchors
  const cx = W / 2;
  const numY = fmt === 'story' ? 700 : 460;
  const labelY = numY + (fmt === 'story' ? 140 : 110);
  const promptY = fmt === 'story' ? 1120 : 700;

  // Greeting line
  ctx.fillStyle = PALETTE.mute;
  ctx.font = `500 30px "Inter", -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  const greet = opts.profile.name
    ? t('counter.greetingNamed', { name: opts.profile.name })
    : t('counter.greetingAnon');
  ctx.fillText(greet, cx, numY - (fmt === 'story' ? 200 : 160));

  // Big number — auto-size to fit width.
  const targetW = W - 160;
  let numSize = fmt === 'story' ? 340 : 280;
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `300 ${numSize}px "Fraunces", Georgia, serif`;
  let measured = ctx.measureText(daysText).width;
  while (measured > targetW && numSize > 80) {
    numSize -= 10;
    ctx.font = `300 ${numSize}px "Fraunces", Georgia, serif`;
    measured = ctx.measureText(daysText).width;
  }
  ctx.textAlign = 'center';
  ctx.fillText(daysText, cx, numY);

  // Days label
  ctx.fillStyle = PALETTE.soft;
  ctx.font = `500 36px "Inter", -apple-system, sans-serif`;
  ctx.fillText(t('counter.daysLeft'), cx, labelY);

  // Thin accent rule
  const ruleY = labelY + 50;
  ctx.fillStyle = PALETTE.accent;
  ctx.fillRect(cx - 40, ruleY, 80, 3);

  // Prompt text — wrap to 24-ch lines.
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `400 50px "Fraunces", Georgia, serif`;
  const lines = wrapText(ctx, opts.prompt || '', W - 200);
  const lineHeight = 70;
  const totalH = lines.length * lineHeight;
  let y = promptY - totalH / 2;
  lines.forEach((line) => {
    ctx.fillText(line, cx, y);
    y += lineHeight;
  });

  // Footer tag
  ctx.fillStyle = PALETTE.faint;
  ctx.font = `500 26px "Inter", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(t('snap.tag'), cx, H - 80);
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95));
}
