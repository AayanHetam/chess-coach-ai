import { NextRequest, NextResponse } from 'next/server';
import { lookupCuratedPosition, masterCorpusMeta } from '@/data/master-openings';
import { masterIdeas, type MasterLookup } from '@/lib/master/ideas';

/**
 * "What do masters do here, and do they agree with the move we are proposing?"
 *
 * Server-side because the corpus is a 13MB file read from disk — it cannot go
 * to the browser, and it does not need to: a prepared line asks about a handful
 * of positions, so the whole report is one round trip.
 *
 * Unauthenticated, like /api/opening-explorer, and for the same reason: it is a
 * read of a public opening corpus that reveals nothing about anybody.
 */

export const runtime = 'nodejs';

/** A prepared line asks about a few positions; anything more is not a UI. */
const MAX_POSITIONS = 12;

const lookup: MasterLookup = fen => {
  const entry = lookupCuratedPosition(fen);
  if (!entry) return null;
  return {
    moves: entry.moves.map(m => ({
      san: m.san,
      count: m.count,
      white: m.white,
      draws: m.draws,
      black: m.black,
    })),
  };
};

interface RequestedPosition {
  fen?: unknown;
  yourMove?: unknown;
}

export async function POST(req: NextRequest) {
  let body: { positions?: unknown; yourColor?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const positions = Array.isArray(body.positions) ? body.positions : null;
  if (!positions || positions.length === 0) {
    return NextResponse.json({ error: 'positions must be a non-empty array.' }, { status: 400 });
  }
  if (positions.length > MAX_POSITIONS) {
    return NextResponse.json(
      { error: `At most ${MAX_POSITIONS} positions per request.` },
      { status: 400 }
    );
  }
  const yourColor = body.yourColor === 'black' ? 'black' : 'white';

  const views = positions.map((raw: RequestedPosition) => {
    if (!raw || typeof raw.fen !== 'string') return null;
    const yourMove = typeof raw.yourMove === 'string' ? raw.yourMove : undefined;
    try {
      return masterIdeas(raw.fen, lookup, yourColor, yourMove);
    } catch {
      // A malformed FEN is one bad row, not a failed request.
      return null;
    }
  });

  return NextResponse.json({ views, corpus: masterCorpusMeta() });
}
