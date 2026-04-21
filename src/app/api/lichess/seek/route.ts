/**
 * SSE proxy for Lichess's Board seek endpoint.
 *
 * Lichess's POST /api/board/seek is a *streaming* endpoint — the connection
 * must stay alive for the seek to remain active in the pool. Closing the
 * connection cancels the seek. We proxy it as an SSE stream with keepalive
 * heartbeats so the browser can hold the connection open via EventSource.
 *
 * Game-start notification still arrives on the global event stream, not here.
 */

import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('lichess_access_token')?.value;
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { searchParams } = new URL(request.url);
  const time = searchParams.get('time') ?? '10';
  const increment = searchParams.get('increment') ?? '0';
  const rated = searchParams.get('rated') ?? 'false';
  const color = searchParams.get('color');
  const variant = searchParams.get('variant');

  if (Number(time) < 0 || Number(increment) < 0) {
    return new Response(JSON.stringify({ error: 'Invalid time control' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const params = new URLSearchParams({ rated, time, increment });
  if (color && color !== 'random') params.append('color', color);
  if (variant && variant !== 'standard') params.append('variant', variant);

  const upstreamAbort = new AbortController();
  request.signal.addEventListener('abort', () => upstreamAbort.abort(), { once: true });

  let upstream: Response;
  try {
    upstream = await fetch('https://lichess.org/api/board/seek', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: upstreamAbort.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => upstream.statusText);
    return new Response(JSON.stringify({ error: text }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Lichess keeps this connection open until the seek is matched or cancelled.
  // We proxy it as SSE with heartbeats to keep the Vercel function alive and
  // to let the browser know the seek is still active.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15_000);

      controller.enqueue(encoder.encode('data: {"type":"seeking"}\n\n'));

      try {
        // Consume upstream body to keep the connection alive.
        // Lichess sends no meaningful data — just keeps the TCP stream open.
        const reader = upstream.body?.getReader();
        if (reader) {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        }
        // Stream ended → seek fulfilled or expired.
        controller.enqueue(encoder.encode('data: {"type":"seekDone"}\n\n'));
      } catch {
        // Aborted by user cancel or network disconnect — expected.
      } finally {
        clearInterval(heartbeat);
        upstreamAbort.abort();
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() {
      upstreamAbort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
