/**
 * Guarded HTTP transport for the web text source (Node-only).
 *
 * Retrieval is deliberately narrow: only `http`/`https` URLs without embedded credentials, every
 * DNS answer must be a public address, connections are pinned to the validated address, redirects
 * are re-validated and capped, and both compressed and decompressed bodies are byte-limited.
 * Failures are mapped onto stable `MOCK_WEB_*` codes so the generator layer can decide whether a
 * fallback applies. This module never reads cookies, environment proxies or user credentials.
 */
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { Readable } from 'node:stream';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';
import { abortable, breakWhile, MockGPTError, readBytes } from '../shared/utils.js';

/** A fetched page body plus the metadata needed for decoding and diagnostics. */
export interface LoadedPage {
  /** Body bytes, still compressed only if the caller bypassed this transport. */
  bytes: Uint8Array;
  /**
   * Final URL after redirects; may contain a query string, so callers must bound it before
   * reporting.
   */
  url: string;
  /** Raw `content-type` header, possibly empty and possibly including a charset parameter. */
  contentType: string;
  /** HTTP status; omitted by existing custom loaders means 200. */ status?: number;
}

/** One resolved address of a page host, pinned into the socket lookup. */
export interface PageAddress {
  /** Numeric IP address already validated as public. */
  address: string;
  /** IP family, 4 or 6, matching `dns.lookup` semantics. */
  family: number;
}

/** Coarse progress of a single retrieval attempt, reported for diagnostics. */
export interface PageProgress {
  /** Furthest stage reached: DNS, TCP connect, TLS handshake, response headers or body. */
  webStage: 'dns' | 'connect' | 'tls' | 'headers' | 'body';
  /** Raw (still compressed) bytes received so far. */
  receivedBytes: number;
  /** Upstream HTTP status once headers arrived. */
  upstreamStatus?: number;
}

/** Limits and defaults for one page retrieval. */
export interface PageRequestOptions {
  /** Decompressed body limit in bytes; the compressed body is capped by the same value. */
  maxBytes: number;
  /** Maximum number of redirects to follow before failing with `MOCK_WEB_REDIRECT`. */
  maxRedirects: number;
  /** Request headers, normally produced by `pageHeaders`. */
  headers: Readonly<Record<string, string>>;
  /** Optional object mutated in place so the caller can report partial progress on failure. */
  progress?: PageProgress;
}

const commonHeaders = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

// A fixed desktop Chrome UA reduces trivial bot rejections. It is a constant, not a claim of being
// a browser: no cookies, referrer, client hints or credentials are sent.
const browserHeaders = Object.freeze({
  ...commonHeaders,
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});

/** HTTP content retrieval uses browser-compatible headers. */
export const webHeaderProfiles = Object.freeze({
  browser: browserHeaders,
  /** @deprecated Compatibility alias for browser. */
  crawler: browserHeaders,
});

/** Name of an entry in `webHeaderProfiles`. */
export type WebProfile = keyof typeof webHeaderProfiles;

/** Headers used when no profile is requested. */
export const webRequestHeaders = webHeaderProfiles.browser;

/**
 * IPv4 ranges that must never be fetched: this-host, private, carrier-grade NAT, link-local
 * (including cloud metadata at 169.254.169.254), reserved/documentation, benchmarking and
 * multicast/reserved space.
 */
const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const)
  blocked.addSubnet(network, prefix, 'ipv4');

// IPv6 is allowed only inside global unicast (2000::/3), then carved back out for IETF protocol
// assignments and Teredo (2001::/23), documentation (2001:db8::/32) and 6to4 (2002::/16), all of
// which can be used to reach otherwise private targets.
const global6 = new BlockList();
global6.addSubnet('2000::', 3, 'ipv6');
for (const [network, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
] as const)
  blocked.addSubnet(network, prefix, 'ipv6');

