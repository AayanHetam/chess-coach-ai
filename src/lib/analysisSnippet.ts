// ─────────────────────────────────────────────────────────────────────────────
// Analysis snippet — shareable PNG of a board position + Claude's explanation.
//
// Built as an inline SVG so we can rasterize it to PNG via an offscreen canvas
// without CORS/async-load issues. Piece glyphs are inlined as <symbol> + <use>
// references — the raw piece SVG bodies are fetched once per session by
// chessPieceAssets.ts and passed in to the builder. Landscape 1200×675 matches
// the Twitter card aspect ratio for clean previews across every platform.
// ─────────────────────────────────────────────────────────────────────────────

import { fenLetterToPieceCode, PieceAssetMap } from '@/lib/chessPieceAssets';

export interface AnalysisSnippetData {
  fen: string;          // FEN of the position the message is about
  explanation: string;  // Claude's coaching text (will be truncated for the card)
  moveLabel?: string;   // optional caption, e.g. "After 12.Nf3"
}

const CARD_W = 1200;
const CARD_H = 675;
const TRUNCATE_CHARS = 240;
const WRAP_CHARS_PER_LINE = 42;
const MAX_WRAP_LINES = 6;

// Board geometry (left half of the card)
const BOARD_SIZE = 480;
const SQUARE = BOARD_SIZE / 8;
const BOARD_X = 60;
const BOARD_Y = 130;

// HTML-escape so user-supplied text is safe inline in SVG.
function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Parse the board portion of a FEN into an 8×8 grid (rank 8 → rank 1, files a→h).
// Cells are single-letter piece codes (uppercase = white, lowercase = black) or ''.
function parseFenBoard(fen: string): string[][] {
  const boardPart = fen.split(' ')[0] ?? '';
  const ranks = boardPart.split('/');
  const grid: string[][] = [];
  for (const rank of ranks) {
    const row: string[] = [];
    for (const ch of rank) {
      if (/[1-8]/.test(ch)) {
        const n = parseInt(ch, 10);
        for (let i = 0; i < n; i++) row.push('');
      } else {
        row.push(ch);
      }
    }
    // Pad/truncate to 8 in case of malformed FEN — keeps the card from collapsing.
    while (row.length < 8) row.push('');
    grid.push(row.slice(0, 8));
  }
  while (grid.length < 8) grid.push(new Array(8).fill(''));
  return grid.slice(0, 8);
}

// Greedy word-wrap into at most `maxLines` lines of `maxChars`. If the
// remaining text doesn't fit, the last line gets an ellipsis.
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let cur = '';
  let consumed = 0;
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (next.length <= maxChars) {
      cur = next;
      consumed++;
    } else {
      if (lines.length === maxLines - 1) {
        // Last line: append ellipsis if we still have words left.
        lines.push(cur);
        cur = '';
        break;
      }
      lines.push(cur);
      cur = w;
      consumed++;
    }
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (consumed < words.length && lines.length > 0) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = (last.length > maxChars - 1 ? last.slice(0, maxChars - 1) : last) + '…';
  }
  return lines;
}

function truncateForCard(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= TRUNCATE_CHARS) return clean;
  // Truncate at the last sentence boundary before the limit for a clean cut.
  const cut = clean.slice(0, TRUNCATE_CHARS);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return lastStop > TRUNCATE_CHARS * 0.6 ? cut.slice(0, lastStop + 1) : cut + '…';
}

