// ─────────────────────────────────────────────────────────────────────────────
// Share card — dossier-style PNG renderer for a scouted player.
//
// The card is composed entirely as an inline SVG string (no external assets),
// which we render to an offscreen canvas and export as PNG. This sidesteps the
// html2canvas dependency and guarantees a crisp, transparent-free image.
//
// The layout mirrors the on-page dossier (src/components/scout/dossier.tsx):
// registration marks at the corners, mono field labels, and segmented meters
// rather than rings or dial gauges. A shared card should look like the product
// it came from.
// ─────────────────────────────────────────────────────────────────────────────

import { ProfileSnapshot, TellsProfile } from '@/types/scout';

export interface ShareCardData {
  username: string;
  platform: 'chess.com' | 'lichess';
  profile: ProfileSnapshot;
  tells: TellsProfile;
  topOpening?: {
    eco: string;
    name: string;
  };
}

const CARD_W = 720;
const CARD_H = 1024;
const M = 52; // page margin

const SANS = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Monaco,'Courier New',monospace";

// HTML-escape a string so it's safe to inline into SVG text nodes.
function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Higher = stronger player. */
function strengthColor(v: number): string {
  if (v >= 75) return '#34d399';
  if (v >= 60) return '#a3e635';
  if (v >= 45) return '#fbbf24';
  return '#f87171';
}

/** Higher = more exploitable by the sharer. */
function tellColor(v: number): string {
  if (v >= 70) return '#f87171';
  if (v >= 50) return '#FB923C';
  if (v >= 35) return '#fbbf24';
  return '#34d399';
}

/** Mono, wide-tracked field label — the dossier's caption voice. */
function label(
  x: number,
  y: number,
  text: string,
  fill: string,
  size = 13,
  tracking = 2.6
): string {
  return `<text x="${x}" y="${y}" font-family="${MONO}" font-size="${size}"
      font-weight="600" fill="${fill}" letter-spacing="${tracking}">${escape(
        text.toUpperCase()
      )}</text>`;
}

/**
 * A row of discrete segments filling left-to-right — the house meter form.
 * Discrete segments survive PNG downscaling on a phone timeline far better
 * than a thin arc does.
 */
function meter(
  x: number,
  y: number,
  w: number,
  value: number,
  color: string,
  segments = 22,
  h = 13
): string {
  const clamped = Math.max(0, Math.min(100, value));
  const lit = Math.round((clamped / 100) * segments);
  const gap = 3;
  const segW = (w - gap * (segments - 1)) / segments;
  let out = '';
  for (let i = 0; i < segments; i += 1) {
    const on = i < lit;
    out += `<rect x="${(x + i * (segW + gap)).toFixed(2)}" y="${y}" width="${segW.toFixed(2)}" height="${h}"
        rx="1.5" fill="${on ? color : '#ffffff'}" opacity="${on ? (i === lit - 1 ? 1 : 0.82) : 0.07}"/>`;
  }
  return out;
}

/**
 * Label + meter + right-aligned value, aligned to a shared grid.
 *
 * The label column has to clear the longest tell label ("Repetitive patterns"),
 * so it is sized off that worst case rather than off the average — a narrower
 * column silently runs the text under the meter.
 */
function meterRow(
  y: number,
  text: string,
  value: number,
  color: string
): string {
  const labelSize = 12;
  const labelTracking = 1.8;
  const meterX = M + 212;
  const meterW = CARD_W - M - 54 - meterX;
  return `
    ${label(M, y + 11, text, 'rgba(255,255,255,0.62)', labelSize, labelTracking)}
    ${meter(meterX, y, meterW, value, color)}
    <text x="${CARD_W - M}" y="${y + 12}" text-anchor="end" font-family="${MONO}"
          font-size="19" font-weight="700" fill="${color}">${Math.round(value)}</text>`;
}

/** Corner registration marks — the dossier signature. */
function cornerMarks(): string {
  const c = 'rgba(249,115,22,0.5)';
  const len = 22;
  const o = 26; // inset
  const stroke = `stroke="${c}" stroke-width="2" fill="none"`;
  return `
    <path d="M${o},${o + len} L${o},${o} L${o + len},${o}" ${stroke}/>
    <path d="M${CARD_W - o - len},${o} L${CARD_W - o},${o} L${CARD_W - o},${o + len}" ${stroke}/>
    <path d="M${o},${CARD_H - o - len} L${o},${CARD_H - o} L${o + len},${CARD_H - o}" ${stroke}/>
    <path d="M${CARD_W - o - len},${CARD_H - o} L${CARD_W - o},${CARD_H - o} L${CARD_W - o},${CARD_H - o - len}" ${stroke}/>`;
}

/** Fit the username to the card width — long handles are common. */
function nameSize(name: string): number {
  if (name.length <= 12) return 54;
  if (name.length <= 18) return 42;
  if (name.length <= 26) return 32;
  return 26;
}

