/**
 * Node HTTP shell around a `MockGPT` instance.
 *
 * `createMockHandler` adapts a Node `IncomingMessage`/`ServerResponse` pair to `mock.fetch`: it
 * validates `Host` and `Origin`, answers CORS preflight, bounds the request body, applies a
 * per-request timeout, streams JSON or SSE bytes with backpressure, and maps failures to JSON
 * error bodies or connection teardown. `createMockServer` owns the listening TCP server and a
 * graceful, cancellable shutdown.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { MockGPT } from '../runtime/mock.js';
import { breakWhile, errorResponse, integer, MockGPTError } from '../shared/utils.js';
import { checkHost, configuredHosts } from './access.js';

/** Options shared by the standalone server and the bare request handler. */
export interface HandlerOptions {
  /** Instance whose `fetch` answers every accepted request. */
  mock: MockGPT;
  /** Maximum request body in bytes; default 1 MiB. */
  maxBodyBytes?: number;
  /** Deadline for one request including streaming, in milliseconds; default 30 000. */
  requestTimeoutMs?: number;
  /** Exact origins allowed to call cross-origin; same-origin requests always pass. */
  allowedOrigins?: readonly string[];
  /** Extra hostnames accepted in `Host`; localhost, 127.0.0.1 and ::1 are always accepted. */
  allowedHosts?: readonly string[];
}

/** Options of `createMockServer`, adding shutdown behaviour. */
export interface ServerOptions extends HandlerOptions {
  /** Grace period before active requests are aborted on `close`, in milliseconds; default 1000. */
  closeTimeoutMs?: number;
}

/**
 * Read a request body with an early size check.
 *
 * `destroyOnReturn: false` keeps the iterator usable by Node's own cleanup; the size limit is
 * enforced while reading so an oversized upload is rejected without being buffered.
 *
 * @param request Incoming request.
 * @param max Maximum accepted bytes.
 * @returns Concatenated body bytes.
 * @throws MockGPTError `MOCK_BODY_LIMIT` (status 413) when the body exceeds `max`.
 */
