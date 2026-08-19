import { NextRequest, NextResponse } from 'next/server';
import { theoryCorpus, theoryFor } from '@/lib/theory/wikibooksTheory';

/**
 * "What does the book say about this position?"
 *
 * Server-side because the corpus is read from disk with `fs` — a megabyte of
 * JSON in a page bundle is how this repo has broken Vercel builds before.
 *
 * Deliberately NOT folded into /api/master-ideas even though the two are asked
 * about the same positions. They are different sources answering different
 * questions — what strong players DO, and what the book SAYS — and keeping them
 * apart means a corpus that fails to load costs the answer it owns rather than
 * both of them.
 *
 * Unauthenticated, like /api/master-ideas: a read of a public, openly licensed
 * text that reveals nothing about anybody.
 */

export const runtime = 'nodejs';

/** A report asks about a handful of positions; more than this is not a UI. */
const MAX_POSITIONS = 12;

export async function POST(req: NextRequest) {
  let body: { fens?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const fens = Array.isArray(body.fens) ? body.fens : null;
  if (!fens || fens.length === 0) {
    return NextResponse.json({ error: 'fens must be a non-empty array.' }, { status: 400 });
  }
  if (fens.length > MAX_POSITIONS) {
    return NextResponse.json(
      { error: `At most ${MAX_POSITIONS} positions per request.` },
      { status: 400 }
    );
  }

  // Positional, so a caller pairs answers back to questions by index. A missing
  // entry is null rather than omitted — "the book has nothing here" is an
  // answer, and a shorter array would silently misalign the rest.
  const theory = fens.map(fen => {
    if (typeof fen !== 'string') return null;
    try {
      return theoryFor(fen);
    } catch {
      return null;
    }
  });

  return NextResponse.json({ theory, corpus: theoryCorpus() });
}