/**
 * Decide whether an address is an acceptable public destination.
 *
 * @param address IPv4 or IPv6 literal; hostnames are not resolved here.
 * @returns True only for globally routable addresses outside the blocked ranges.
 */
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) return !blocked.check(address, 'ipv4');
  if (isIP(address) === 6) return global6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
  // Anything that is not a literal IP (including malformed values) is rejected.
  return false;
}

/**
 * Enforce the URL scheme and credential policy.
 *
 * @param url Destination to check.
 * @throws MockGPTError `MOCK_WEB_URL` for non-HTTP(S) schemes or embedded userinfo, because
 * credentials in a URL would be sent to the remote host and recorded.
 */
export function checkUrl(url: URL): void {
  breakWhile(
    !(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password),
    () =>
      new MockGPTError('MOCK_WEB_URL', 'Web source requires HTTP(S) without embedded credentials'),
  );
}

/**
 * Build request headers from a profile plus validated overrides.
 *
 * Only the three default header names may be overridden; this keeps cookies, authorization and
 * `Host` out of caller-supplied options.
 *
 * @param custom Override values keyed by name, case-insensitive; default is no overrides.
 * @param profile Header profile to start from; default `browser`.
 * @returns Frozen header map.
 * @throws MockGPTError `MOCK_CONFIG` for an unknown profile, an unsupported header name, an empty
 * value or a value containing CR/LF (header injection).
 */
export function pageHeaders(
  custom: Record<string, string> = {},
  profile: WebProfile = 'browser',
): Readonly<Record<string, string>> {
  breakWhile(
    !Object.hasOwn(webHeaderProfiles, profile),
    () => new MockGPTError('MOCK_CONFIG', 'Unknown web request profile'),
  );
  const result: Record<string, string> = { ...webHeaderProfiles[profile] };
  for (const [key, value] of Object.entries(custom)) {
    const name = key.toLowerCase();
    breakWhile(
      !(
        Object.hasOwn(webRequestHeaders, name) &&
        typeof value === 'string' &&
        value.trim().length &&
        !/[\r\n]/.test(value)
      ),
      () =>
        new MockGPTError(
          'MOCK_CONFIG',
          'Web headers support nonempty Accept, Accept-Language and User-Agent values only',
        ),
    );
    result[name] = value;
  }
  return Object.freeze(result);
}

// Errors that mean "this address was unreachable before any HTTP exchange", where trying the next
// validated address is safe. TLS and protocol failures are intentionally absent.
const connectionFailures = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EAFNOSUPPORT',
]);

/**
 * Try already-validated addresses in order until one connects.
 *
 * Only connection establishment errors try another already-validated address; HTTP failures never
 * do. At most four addresses are attempted.
 *
 * @param addresses Public addresses from DNS, in resolver order.
 * @param signal Cancellation source checked between attempts.
 * @param attempt Performs the request against one pinned address.
 * @returns The first successful attempt's result.
 * @throws The last connection error when every candidate fails.
 * @throws MockGPTError `MOCK_WEB_DNS` when no addresses were supplied.
 * @throws The abort reason when cancellation happens between attempts.
 */
export async function withAddressFallback<T>(
  addresses: readonly PageAddress[],
  signal: AbortSignal,
  attempt: (address: PageAddress) => Promise<T>,
): Promise<T> {
  let last: unknown;
  // Four attempts bound both latency and the number of hosts contacted for one request.
  for (const address of addresses.slice(0, 4)) {
    signal.throwIfAborted();
    try {
      return await attempt(address);
    } catch (error) {
      last = error;
      signal.throwIfAborted();
      if (!connectionFailures.has((error as NodeJS.ErrnoException)?.code ?? '')) throw error;
    }
  }
  throw last ?? new MockGPTError('MOCK_WEB_DNS', 'No usable public address');
}

/** Internal redirect marker returned instead of a page when the upstream redirected. */
interface Redirect {
  /** Absolute target resolved against the request URL; re-validated by `readPublicPage`. */
  redirect: URL;
}