async function bodyOf(request: IncomingMessage, max: number): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let count = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    count += chunk.length;
    if (count > max) throw new MockGPTError('MOCK_BODY_LIMIT', 'Request too large', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Build the request listener.
 *
 * @param options Handler options.
 * @param active Controllers of in-flight requests, shared with the server for shutdown.
 * @param listeningHosts Hostnames the server is listening on; populated by `createMockServer`.
 * @returns A Node request listener.
 */
function requestHandler(
  options: HandlerOptions,
  active: Set<AbortController>,
  listeningHosts: ReadonlySet<string> = new Set(),
) {
  const maxBodyBytes = integer(options.maxBodyBytes ?? 1_048_576, 'maxBodyBytes', 1);
  const timeout = integer(options.requestTimeoutMs ?? 30_000, 'requestTimeoutMs', 1);
  const allowedHosts = configuredHosts([
    // Loopback names are always trusted; anything else must be configured explicitly.
    'localhost',
    '127.0.0.1',
    '::1',
    ...(options.allowedHosts ?? []),
  ]);
  /**
   * Write a `Response` (status, headers, streamed body) to the Node response.
   *
   * @param response Outgoing Node response.
   * @param result Response produced by `mock.fetch`.
   * @param signal Aborts the copy when the request is cancelled or times out.
   */
  async function respond(response: ServerResponse, result: Response, signal: AbortSignal) {
    response.writeHead(result.status, Object.fromEntries(result.headers));
    if (result.body) {
      const reader = result.body.getReader();
      try {
        while (true) {
          signal.throwIfAborted();
          const next = await reader.read();
          if (next.done) break;
          // Respect TCP backpressure so an unconsumed SSE stream does not buffer in memory.
          if (!response.write(next.value)) await once(response, 'drain', { signal });
        }
      } finally {
        // Cancels an unfinished SSE stream, which in turn finishes the call record.
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
    response.end();
  }
  return (incoming: IncomingMessage, outgoing: ServerResponse) => {
    const controller = new AbortController();
    // Registered before any await so `close()` can abort this request at any stage.
    active.add(controller);
    const timeoutHandle = setTimeout(
      () => controller.abort(new MockGPTError('MOCK_TIMEOUT', 'Request timed out', 408)),
      timeout,
    );
    const abort = () => {
      // `writableFinished` distinguishes a normal end of response from a dropped client.
      if (!outgoing.writableFinished)
        controller.abort(new DOMException('Client disconnected', 'AbortError'));
    };
    incoming.on('aborted', abort);
    outgoing.on('close', abort);
    const onAbort = () => {
      // Destroy both directions so no socket is left half-open after abort.
      if (!outgoing.destroyed) outgoing.destroy();
      if (!incoming.complete) incoming.destroy();
    };
    controller.signal.addEventListener('abort', onAbort, { once: true });
    const handle = async () => {
      const host = checkHost(
        incoming.headers.host,
        incoming.socket?.localAddress,
        allowedHosts,
        listeningHosts,
      );
      const origin = incoming.headers.origin;
      const protocol = (incoming.socket as { encrypted?: boolean } | undefined)?.encrypted
        ? 'https'
        : 'http';
      const sameOrigin = origin === `${protocol}://${host}`;
      if (origin && !sameOrigin && !options.allowedOrigins?.includes(origin))
        throw new MockGPTError('MOCK_CORS', 'Origin not allowed', 403);
      // Only echo the caller's origin after it passed the check, and never with a wildcard.
      if (origin && (sameOrigin || options.allowedOrigins?.includes(origin))) {
        outgoing.setHeader('access-control-allow-origin', origin);
        outgoing.setHeader('vary', 'Origin');
      }
      if (incoming.method === 'OPTIONS') {
        outgoing.setHeader('access-control-allow-methods', 'POST,GET,OPTIONS');
        outgoing.setHeader('access-control-allow-headers', 'content-type,authorization');
        outgoing.writeHead(204);
        outgoing.end();
        return;
      }
      // GET/HEAD never carry a body, which keeps health checks cheap.
      const body = ['GET', 'HEAD'].includes(incoming.method ?? '')
        ? undefined
        : await bodyOf(incoming, maxBodyBytes);
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers))
        if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      // The host was validated above; the placeholder authority only satisfies URL parsing and
      // preserves the original path (including query) for route matching.
      const result = await options.mock.fetch(
        new Request(`http://localhost${incoming.url ?? '/'}`, {
          method: incoming.method,
          headers,
          ...(body ? { body: body as BodyInit } : {}),
          signal: controller.signal,
        }),
      );
      await respond(outgoing, result, controller.signal);
    };
    void handle()
      .catch(async (error) => {
        // A cancelled or already-destroyed response needs no error payload.
        if (controller.signal.aborted || outgoing.destroyed) return;
        // Network faults close the socket instead of pretending to be an HTTP 500.
        if (error instanceof MockGPTError && error.code === 'MOCK_NETWORK') {
          outgoing.destroy();
          return;
        }
        // Mid-stream failures can only terminate the connection; headers may already be sent.
        if (outgoing.headersSent) {
          outgoing.destroy(error instanceof Error ? error : undefined);
          return;
        }
        try {
          await respond(outgoing, errorResponse(error), controller.signal);
        } catch {
          outgoing.destroy();
        }
      })
      .finally(() => {
        clearTimeout(timeoutHandle);
        active.delete(controller);
        // Listener cleanup also keeps long-lived test processes from warning about leaks.
        incoming.off('aborted', abort);
        outgoing.off('close', abort);
        controller.signal.removeEventListener('abort', onAbort);
      });
  };
}

/**
 * Create a bare Node request listener backed by the mock.
 *
 * @param options Handler options; the mock instance is required.
 * @returns Listener suitable for `http.createServer` or an existing server's request event.
 */
export function createMockHandler(options: HandlerOptions) {
  return requestHandler(options, new Set());
}

/**
 * Create a self-contained mock HTTP server with explicit `listen`/`close` control.
 *
 * No UI or static assets are served: only the model routes answer, everything else is a 404.
 *
 * @param options Server options, including the mock instance and shutdown grace period.
 * @returns Control handle exposing `listen` and `close`.
 * @throws MockGPTError `MOCK_CONFIG` when a numeric option is out of range.
 */
export function createMockServer(options: ServerOptions) {
  const closeTimeout = integer(options.closeTimeoutMs ?? 1000, 'closeTimeoutMs', 1);
  const active = new Set<AbortController>();
  const listeningHosts = new Set<string>();
  const server = createServer(requestHandler(options, active, listeningHosts));
  // In-flight lifecycle promises make concurrent calls share one outcome instead of racing.
  let opening: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  return {
    /**
     * Start listening and report the bound address.
     *
     * @param address Optional bind address; defaults to 127.0.0.1 and port 4317.
     * @returns The bound host, port and a ready-to-use `http` URL; IPv6 hosts are bracketed.
     * @throws MockGPTError `MOCK_ACTIVE` when the server is starting, already listening or closing.
     * @throws MockGPTError `MOCK_CONFIG` when the port is outside 0-65535.
     * @throws The underlying socket error when binding fails (for example a port conflict).
     */
    async listen({ host = '127.0.0.1', port = 4317 }: { host?: string; port?: number } = {}) {
      integer(port, 'port', 0, 65535);
      breakWhile(
        !!opening || !!closing || server.listening,
        () => new MockGPTError('MOCK_ACTIVE', 'Mock server is starting, listening or closing'),
      );
      // Wildcard listeners accept any interface address, so no concrete name can be pre-approved;
      // `checkHost` then falls back to the actual local socket address.
      const names = ['0.0.0.0', '::'].includes(host) ? new Set<string>() : configuredHosts([host]);
      listeningHosts.clear();
      for (const name of names) listeningHosts.add(name);
      opening = new Promise<void>((resolve, reject) => {
        const fail = (error: unknown) => {
          server.off('error', fail);
          reject(error);
        };
        server.once('error', fail);
        try {
          server.listen(port, host, () => {
            server.off('error', fail);
            resolve();
          });
        } catch (error) {
          // Synchronous bind failures (invalid arguments) never emit `error`.
          fail(error);
        }
      });
      try {
        await opening;
      } finally {
        opening = undefined;
      }
      const address = server.address();
      // A closed server or a Unix socket has no TCP address to report.
      if (!address || typeof address === 'string') throw new Error('No TCP address');
      return {
        host: address.address,
        port: address.port,
        url: `http://${address.family === 'IPv6' ? `[${address.address}]` : address.address}:${address.port}`,
      };
    },
    /**
     * Stop accepting connections and cancel whatever is still running.
     *
     * Concurrent calls share the same shutdown promise. Requests get `closeTimeoutMs` to finish
     * before active controllers are aborted and remaining connections are closed.
     *
     * @returns Resolves once the server has fully stopped; a no-op when it never listened.
     * @throws The underlying close error, if any.
     */
    async close() {
      if (closing) return closing;
      // Capture a startup in progress so `close` waits for it instead of racing the bind.
      const pending = opening;
      closing = (async () => {
        if (pending) await pending.catch(() => {});
        if (!server.listening) return;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            // Force-finish streams that outlive the grace period, then drop remaining sockets.
            for (const controller of active)
              controller.abort(new DOMException('Server closed', 'AbortError'));
            server.closeAllConnections();
          }, closeTimeout);
          server.close((error) => {
            clearTimeout(timer);
            if (error) reject(error);
            else resolve();
          });
        });
      })();
      try {
        await closing;
      } finally {
        closing = undefined;
      }
    },
  };
}
