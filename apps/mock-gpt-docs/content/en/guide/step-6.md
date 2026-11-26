# Step 6 · Streaming & wiring

To connect the assistant to a real model client, you need standard Chat Completions JSON or SSE wrapping. The same rules produce SSE output when the request carries `stream: true`.

```js
import { MockGPT } from '@jangts/mock-gpt';

const mock = new MockGPT({
  stream: { chunkSize: 8, intervalMs: 60 },
  rules: [{ prompt: /recommend/, generator: 'Today we recommend the signature sea-salt caramel latte with a croissant for a perfect afternoon tea.' }],
});
```

`chunkSize` controls the maximum number of code points per content delta; `intervalMs` is the SSE frame interval. Optional `wireChunkSize` further splits encoded bytes to simulate UTF-8 or SSE boundaries crossing read chunks.

## Using the fetch adapter with a model client

`mock.fetch` is bound and can be injected into model SDKs that support a custom fetch. It does not intercept global network requests or forward requests to a real model:

```js
const response = await mock.fetch('https://mock.local/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({
    model: 'demo',
    messages: [{ role: 'user', content: 'Recommend something' }],
    stream: true,
  }),
});

for await (const chunk of response.body) {
  // Incrementally decode SSE data frames.
}
```

Both `POST /v1/chat/completions` and `POST /chat/completions` are supported, for JSON and `stream: true` SSE, using the same rules.

## Standalone model API server

When the SDK does not support fetch injection, start a minimal server from the Node entry and point the base URL at it:

```js
import { createMockServer } from '@jangts/mock-gpt/node';

const server = createMockServer({ mock });
const address = await server.listen({ port: 4317 });
console.log(address.url); // http://127.0.0.1:4317
// Call await server.close() when done.
```

You can also use the CLI; the config is trusted local code:

```js
// mock.config.mjs
export default {
  rules: [{ prompt: 'hello', generator: 'Hello, welcome to Microcola Coffee!' }],
};
```

```sh
npx @jangts/mock-gpt serve --config ./mock.config.mjs
```

The model base URL defaults to `http://127.0.0.1:4317/v1`; `--host` and `--port` are configurable. The server only provides the model API and errors when no rule matches and no fallback is configured.

## Full wiring flow

```text
Rule list & generators ──► Match & generate ──► Fetch adapter / Node server ──► Model client SDK
```

Now you have streaming and wiring. The next step adds long-text summarization so the assistant can reply "Got it" to a long customer message—see [Step 7 · Summary & bullets](/en/guide/step-7).