function verdictText(p: TellsProfile['predictability']): string {
  if (p === 'High') return 'Highly readable';
  if (p === 'Medium') return 'Readable';
  return 'Hard to read';
}

export function buildShareCardSvg(data: ShareCardData): string {
  const { username, platform, profile, tells, topOpening } = data;

  const dims: Array<{ label: string; value: number }> = [
    { label: 'Attack', value: profile.atk },
    { label: 'Defence', value: profile.def },
    { label: 'Clock', value: profile.time },
    { label: 'Composure', value: profile.mind },
  ];

  const ranked = [...tells.factors].sort((a, b) => b.score - a.score).slice(0, 4);

  const ovrColor = strengthColor(profile.ovr);
  const tellsColor = tellColor(tells.total);

  // Vertical rhythm: each block declares its own top edge so the layout stays
  // readable when one is retuned.
  const yHeaderRule = 108;
  const ySubject = 168;
  const yScores = 292;
  const yStrengthLabel = 410;
  const yStrengthRows = 442;
  const yTellsLabel = 646;
  const yTellsRows = 678;
  const yFooter = 952;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#0d0f14"/>
      <stop offset="100%" stop-color="#07080b"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#F97316" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="#F97316" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#bg)"/>
  <ellipse cx="${CARD_W * 0.82}" cy="120" rx="340" ry="280" fill="url(#glow)"/>
  <ellipse cx="${CARD_W * 0.1}" cy="${CARD_H - 120}" rx="300" ry="240" fill="url(#glow)"/>
  ${cornerMarks()}

  <!-- Header -->
  ${label(M, 62, 'Chess Masti', '#FB923C', 17)}
  ${label(M, 86, 'Scout dossier', 'rgba(255,255,255,0.34)', 12)}
  <rect x="${CARD_W - M - 132}" y="46" width="132" height="32" rx="5"
        fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)"/>
  <text x="${CARD_W - M - 66}" y="67" text-anchor="middle" font-family="${MONO}"
        font-size="12" font-weight="600" fill="rgba(255,255,255,0.7)"
        letter-spacing="2">${escape(platform.toUpperCase())}</text>
  <line x1="${M}" y1="${yHeaderRule}" x2="${CARD_W - M}" y2="${yHeaderRule}"
        stroke="rgba(255,255,255,0.1)" stroke-width="1"/>

  <!-- Subject -->
  ${label(M, ySubject - 26, 'Subject', 'rgba(255,255,255,0.34)', 12)}
  <text x="${M}" y="${ySubject + 26}" font-family="${SANS}"
        font-size="${nameSize(username)}" font-weight="800" fill="#ffffff"
        letter-spacing="-1">${escape(username)}</text>
  <rect x="${M}" y="${ySubject + 46}" width="${Math.min(300, 22 + profile.archetype.length * 11)}" height="30" rx="5"
        fill="rgba(249,115,22,0.12)" stroke="rgba(249,115,22,0.42)"/>
  <text x="${M + 14}" y="${ySubject + 66}" font-family="${MONO}" font-size="12"
        font-weight="600" fill="#FB923C" letter-spacing="2">${escape(profile.archetype.toUpperCase())}</text>
  <text x="${CARD_W - M}" y="${ySubject + 66}" text-anchor="end" font-family="${MONO}"
        font-size="13" fill="rgba(255,255,255,0.42)" letter-spacing="1.5">${profile.totalGames.toLocaleString()} GAMES${
    profile.spanDays > 0 ? ` · ${profile.spanDays}D` : ''
  }</text>

  <!-- The two headline numbers, side by side -->
  <line x1="${CARD_W / 2}" y1="${yScores - 4}" x2="${CARD_W / 2}" y2="${yScores + 88}"
        stroke="rgba(255,255,255,0.09)" stroke-width="1"/>
  ${label(M, yScores + 14, 'Overall', 'rgba(255,255,255,0.34)', 12)}
  <text x="${M}" y="${yScores + 76}" font-family="${MONO}" font-size="62" font-weight="700"
        fill="${ovrColor}" letter-spacing="-3">${profile.ovr}</text>

  ${label(CARD_W / 2 + 34, yScores + 14, 'Tells', '#FB923C', 12)}
  <text x="${CARD_W / 2 + 34}" y="${yScores + 76}" font-family="${MONO}" font-size="62"
        font-weight="700" fill="${tellsColor}" letter-spacing="-3">${tells.total}</text>
  <text x="${CARD_W - M}" y="${yScores + 76}" text-anchor="end" font-family="${SANS}"
        font-size="15" font-weight="600" fill="${tellsColor}">${escape(verdictText(tells.predictability))}</text>

  <!-- Strength profile -->
  ${label(M, yStrengthLabel, 'Strength profile', 'rgba(255,255,255,0.34)', 12)}
  <line x1="${M}" y1="${yStrengthLabel + 14}" x2="${CARD_W - M}" y2="${yStrengthLabel + 14}"
        stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  ${dims
    .map((d, i) => meterRow(yStrengthRows + i * 44, d.label, d.value, strengthColor(d.value)))
    .join('')}

  <!-- Tells -->
  ${label(M, yTellsLabel, `Tells · ${ranked.length} found`, '#FB923C', 12)}
  <line x1="${M}" y1="${yTellsLabel + 14}" x2="${CARD_W - M}" y2="${yTellsLabel + 14}"
        stroke="rgba(249,115,22,0.2)" stroke-width="1"/>
  ${ranked
    .map((t, i) => meterRow(yTellsRows + i * 44, t.label, t.score, tellColor(t.score)))
    .join('')}

  <!-- Footer -->
  <line x1="${M}" y1="${yFooter - 34}" x2="${CARD_W - M}" y2="${yFooter - 34}"
        stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  ${
    topOpening
      ? `${label(M, yFooter - 8, 'Most played', 'rgba(255,255,255,0.3)', 11)}
  <text x="${M}" y="${yFooter + 16}" font-family="${SANS}" font-size="16" font-weight="700"
        fill="rgba(255,255,255,0.86)">${escape(topOpening.eco)} · ${escape(
          topOpening.name.length > 34 ? `${topOpening.name.slice(0, 33)}…` : topOpening.name
        )}</text>`
      : ''
  }
  <text x="${CARD_W - M}" y="${yFooter + 16}" text-anchor="end" font-family="${MONO}"
        font-size="13" font-weight="600" fill="rgba(255,255,255,0.4)"
        letter-spacing="1.5">CHESSMASTI.COM</text>
