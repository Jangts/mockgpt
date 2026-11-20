/**
 * Wire-contract test for the SDK entry point.
 *
 * Binds the shared `protocolContract` suite to `MockGPT.fetch`, so the assembled SSE bytes are
 * checked against the same independent assertions used for app-owned adapters. Runs against the
 * built output in `dist/`, so `npm run build` must run before the tests.
 */
import { MockGPT, responses } from '../dist/esm/index.js';
import { protocolContract } from './protocol-contract.fixture.mjs';

// One-byte content and wire chunks force every frame to arrive split across reads.
protocolContract(
  'SDK fetch',
  (output) =>
    new MockGPT({
      stream: { chunkSize: 1, wireChunkSize: 1, intervalMs: 0 },
      rules: [{ generator: responses.text(output.content, output) }],
    }).fetch,
);
