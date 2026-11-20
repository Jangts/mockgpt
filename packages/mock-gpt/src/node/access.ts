/**
 * `Host` header validation for the Node HTTP adapters.
 *
 * This is the trust boundary that prevents DNS-rebinding style access to a local mock: a request
 * is accepted only when its `Host` names an explicitly configured host, a name the server is
 * actually listening on, or the local socket address itself. A hostile name that merely matches
 * its own `Origin` header therefore never authorizes itself.
 */
import { isIP } from 'node:net';
import { breakWhile, MockGPTError } from '../shared/utils.js';

/**
 * Parse a host authority (name or IP, optionally with port) into a URL.
 *
 * @param value Raw `Host` header value or configured host entry.
 * @returns Parsed URL whose only meaningful part is hostname and port.
 * @throws Error when the value contains credentials, a path, a query, a fragment or separators.
 */
function authority(value: string): URL {
  const url = new URL(`http://${value}`);
  breakWhile(
    !!(url.username || url.password || url.pathname !== '/' || url.search || url.hash) ||
      /[\s\\/]/.test(value),
    'Invalid Host',
  );
  return url;
}

/**
 * Normalize configured hostnames into the set accepted by `checkHost`.
 *
 * @param values Hostnames or IP literals, with or without a port.
 * @returns Set of normalized hostnames; IPv6 literals are unwrapped to their bare address.
 * @throws MockGPTError `MOCK_CONFIG` when any entry is not a plain hostname or IP address.
 */
export function configuredHosts(values: readonly string[]): Set<string> {
  return new Set(
    values.map((value) => {
      try {
        // IPv6 literals need brackets inside a URL authority.
        return authority(isIP(value) === 6 ? `[${value}]` : value).hostname;
      } catch {
        throw new MockGPTError(
          'MOCK_CONFIG',
          'allowedHosts must contain hostnames or IP addresses',
        );
      }
    }),
  );
}
/**
 * Validate a `Host` header against everything the operator actually controls.
 *
 * Trusts configured names and the actual local socket address, never a name supplied by `Origin`.
 *
 * @param host Raw `Host` header value; absent or malformed values are rejected.
 * @param localAddress Local address of the accepted connection, used for wildcard listeners.
 * @param allowed Configured hostnames from `configuredHosts`.
 * @param listening Hostnames the server believes it is listening on.
 * @returns The normalized `host:port` authority for origin comparison.
 * @throws MockGPTError `MOCK_HOST` (status 403) when the header is malformed or not allow-listed.
 */
export function checkHost(
  host: string | undefined,
  localAddress: string | undefined,
  allowed: ReadonlySet<string>,
  listening: ReadonlySet<string>,
): string {
  let url: URL;
  try {
    url = authority(host ?? '');
  } catch {
    throw new MockGPTError('MOCK_HOST', 'Invalid Host header', 403);
  }
  const socketHosts = configuredHosts(
    // Wildcard listeners report the concrete interface address instead of the requested host.
    // IPv4-mapped IPv6 addresses (dual-stack sockets) are compared as their IPv4 form.
    localAddress ? [localAddress.replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, '$1')] : [],
  );
  breakWhile(
    !(allowed.has(url.hostname) || listening.has(url.hostname) || socketHosts.has(url.hostname)),
    () => new MockGPTError('MOCK_HOST', 'Host not allowed', 403),
  );
  // Return the authority (host and port) so same-origin checks compare exactly what the client
  // sent.
  return url.host;
}