export function buildAnalysisSnippetSvg(
  data: AnalysisSnippetData,
  pieceAssets: PieceAssetMap
): string {
  const grid = parseFenBoard(data.fen);
  const truncated = truncateForCard(data.explanation);
  const wrapped = wrapText(truncated, WRAP_CHARS_PER_LINE, MAX_WRAP_LINES);

  // Whose turn (for the position label) — second field of FEN: 'w' or 'b'.
  const toMove = (data.fen.split(' ')[1] || 'w') === 'w' ? 'White' : 'Black';

  // Build squares + pieces.
  const squares: string[] = [];
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const x = BOARD_X + file * SQUARE;
      const y = BOARD_Y + rank * SQUARE;
      const isLight = (rank + file) % 2 === 0;
      const color = isLight ? '#f0d9b5' : '#b58863';
      squares.push(`<rect x="${x}" y="${y}" width="${SQUARE}" height="${SQUARE}" fill="${color}"/>`);
    }
  }

  // <symbol> definitions for each piece type referenced from the board.
  // SVG <use href="#piece-XX"> scales the symbol's viewBox into the use's
  // width/height — no manual optical-centering offset needed.
  const pieceSymbols: string[] = [];
  for (const [code, asset] of Object.entries(pieceAssets)) {
    pieceSymbols.push(
      `<symbol id="piece-${code}" viewBox="${asset.viewBox}">${asset.inner}</symbol>`
    );
  }

  const pieces: string[] = [];
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const letter = grid[rank][file];
      const code = fenLetterToPieceCode(letter);
      if (!code) continue;
      const x = BOARD_X + file * SQUARE;
      const y = BOARD_Y + rank * SQUARE;
      pieces.push(
        `<use href="#piece-${code}" x="${x}" y="${y}" width="${SQUARE}" height="${SQUARE}"/>`
      );
    }
  }

  // Coordinate labels (a-h along the bottom, 1-8 along the right) — small,
  // tucked in the corner of each edge square so they don't fight with pieces.
  const coords: string[] = [];
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  for (let i = 0; i < 8; i++) {
    const isLight = (7 + i) % 2 === 0;
    coords.push(
      `<text x="${BOARD_X + i * SQUARE + 4}" y="${BOARD_Y + 8 * SQUARE - 4}"
        font-family="system-ui,-apple-system,sans-serif"
        font-size="11" font-weight="700"
        fill="${isLight ? '#b58863' : '#f0d9b5'}">${files[i]}</text>`
    );
    const rankLabelLight = (i + 7) % 2 === 0;
    coords.push(
      `<text x="${BOARD_X + 8 * SQUARE - 12}" y="${BOARD_Y + i * SQUARE + 14}"
        font-family="system-ui,-apple-system,sans-serif"
        font-size="11" font-weight="700"
        fill="${rankLabelLight ? '#b58863' : '#f0d9b5'}">${8 - i}</text>`
    );
  }

  // Right panel geometry
  const rightX = 620;
  const rightW = CARD_W - rightX - 60;

  const explanationLines = wrapped
    .map(
      (line, i) =>
        `<text x="${rightX + 28}" y="${330 + i * 34}"
          font-family="'Inter','SF Pro Display',system-ui,-apple-system,sans-serif"
          font-size="22" font-weight="500" fill="#e2e8f0">${escape(line)}</text>`
    )
    .join('\n        ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1120"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FF6B35"/>
      <stop offset="100%" stop-color="#FF8C42"/>
    </linearGradient>
    <filter id="boardShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="12"/>
      <feOffset dy="8"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.45"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    ${pieceSymbols.join('\n    ')}
  </defs>

  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#bg)"/>
  <circle cx="${CARD_W - 80}" cy="-60" r="240" fill="url(#accent)" opacity="0.10"/>
  <circle cx="-60" cy="${CARD_H + 60}" r="200" fill="url(#accent)" opacity="0.08"/>

  <!-- Brand strip (top) -->
  <text x="60" y="70" font-family="system-ui,-apple-system,sans-serif"
        font-size="28" font-weight="900" fill="url(#accent)" letter-spacing="2">
    Chess Masti
  </text>
  <text x="60" y="96" font-family="system-ui,-apple-system,sans-serif"
        font-size="13" fill="#94a3b8" letter-spacing="3" font-weight="700">
    COACH BREAKDOWN
  </text>

  <!-- Position label above board -->
  <text x="${BOARD_X + BOARD_SIZE / 2}" y="${BOARD_Y - 16}" text-anchor="middle"
        font-family="system-ui,-apple-system,sans-serif"
        font-size="14" font-weight="800" fill="#FF6B35" letter-spacing="3">
    ${escape(data.moveLabel?.toUpperCase() ?? `${toMove.toUpperCase()} TO MOVE`)}
  </text>

  <!-- Chessboard with shadow -->
  <g filter="url(#boardShadow)">
    <rect x="${BOARD_X - 4}" y="${BOARD_Y - 4}" width="${BOARD_SIZE + 8}" height="${BOARD_SIZE + 8}"
          rx="6" fill="#3d2817"/>
    ${squares.join('\n    ')}
    ${pieces.join('\n    ')}
    ${coords.join('\n    ')}
  </g>

  <!-- Right panel: quote bubble + CTA -->
  <g>
    <!-- Decorative quote mark -->
    <text x="${rightX + 8}" y="${260}"
          font-family="Georgia,'Times New Roman',serif"
          font-size="120" font-weight="900" fill="url(#accent)" opacity="0.5">
      &#8220;
    </text>

    <text x="${rightX + 28}" y="240" font-family="system-ui,-apple-system,sans-serif"
          font-size="14" font-weight="800" fill="#FF6B35" letter-spacing="3">
      WHAT THE COACH SAID
    </text>

    ${explanationLines}

    <!-- CTA + URL footer -->
    <line x1="${rightX + 28}" y1="${CARD_H - 130}" x2="${rightX + rightW - 28}" y2="${CARD_H - 130}"
          stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
    <text x="${rightX + 28}" y="${CARD_H - 96}"
          font-family="system-ui,-apple-system,sans-serif"
          font-size="20" font-weight="800" fill="#FF6B35">
      Read full analysis &#8594;
    </text>
    <text x="${rightX + 28}" y="${CARD_H - 64}"
          font-family="system-ui,-apple-system,sans-serif"
          font-size="14" font-weight="600" fill="#94a3b8">
      chessmasti.com &middot; free AI chess coach
    </text>
  </g>
</svg>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Share URL builders — mirror shareCard.ts patterns for consistency.
// ─────────────────────────────────────────────────────────────────────────────

const SITE_URL = 'https://chessmasti.com';

export function buildSnippetUrl(fen: string): string {
  return `${SITE_URL}/analysis?fen=${encodeURIComponent(fen)}`;
}

export function buildSnippetShareText(data: AnalysisSnippetData): string {
  const url = buildSnippetUrl(data.fen);
  return `Chess Masti just broke this position down for me — free AI coach that explains every move like a real coach, no hallucinations. See for yourself: ${url} #ChessMasti #Chess #AI`;
}

export function buildSnippetTwitterShareUrl(data: AnalysisSnippetData): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(buildSnippetShareText(data))}`;
}

export function buildSnippetLinkedInShareUrl(data: AnalysisSnippetData): string {
  // LinkedIn's share-offsite only accepts a `url` — user writes their own caption.
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(buildSnippetUrl(data.fen))}`;
}

export function buildSnippetRedditShareUrl(data: AnalysisSnippetData): string {
  const title = `Chess Masti's AI coach broke down this position for me — free, engine-grounded, no hallucinations`;
  return `https://www.reddit.com/r/chess/submit?title=${encodeURIComponent(title)}&url=${encodeURIComponent(buildSnippetUrl(data.fen))}`;
}