</svg>`;
}

/**
 * Render the SVG string to a PNG Blob using an offscreen canvas.
 */
export async function renderSvgToPng(svg: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = CARD_W * 2; // render @2x for crispness
      canvas.height = CARD_H * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas not supported'));
        return;
      }
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, CARD_W, CARD_H);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        b => {
          if (b) resolve(b);
          else reject(new Error('Canvas toBlob failed'));
        },
        'image/png',
        0.95
      );
    };
    img.onerror = err => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyPngToClipboard(blob: Blob): Promise<boolean> {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      return false;
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Social-share URL builders
// ─────────────────────────────────────────────────────────────────────────────

const SITE_URL = 'https://chessmasti.com';

// Short codes keep the share URL clean ("p=chesscom" reads better than "p=chess.com")
function platformCode(p: ShareCardData['platform']): 'chesscom' | 'lichess' {
  return p === 'lichess' ? 'lichess' : 'chesscom';
}

export function parsePlatformCode(code: string | undefined | null): ShareCardData['platform'] | null {
  if (code === 'lichess') return 'lichess';
  if (code === 'chesscom') return 'chess.com';
  return null;
}

// Prefer the snapshotId path when available — points at the dedicated
// public share page (/share/scout/[id]), which renders the saved
// point-in-time scout report without re-fetching from Chess.com / Lichess
// and ships a richer OG card (via /api/og/scout/[id]) than the legacy
// /scout?scoutId= path. Falls back to the bare ?u=&p= URL when no snapshot
// has been minted (POST in flight or failed), which still runs a fresh
// scout on the recipient's machine.
export function buildShareUrl(
  username: string,
  platform: ShareCardData['platform'],
  snapshotId?: string | null
): string {
  if (snapshotId) {
    return `${SITE_URL}/share/scout/${encodeURIComponent(snapshotId)}`;
  }
  const u = encodeURIComponent(username);
  const p = platformCode(platform);
  return `${SITE_URL}/scout?u=${u}&p=${p}`;
}

export function buildShareText(data: ShareCardData, snapshotId?: string | null): string {
  const url = buildShareUrl(data.username, data.platform, snapshotId);
  return `Just scouted @${data.username} on Chess Masti and crushed them — the free AI coach gave me perfect opening prep against this specific player. Like having a real coach. Try yours: ${url} #ChessMasti #Chess #AI`;
}

export function buildTwitterShareUrl(data: ShareCardData, snapshotId?: string | null): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(buildShareText(data, snapshotId))}`;
}

export function buildLinkedInShareUrl(data: ShareCardData, snapshotId?: string | null): string {
  // LinkedIn's share-offsite endpoint only accepts a `url` param — pre-filled
  // text isn't supported, so users will write their own caption around the link.
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
    buildShareUrl(data.username, data.platform, snapshotId)
  )}`;
}

export function buildRedditShareUrl(data: ShareCardData, snapshotId?: string | null): string {
  const title = `Scouted my opponent on Chess Masti — got a custom opening prep deck against them, free`;
  return `https://www.reddit.com/r/chess/submit?title=${encodeURIComponent(title)}&url=${encodeURIComponent(
    buildShareUrl(data.username, data.platform, snapshotId)
  )}`;
}
