// ─────────────────────────────────────────────────────────────────────────────
// Chess piece SVG loader for the analysis snippet share card.
//
// We need real piece SVGs (not Unicode glyphs) embedded inline inside the
// generated share-card SVG. The card is rasterized to PNG via an offscreen
// canvas, and external <image href="..."> references can taint the canvas or
// fail to load before drawImage fires. So we fetch each piece SVG as text,
// parse out the viewBox + inner content, and stamp them as <symbol> elements
// in the card's <defs> — referenced from each square via <use>.
//
// Module-level promise cache means the 12 fetches happen at most once per
// session. Subsequent dialog opens get the cached map synchronously.
// ─────────────────────────────────────────────────────────────────────────────

export type PieceCode =
  | 'wK' | 'wQ' | 'wR' | 'wB' | 'wN' | 'wP'
  | 'bK' | 'bQ' | 'bR' | 'bB' | 'bN' | 'bP';

export interface PieceAsset {
  viewBox: string;
  inner: string;
}

export type PieceAssetMap = Record<PieceCode, PieceAsset>;

const PIECE_CODES: PieceCode[] = [
  'wK', 'wQ', 'wR', 'wB', 'wN', 'wP',
  'bK', 'bQ', 'bR', 'bB', 'bN', 'bP',
];

// Hardcoded set — see analysisSnippet card. cburnett is the standard
// Lichess default and is present at /public/piece/cburnett/. Future
// follow-up: read pieceSetAtom so the card matches the user's live board.
const PIECE_SET = 'cburnett';

let _loadPromise: Promise<PieceAssetMap> | null = null;

async function fetchPieceAsset(code: PieceCode): Promise<[PieceCode, PieceAsset]> {
  const res = await fetch(`/piece/${PIECE_SET}/${code}.svg`);
  if (!res.ok) {
    throw new Error(`Failed to load /piece/${PIECE_SET}/${code}.svg: ${res.status}`);
  }
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svgEl = doc.documentElement;
  // Defensive fallbacks: cburnett pieces use viewBox 0 0 45 45 by convention.
  const viewBox = svgEl.getAttribute('viewBox') || '0 0 45 45';
  const inner = svgEl.innerHTML;
  return [code, { viewBox, inner }];
}

export function loadPieceAssets(): Promise<PieceAssetMap> {
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    const entries = await Promise.all(PIECE_CODES.map(fetchPieceAsset));
    return Object.fromEntries(entries) as PieceAssetMap;
  })().catch(err => {
    // Reset so a retry on next dialog open isn't stuck on a stale rejection.
    _loadPromise = null;
    throw err;
  });
  return _loadPromise;
}

// Map a FEN piece letter (uppercase=white, lowercase=black) to the PieceCode.
export function fenLetterToPieceCode(letter: string): PieceCode | null {
  if (!letter) return null;
  const isWhite = letter === letter.toUpperCase();
  const prefix = isWhite ? 'w' : 'b';
  const kind = letter.toUpperCase();
  const code = `${prefix}${kind}` as PieceCode;
  return PIECE_CODES.includes(code) ? code : null;
}
