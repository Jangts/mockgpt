# Protocols and lifecycles

> SDK version: 0.3.0

Install `npm install @jangts/mock-gpt`; Node >=22.12 supports ESM, CommonJS and TypeScript. The root import is environment neutral; HTTP and WebSocket servers use `@jangts/mock-gpt/node`. No real model, account or credential is required. See the [README](/en/guide/step-1) for rule matching and a complete first request.

## Native requests

`mock.fetch` accepts native JSON requests. Select the path and body together; model names do not select protocols. Streaming uses `stream:true`, except Gemini's `streamGenerateContent` path. Output usage is explicitly configured synthetic accounting.

| Protocol | POST path | Native input |
| --- | --- | --- |
| Chat Completions | `/v1/chat/completions` or `/chat/completions` | `model`, `messages` |
| Responses | `/v1/responses` or `/responses` | `model`, `input` |
| Messages | `/v1/messages` or `/messages` | `model`, `messages`, `max_tokens` |
| Gemini generateContent | `/v1beta/models/{model}:generateContent` | `contents` with ordered `parts` |
| Gemini streamGenerateContent | `/v1beta/models/{model}:streamGenerateContent` | same |
| Gemini Interactions | `/v1beta/interactions` | `model`, `input` |

Gemini also accepts `/v1/` versions of these paths. `protocolCatalog` exposes codec identity, capabilities, native events and sources; its Gemini IDs are `gemini-generate-content` and `gemini-interactions`. Consumer libraries may use different configuration IDs.

Ordered output capabilities: Chat accepts text/function-call; Responses and Messages additionally accept thinking/refusal/search; Gemini generateContent additionally accepts thinking/refusal/media; Interactions accepts text/function-call/thinking/media/search; its native Content/status has no distinguishable refusal or content-filter result, so these scenario requests fail explicitly with MOCK_CAPABILITY. Capability rejection preserves unsupported-item visibility rather than downgrading output. Chat requires all text items before function-call items; text after a call fails because its ordered position cannot be represented.

## One ordered scenario

```js
import { MockGPT, responses } from '@jangts/mock-gpt';
const mock = new MockGPT({ rules: [{ generator: responses.scenario({
  items: [
    { type: 'text', text: 'Checking stock.' },
    { type: 'function-call', id: 'stock-1', name: 'stock', arguments: { sku: 'demo' } },
  ],
  usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
}) }] });
const response = await mock.fetch('https://mock.invalid/v1/responses', {
  method: 'POST', body: JSON.stringify({ model: 'mock', input: 'Check stock', stream: true }),
});
console.log(await response.text()); // native SSE; no tool executes
```

`ScenarioOutput` and `ScenarioItem` are exported types. Items include text, function-call, thinking with optional signature, media reference with modality/URI, provider search with query/sources, and refusal. Use an explicit descriptor rather than a plain object, which remains ordinary JSON output. Scenario items cannot be combined with legacy `content/tools`. Explicit call/search IDs must be unique and nonempty. The full scenario JSON, including signatures and URI references, counts toward `maxOutputChars` as UTF-8 bytes; legacy outputs retain their existing character budget. `maxBodyBytes` applies to all fetch routes, independently of stored resource limits. Unsupported items fail with `MOCK_CAPABILITY`; no codec silently removes them. Media references do not fetch external bytes or encode media. Search simulates provider events, never local tool authorization or execution.

Rules see normalized `messages` plus optional `protocol`, `native`, `orderedInput` and `toolResults`. Default prompt extraction uses user text; signatures remain private structured data. Keep business rules independent of protocol. For tool loops, match tool results before a general prompt rule, return the final scenario, and let the consumer authorize and execute functions. Configured JSON output does not enforce a real model's JSON Schema.

## Optional background, Batch and files

