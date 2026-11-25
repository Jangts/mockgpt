/** Pull-driven named SSE framing; cancellation releases pacing waits. */
import type { ScenarioOutput } from '../types.js';
import { delay, MockGPTError } from '../shared/utils.js';
export type WireEvent = { type?: string; event_type?: string; [key: string]: unknown };
export function streamEvents(
  events: readonly WireEvent[],
  options: ScenarioOutput,
  signal: AbortSignal,
  finish: (error?: unknown, cancelled?: boolean) => void,
  named = true,
): Response {
  const local = new AbortController();
  const combined = AbortSignal.any([signal, local.signal]);
  let index = 0,
    offset = 0,
    bytes: Uint8Array | undefined,
    ended = false;
  const end = (error?: unknown, cancelled = false) => {
    if (ended) return;
    ended = true;
    signal.removeEventListener('abort', abort);
    if (error !== undefined || cancelled) finish(error, cancelled);
    else finish();
  };
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const abort = () => {
    end(signal.reason, true);
    controller.error(signal.reason);
  };
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    },
    async pull(value) {
      if (ended) return;
      try {
        combined.throwIfAborted();
        if (!bytes) {
          if (options.interruptAfter !== undefined && index >= options.interruptAfter)
            throw new MockGPTError('MOCK_STREAM', 'Simulated early EOF');
          if (index === events.length) {
            end();
            value.close();
            return;
          }
          await delay(index ? (options.intervalMs ?? 0) : 0, combined);
          const event = events[index++];
          bytes = new TextEncoder().encode(
            `${named ? `event: ${event.event_type ?? event.type}\n` : ''}data: ${JSON.stringify(event)}\n\n`,
          );
          offset = 0;
        }
        const next = Math.min(bytes.length, offset + (options.wireChunkSize ?? bytes.length));
        value.enqueue(bytes.slice(offset, next));
        offset = next;
        if (offset === bytes.length) bytes = undefined;
      } catch (error) {
        if (!ended) {
          end(error, combined.aborted);
          value.error(error);
        }
      }
    },
    cancel(reason) {
      local.abort(reason);
      end(reason, true);
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
}
