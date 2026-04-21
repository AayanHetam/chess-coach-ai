/**
 * SSE proxy for Lichess's per-game Board API stream.
 *
 * The first message is a `gameFull` (full game snapshot incl. players +
 * initial state), followed by a sequence of `gameState` deltas on every
 * move, clock tick, or status change. We forward each as an SSE data event
 * so the embedded board can drive its UI purely from the stream.
 *
 * See: https://lichess.org/api#tag/Board/operation/boardGameStream
 */

import { NextRequest } from 'next/server';
import { ndjsonToSseStream } from '@/lib/ndjson-to-sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;
  const accessToken = request.cookies.get('lichess_access_token')?.value;
  if (!accessToken) {
    return new Response('Not authenticated', { status: 401 });
  }
  if (!/^[a-zA-Z0-9]{8,12}$/.test(gameId)) {
    return new Response('Invalid gameId', { status: 400 });
  }

  const upstreamAbort = new AbortController();
  request.signal.addEventListener('abort', () => upstreamAbort.abort(), { once: true });

  const upstream = await fetch(`https://lichess.org/api/board/game/stream/${gameId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/x-ndjson',
    },
    signal: upstreamAbort.signal,
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(`Lichess stream failed: ${upstream.status}`, {
      status: upstream.status,
    });
  }

  return new Response(ndjsonToSseStream(upstream.body, upstreamAbort), {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