```js
import { MockGPT, responses } from '@jangts/mock-gpt';
let now = 0;
const mock = new MockGPT({
  clock: () => now,
  lifecycle: { delayMs: 10 },
  rules: [{ generator: responses.text('done') }],
});
const accepted = await mock.fetch('https://mock.invalid/v1/responses', {
  method: 'POST', headers: { 'x-mock-scope': 'test-a' },
  body: JSON.stringify({ model: 'mock', input: 'Hello', background: true }),
});
const operation = await accepted.json();
now = 20;
for (let attempt = 0; attempt < 10; attempt++) {
  const result = await mock.fetch(`https://mock.invalid/v1/responses/${operation.id}`, {
    headers: { 'x-mock-scope': 'test-a' },
  });
  const snapshot = await result.json();
  if (snapshot.status === 'completed') {
    console.log(snapshot);
    break;
  }
  if (snapshot.status !== 'in_progress' || attempt === 9) {
    throw new Error(`Unexpected status: ${snapshot.status}`);
  }
  await new Promise(resolve => setTimeout(resolve, 0));
}
```

Background Responses and Interactions use native create/get/cancel routes. OpenAI Batch uses `/v1/batches` and `/v1/files`, Anthropic uses `/v1/messages/batches` and JSONL results, Gemini uses model `:batchGenerateContent`, batch resources and file downloads. Native payloads and result identities remain protocol-specific; associate Batch results by item ID, never array position. Gemini upload simulation supports a start request followed by one upload/finalize request. It does not implement multi-chunk resumable uploads, offset recovery or device/cloud storage.

Lifecycle is disabled unless `lifecycle` is configured. Resources belong to one MockGPT instance and synthetic scope. Default scope is `x-mock-scope` or `default`; `lifecycle.scope(request)` overrides it. This is test isolation, not application authentication. Credentials are not stored as scope.

`lifecycle.limits` defaults: 100 operations, 100 files, 100 items/batch, 16 MiB total resource bytes, 60,000 ms TTL, 1,000 reads/file. Fields are `maxOperations`, `maxFiles`, `maxItems`, `maxBytes`, `ttlMs`, `maxReads`, all positive integers. `delayMs` controls completion visibility using the supplied clock. Queries return the current snapshot without waiting for a pending generator, advancing virtual time or generating again. Expiration is checked lazily on actions; expired resources return `MOCK_RESOURCE_EXPIRED`, capacity violations `MOCK_RESOURCE_LIMIT`.

Cancellation of an HTTP wait does not cancel an accepted remote operation. Send a separate native cancel request with a fresh signal. Completed operations retain completion; cancelled operations cannot later become completed. Accepted-but-lost acknowledgement does not imply safe resubmission; available recovery follows the selected protocol's declared identity behavior. `stats` separates HTTP actions, generations, Batch items, realtime turns and active resources. `reset()` refuses active work/connections and clears terminal resources.

## Realtime and cancellation

```js
import { MockGPT, createMockDuplex } from '@jangts/mock-gpt';
const mock = new MockGPT({ rules: [{ generator: 'hello' }] });
const duplex = createMockDuplex(mock, { protocol: 'openai-realtime', model: 'mock' });
try {
  await duplex.send({ type: 'session.update', session: {} });
  const reader = duplex.frames[Symbol.asyncIterator]();
  console.log((await reader.next()).value.type); // session.updated
} finally {
  duplex.close();
}
```

`gemini-live` selects Gemini setup/clientContent/serverContent frames. With synchronous Gemini Live tools, the last outstanding result resumes the same turn and the final model reply carries turnComplete. OpenAI Realtime requires a separate response.create after submitting tool results. `send(frame, signal)` cancels that send; the options signal owns connection lifetime. The host must read `frames` and close the duplex. Defaults are 64 queued frames, 1 MiB/frame, 1,000 history messages and 1 MiB audio input; configure `maxQueuedFrames`, `maxFrameBytes`, `maxHistoryMessages`, `maxAudioBytes`. MockGPT defaults to 16 active connections (`maxConnections`).

For a real local WebSocket shell, import `createMockWebSocketServer` from `@jangts/mock-gpt/node` and call `await createMockWebSocketServer(mock, {protocol:'openai-realtime', port:0})`; connect to its `url` and finish with `await server.close()`. It defaults to loopback, 64 inbound frames and 1 MiB outbound buffered bytes (`maxInboundFrames`, `maxBufferedBytes`). `bindMockDataChannel` connects an existing datachannel-shaped host to the same duplex; it does not negotiate SDP, devices, tracks or codecs. JSON and socket simulation do not establish real media behavior.

Pass an AbortSignal to `generate(input,{signal})` or native `fetch` init. Pre-aborted calls execute no generator; admitted uses are not refunded after failure/cancellation. Streaming cancellation releases active request state. Run the `offline example` with `node node_modules/@jangts/mock-gpt/examples/multi-protocol.mjs`.
