// ─────────────────────────────────────────────────────────────────────────────
// Share card — football-sticker style PNG renderer for a scouted player.
//
// The card is composed entirely as an inline SVG string (no external assets),
// which we render to an offscreen canvas and export as PNG. This sidesteps the
// html2canvas dependency and guarantees a crisp, transparent-free image.
// ─────────────────────────────────────────────────────────────────────────────

import { ProfileSnapshot, StalkerScore } from '@/types/scout';

export interface ShareCardData {
  username: string;
  platform: 'chess.com' | 'lichess';
  profile: ProfileSnapshot;
  stalker: StalkerScore;
  topOpening?: {
    eco: string;
    name: string;
  };
}

const CARD_W = 720;
const CARD_H = 1024;

// HTML-escape a string so it's safe to inline into SVG text nodes.
function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statColor(v: number): string {
  if (v >= 75) return '#22c55e';
  if (v >= 60) return '#84cc16';
  if (v >= 45) return '#f59e0b';
  return '#ef4444';
}

export function buildShareCardSvg(data: ShareCardData): string {
  const { username, platform, profile, stalker, topOpening } = data;
  const initials = username.charAt(0).toUpperCase() || '?';

  const stats = [
    { label: 'ATK', value: profile.atk },
    { label: 'DEF', value: profile.def },
    { label: 'TIME', value: profile.time },
    { label: 'MIND', value: profile.mind },
  ];

  // OVR ring geometry
  const cx = CARD_W / 2;
  const cy = 300;
  const r = 88;
  const circ = 2 * Math.PI * r;
  const ovrPct = Math.max(0, Math.min(100, profile.ovr));
  const ovrOffset = circ * (1 - ovrPct / 100);

  // Stalker gauge (3/4 arc on bottom)
  const sx = CARD_W / 2;
  const sy = 820;
  const sr = 72;
  const arcLen = 2 * Math.PI * sr * 0.75;
  const stalkerPct = Math.max(0, Math.min(100, stalker.total));
  const stalkerOffset = arcLen * (1 - stalkerPct / 100);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b1120"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FF6B35"/>
      <stop offset="100%" stop-color="#FF8C42"/>
    </linearGradient>
    <linearGradient id="avatar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="8"/>
      <feOffset dy="6"/>
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.4"/>
      </feComponentTransfer>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- background -->
  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#bg)"/>
  <!-- subtle orange blob -->
  <circle cx="${CARD_W - 60}" cy="-40" r="220" fill="url(#accent)" opacity="0.12"/>
  <circle cx="-40" cy="${CARD_H - 40}" r="180" fill="url(#accent)" opacity="0.08"/>

  <!-- Top strip: brand + platform chip -->
  <g>
    <text x="40" y="62" font-family="system-ui,-apple-system,sans-serif"
          font-size="26" font-weight="800" fill="url(#accent)" letter-spacing="2">
      ChessStalker
    </text>
    <text x="40" y="88" font-family="system-ui,-apple-system,sans-serif"
          font-size="14" fill="#94a3b8" letter-spacing="3">
      SCOUT REPORT
    </text>
    <rect x="${CARD_W - 40 - 130}" y="40" width="130" height="36" rx="18"
          fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)"/>
    <text x="${CARD_W - 40 - 65}" y="63" text-anchor="middle"
          font-family="system-ui,-apple-system,sans-serif"
          font-size="14" font-weight="700" fill="#fff" letter-spacing="1">
      ${escape(platform.toUpperCase())}
    </text>
  </g>

  <!-- OVR ring with avatar in center -->
  <g transform="translate(${cx}, ${cy})">
    <circle cx="0" cy="0" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="10"/>
    <circle cx="0" cy="0" r="${r}" fill="none" stroke="url(#accent)" stroke-width="10"
            stroke-linecap="round"
            stroke-dasharray="${circ}" stroke-dashoffset="${ovrOffset}"
            transform="rotate(-90)"/>
    <!-- avatar -->
    <circle cx="0" cy="0" r="${r - 16}" fill="url(#avatar)"/>
    <text x="0" y="20" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif"
          font-size="68" font-weight="800" fill="url(#accent)">${escape(initials)}</text>
    <!-- OVR label below -->
    <text x="0" y="${r + 28}" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif"
          font-size="14" font-weight="700" fill="#94a3b8" letter-spacing="3">OVR</text>
    <text x="0" y="${r + 60}" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif"
          font-size="40" font-weight="900" fill="#fff">${profile.ovr}</text>
  </g>

  <!-- Username + archetype -->
  <g>
    <text x="${CARD_W / 2}" y="480" text-anchor="middle"
          font-family="system-ui,-apple-system,sans-serif"
          font-size="44" font-weight="900" fill="#fff">
      ${escape(username)}
    </text>
    <rect x="${CARD_W / 2 - 110}" y="500" width="220" height="34" rx="17"
          fill="rgba(255,107,53,0.12)" stroke="rgba(255,107,53,0.4)"/>
    <text x="${CARD_W / 2}" y="523" text-anchor="middle"
          font-family="system-ui,-apple-system,sans-serif"
          font-size="15" font-weight="700" fill="#FF6B35" letter-spacing="1">
      ${escape(profile.archetype.toUpperCase())}
    </text>
    <text x="${CARD_W / 2}" y="555" text-anchor="middle"
          font-family="system-ui,-apple-system,sans-serif"
          font-size="13" fill="#94a3b8">
      ${profile.totalGames.toLocaleString()} games analyzed
      ${profile.spanDays > 0 ? ` · ${profile.spanDays} days` : ''}
    </text>
  </g>

  <!-- Stat quad: ATK / DEF / TIME / MIND -->
  <g transform="translate(${CARD_W / 2 - 280}, 590)">
    ${stats
      .map((s, i) => {
        const col = i;
        const x = col * 140;
        const color = statColor(s.value);
        return `
    <g transform="translate(${x}, 0)">
      <rect x="0" y="0" width="120" height="80" rx="12" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)"/>
      <text x="60" y="34" text-anchor="middle"
            font-family="system-ui,-apple-system,sans-serif"
            font-size="30" font-weight="800" fill="${color}">${s.value}</text>
      <text x="60" y="60" text-anchor="middle"
            font-family="system-ui,-apple-system,sans-serif"
            font-size="11" font-weight="700" fill="#94a3b8" letter-spacing="2">${s.label}</text>
      <rect x="14" y="72" width="92" height="3" rx="1.5" fill="${color}" opacity="0.6"/>
    </g>`;
      })
      .join('')}
  </g>

  <!-- Stalker gauge + text -->
  <g transform="translate(${sx}, ${sy}) rotate(135)">
    <circle cx="0" cy="0" r="${sr}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="12"
            stroke-linecap="round"
            stroke-dasharray="${arcLen} ${arcLen * 2}"/>
    <circle cx="0" cy="0" r="${sr}" fill="none"
            stroke="${stalker.total >= 70 ? '#ef4444' : stalker.total >= 50 ? '#FF6B35' : '#22c55e'}"
            stroke-width="12" stroke-linecap="round"
            stroke-dasharray="${arcLen} ${arcLen * 2}"
            stroke-dashoffset="${stalkerOffset}"/>
  </g>
  <g transform="translate(${sx}, ${sy})">
    <text x="0" y="6" text-anchor="middle"
          font-family="system-ui,-apple-system,sans-serif"
          font-size="40" font-weight="900" fill="#fff">${stalker.total}</text>
    <text x="0" y="30" text-anchor="middle"
          font-family="system-ui,-apple-system,sans-serif"
          font-size="12" font-weight="700" fill="#94a3b8" letter-spacing="2">STALKER</text>
  </g>

  <!-- Stalker predictability pill -->
  <g>
    <rect x="${CARD_W / 2 - 110}" y="900" width="220" height="34" rx="17"
          fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)"/>
    <text x="${CARD_W / 2}" y="923" text-anchor="middle"
          font-family="system-ui,-apple-system,sans-serif"
          font-size="14" font-weight="700" fill="#fff" letter-spacing="1">
      PREDICTABILITY · ${escape(stalker.predictability.toUpperCase())}
    </text>
  </g>

  ${
    topOpening
      ? `
  <g>
    <text x="${CARD_W / 2}" y="970" text-anchor="middle"
          font-family="system-ui,-apple-system,sans-serif"
          font-size="11" fill="#64748b" letter-spacing="2">TOP OPENING</text>
    <text x="${CARD_W / 2}" y="995" text-anchor="middle"
          font-family="system-ui,-apple-system,sans-serif"
          font-size="15" font-weight="700" fill="#cbd5e1">
      ${escape(topOpening.eco)} · ${escape(topOpening.name)}
    </text>
  </g>`
      : ''
  }
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