/**
 * Perform one HTTP(S) GET against a pinned address, without following redirects.
 *
 * @param url Target URL; its hostname is not resolved because `lookup` is overridden.
 * @param pinned Validated address to connect to.
 * @param signal Cancellation source.
 * @param options Byte limits, headers and optional progress object.
 * @returns The page, or a redirect marker for 301/302/303/307/308 responses.
 * @throws MockGPTError `MOCK_WEB_LIMIT`, `MOCK_WEB_ENCODING`, `MOCK_WEB_READ`, `MOCK_WEB_REDIRECT`
 * or `MOCK_WEB_URL` for the corresponding failures.
 * @throws The abort reason when the signal fires while connecting or reading.
 */
export async function requestAtAddress(
  url: URL,
  pinned: PageAddress,
  signal: AbortSignal,
  options: PageRequestOptions,
): Promise<LoadedPage | Redirect> {
  return new Promise((resolve, reject) => {
    const progress = options.progress;
    if (progress) {
      progress.webStage = 'connect';
      progress.receivedBytes = 0;
      delete progress.upstreamStatus;
    }
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        signal,
        // No connection pooling: each page is an isolated exchange with its own deadline.
        agent: false,
        headers: { ...options.headers, 'accept-encoding': 'gzip, deflate, br' },
        lookup: (_host, lookupOptions, callback) => {
          // Ignore DNS entirely and connect to the address that was already policy-checked.
          if (lookupOptions.all) callback(null, [pinned]);
          else callback(null, pinned.address, pinned.family);
        },
      },
      (response) => {
        // Having received an HTTP response, transport errors below must not trigger a second GET.
        const fail = (error: unknown) => {
          if (error instanceof MockGPTError && error.code === 'MOCK_BODY_LIMIT') {
            reject(
              new MockGPTError('MOCK_WEB_LIMIT', 'Decompressed response exceeds byte limit', 502),
            );
            return;
          }
          reject(
            error instanceof MockGPTError
              ? error
              : new MockGPTError(
                  'MOCK_WEB_READ',
                  'Web response ended before its body could be read',
                  502,
                ),
          );
        };
        const status = response.statusCode ?? 0;
        if (progress) {
          progress.webStage = 'body';
          progress.upstreamStatus = status;
        }
        if ([301, 302, 303, 307, 308].includes(status)) {
          response.destroy();
          if (!response.headers.location) {
            reject(new MockGPTError('MOCK_WEB_REDIRECT', 'Redirect is missing a location', 502));
            return;
          }
          try {
            // Relative locations are resolved against the URL that produced them.
            resolve({ redirect: new URL(response.headers.location, url) });
          } catch {
            reject(new MockGPTError('MOCK_WEB_URL', 'Invalid redirect URL'));
          }
          return;
        }
        const decoders = { gzip: createGunzip, deflate: createInflate, br: createBrotliDecompress };
        const encoding = response.headers['content-encoding']?.trim().toLowerCase();
        const decoder =
          encoding && Object.hasOwn(decoders, encoding)
            ? decoders[encoding as keyof typeof decoders]()
            : undefined;
        if (encoding && encoding !== 'identity' && !decoder) {
          response.destroy();
          reject(new MockGPTError('MOCK_WEB_ENCODING', 'Unsupported content encoding'));
          return;
        }
        // Error pages only need a bounded prefix for verification-page diagnostics.
        const bodyLimit =
          status >= 200 && status < 300 ? options.maxBytes : Math.min(options.maxBytes, 65_536);
        let compressed = 0;
        response.on('data', (chunk) => {
          compressed += chunk.length;
          if (progress) progress.receivedBytes = compressed;
          // Compressed bytes are capped too, otherwise a small archive could expand without bound.
          if (compressed > options.maxBytes)
            response.destroy(
              new MockGPTError('MOCK_WEB_LIMIT', 'Compressed response exceeds byte limit'),
            );
        });
        const stream = decoder ? response.pipe(decoder) : response;
        if (decoder) response.on('error', (error) => decoder.destroy(error));
        const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
        const read =
          status >= 200 && status < 300
            ? readBytes(webStream, bodyLimit, signal)
            : readPrefix(webStream, bodyLimit, signal);
        read
          .then(
            (bytes) =>
              resolve({
                bytes,
                url: url.href,
                contentType: response.headers['content-type'] ?? '',
                status,
              }),
            fail,
          )
          .finally(() => {
            response.destroy();
            decoder?.destroy();
          });
      },
    );
    request.on('socket', (socket) => {
      socket.once('connect', () => {
        if (progress) progress.webStage = url.protocol === 'https:' ? 'tls' : 'headers';
      });
      if (url.protocol === 'https:')
        socket.once('secureConnect', () => {
          if (progress) progress.webStage = 'headers';
        });
    });
    let received = false;
    request.once('response', () => {
      received = true;
    });
    request.on('error', (error) =>
      reject(
        // Before a response, the raw transport error is kept so address fallback can classify it.
        // After one, the exchange can no longer be retried and becomes a read failure.
        received
          ? new MockGPTError('MOCK_WEB_READ', 'Web response connection interrupted', 502)
          : error,
      ),
    );
    request.end();
  });
}

