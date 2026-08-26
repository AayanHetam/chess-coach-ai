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
// Module-level promise cache, keyed by piece set, means the 12 fetches for a
// given set happen at most once per session. Subsequent dialog opens (same
// set) get the cached map synchronously; switching sets re-fetches once and
// then caches that set too.
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

// Fallback for callers that don't have a set in hand yet. cburnett is the
// standard Lichess default and is present at /public/piece/cburnett/.
const DEFAULT_PIECE_SET = 'cburnett';

const _loadPromises = new Map<string, Promise<PieceAssetMap>>();

// Extract viewBox + inner content from raw SVG text using regex.
// We avoid DOMParser + .innerHTML because that round-trip re-serializes
// SVG markup in browser-specific ways (attribute reordering, self-closing
// vs explicit close, namespace handling) that have historically broken
// when the composite SVG is later loaded via <img src=blob:> — Chrome's
// strict "secure static SVG" parser rejects the re-serialized output.
// Reading the source bytes verbatim sidesteps the entire failure class.
const VIEWBOX_RE = /viewBox\s*=\s*"([^"]+)"/i;
const SVG_INNER_RE = /<svg[^>]*>([\s\S]*?)<\/svg>\s*$/i;

async function fetchPieceAsset(
  pieceSet: string,
  code: PieceCode
): Promise<[PieceCode, PieceAsset]> {
  const res = await fetch(`/piece/${pieceSet}/${code}.svg`);
  if (!res.ok) {
    throw new Error(`Failed to load /piece/${pieceSet}/${code}.svg: ${res.status}`);
  }
  const text = await res.text();
  // Defensive fallback: cburnett pieces use viewBox 0 0 45 45 by convention.
  // Other sets carry their own viewBox in the SVG itself (no hard dependency
  // on any specific dimensions — callers use Math.max(vbW, vbH)).
  const viewBox = text.match(VIEWBOX_RE)?.[1] ?? '0 0 45 45';
  const inner = text.match(SVG_INNER_RE)?.[1] ?? '';
  if (!inner) {
    throw new Error(`Could not extract SVG inner content for ${code}`);
  }
  return [code, { viewBox, inner }];
}

export function loadPieceAssets(
  pieceSet: string = DEFAULT_PIECE_SET
): Promise<PieceAssetMap> {
  const cached = _loadPromises.get(pieceSet);
  if (cached) return cached;
  const promise = (async () => {
    const entries = await Promise.all(
      PIECE_CODES.map(code => fetchPieceAsset(pieceSet, code))
    );
    return Object.fromEntries(entries) as PieceAssetMap;
  })().catch(err => {
    // Reset so a retry on next dialog open isn't stuck on a stale rejection.
    _loadPromises.delete(pieceSet);
    throw err;
  });
  _loadPromises.set(pieceSet, promise);
  return promise;
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
