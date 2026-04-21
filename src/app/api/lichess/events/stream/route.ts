/**
 * SSE proxy for Lichess's event stream (/api/stream/event).
 *
 * Lichess emits newline-delimited JSON; we re-frame it as Server-Sent
 * Events so browsers can consume it through the native EventSource API.
 * Each Lichess NDJSON line becomes an SSE `data:` message.
 *
 * This stream is how we learn about game starts, incoming challenges,
 * and disconnects in real time — no polling needed.
 *
 * See: https://lichess.org/api#tag/Board/operation/apiStreamEvent
 */

import { NextRequest } from 'next/server';
import { ndjsonToSseStream } from '@/lib/ndjson-to-sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('lichess_access_token')?.value;
  if (!accessToken) {
    return new Response('Not authenticated', { status: 401 });
  }

  // Kick off the upstream NDJSON stream. We use an AbortController tied to
  // the request's signal so closing the browser's EventSource propagates
  // all the way back to Lichess (they rate-limit simultaneous streams).
  const upstreamAbort = new AbortController();
  request.signal.addEventListener('abort', () => upstreamAbort.abort(), { once: true });

  const upstream = await fetch('https://lichess.org/api/stream/event', {
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

  // ReadableStream that translates NDJSON → SSE.
  const stream = ndjsonToSseStream(upstream.body, upstreamAbort);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Let Nginx/Vercel know NOT to buffer this response.
      'X-Accel-Buffering': 'no',
    },
  });
}
