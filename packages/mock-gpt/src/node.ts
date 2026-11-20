/**
 * `./node` subpath entry: HTTP transports around a `MockGPT` instance.
 *
 * `createMockHandler` adapts one Node request listener to `MockGPT.fetch` (usable with an
 * existing `node:http` server), while `createMockServer` owns a listening TCP socket plus
 * its shutdown behaviour. Both are Node-only because they use `node:http` streams.
 */
export { createMockServer, createMockHandler } from './node/server.js';
export type { ServerOptions, HandlerOptions } from './node/server.js';
