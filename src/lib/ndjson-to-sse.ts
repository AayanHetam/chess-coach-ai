/**
 * Transform a ReadableStream of NDJSON bytes into an SSE-formatted byte
 * stream. Empty "keep-alive" lines from Lichess become SSE comments
 * (`:keepalive`) so the connection stays warm on restrictive proxies.
 */
export function ndjsonToSseStream(
  body: ReadableStream<Uint8Array>,
  abort: AbortController
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();
      // Periodic heartbeat so long-idle streams don't get reaped by proxies.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15_000);

      try {
        // eslint-disable-next-line no-constant-condition -- stream loop: exits via `break` when reader signals done
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n');
          // Last element may be a partial line — keep it in the buffer.
          buffer = parts.pop() ?? '';

          for (const raw of parts) {
            const line = raw.trim();
            if (!line) {
              // Lichess sends blank lines as keep-alives; mirror to SSE comments.
              controller.enqueue(encoder.encode(': keepalive\n\n'));
              continue;
            }
            // Each event in SSE must be terminated with a blank line.
            controller.enqueue(encoder.encode(`data: ${line}\n\n`));
          }
        }
        // Flush anything left in the buffer.
        const tail = buffer.trim();
        if (tail) {
          controller.enqueue(encoder.encode(`data: ${tail}\n\n`));
        }
      } catch (err) {
        // Surface errors to the client as a named SSE event so the hook
        // can reconnect or bail.
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`)
        );
      } finally {
        clearInterval(heartbeat);
        abort.abort();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });
}
