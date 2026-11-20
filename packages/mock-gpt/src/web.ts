/**
 * `./web` subpath entry: remote page retrieval used as a text source.
 *
 * `sources.web` turns a real (or injected offline) page into extracted plain text that the
 * text generators can summarize or quote; `isPublicAddress` exposes the SSRF destination
 * policy for callers that need to pre-check an address. The actual transport lives in
 * `sources/http.ts` and runs only on Node, which is why it is not re-exported from the root.
 */
export { sources, isPublicAddress } from './sources/web.js';
export type { WebOptions, LoadedPage, WebProfile } from './sources/web.js';