/**
 * Read at most `limit` decompressed bytes from a stream.
 *
 * Non-2xx bodies are only inspected for diagnostics, so the remainder is discarded instead of
 * buffered or treated as a read failure.
 *
 * @param body Decompressed body stream.
 * @param limit Maximum bytes to keep.
 * @param signal Cancellation source.
 * @returns The retained prefix (possibly empty).
 */
async function readPrefix(
  body: ReadableStream<Uint8Array>,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < limit) {
      const next = await abortable(reader.read(), signal);
      if (next.done) break;
      // `subarray` keeps only the requested remainder when a chunk crosses the limit.
      const part = next.value.subarray(0, limit - size);
      chunks.push(part);
      size += part.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

/**
 * Fetch a public page, following a bounded number of redirects.
 *
 * Every DNS answer is validated before any connection is attempted, and each redirect target is
 * checked again, so a public host cannot bounce the request into a private network.
 *
 * @param initial Validated starting URL.
 * @param signal Cancellation source.
 * @param options Byte limits, redirect budget, headers and optional progress object.
 * @returns The final page body and metadata.
 * @throws MockGPTError `MOCK_WEB_TARGET` for a non-public destination, `MOCK_WEB_REDIRECT` for
 * loops or an exhausted redirect budget, plus the transport errors from `requestAtAddress`.
 * @throws The abort reason when the signal fires during resolution or transfer.
 */
export async function readPublicPage(
  initial: URL,
  signal: AbortSignal,
  options: PageRequestOptions,
): Promise<LoadedPage> {
  let url = initial;
  // Tracks visited URLs so an A-to-B-to-A redirect chain fails instead of exhausting the budget.
  const visited = new Set<string>();
  for (let redirects = 0; ; redirects++) {
    signal.throwIfAborted();
    checkUrl(url);
    if (options.progress) {
      options.progress.webStage = 'dns';
      options.progress.receivedBytes = 0;
      delete options.progress.upstreamStatus;
    }
    breakWhile(
      visited.has(url.href),
      () => new MockGPTError('MOCK_WEB_REDIRECT', 'Web redirect loop', 502),
    );
    visited.add(url.href);
    // URL hostnames keep IPv6 brackets; `isIP` and the socket lookup want the bare address.
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await abortable(lookup(hostname, { all: true, verbatim: true }), signal);
    // Reject the whole host if any answer is non-public: a mixed answer set may round-robin
    // into it.
    breakWhile(
      !(addresses.length && addresses.every((item) => isPublicAddress(item.address))),
      () =>
        new MockGPTError('MOCK_WEB_TARGET', 'Web source only permits public network destinations'),
    );
    const result = await withAddressFallback(addresses, signal, (address) =>
      requestAtAddress(url, address, signal, options),
    );
    if (!('redirect' in result)) return result;
    breakWhile(
      redirects >= options.maxRedirects,
      () => new MockGPTError('MOCK_WEB_REDIRECT', 'Web redirect limit exceeded', 502),
    );
    url = result.redirect;
  }
}
