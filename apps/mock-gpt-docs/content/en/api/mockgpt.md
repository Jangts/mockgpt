---
title: "MockGPT"
outline: [2, 3]
---

# MockGPT

Core class holding rule snapshots, hit counts, random source and call records. Instances are isolated. This page also covers explicit business errors, response-description branding and the transport encoder entry.

## Contents

| Symbol | Kind | Description |
| --- | --- | --- |
| [`MockGPT`](#api-mockgpt) | class | Core class; construct rules, run generate() and fetch adapter, read records, reset(). |
| [`MockGPTError`](#api-mockgpterror) | class | Business error with code, status and details, mapped by the error-code hub and HTTP shell. |
| [`ResponseDescription`](#api-responsedescription) | class | Response description class branded with a Symbol.for to distinguish it from plain JSON. |
| [`routes`](#api-routes) | constant | Model route list: POST /chat/completions and /v1/chat/completions. |
| [`encodeModelResponse`](#api-encodemodelresponse) | function | Encode a validated model request and output as Chat Completions JSON / SSE Response. |
| [`JsonValue`](#api-jsonvalue) | type alias | Recursive type for JSON-serializable values. |
| [`Message`](#api-message) | type alias | Read-only message structure with extensible role and content. |
| [`ModelRequest`](#api-modelrequest) | interface | Model request contract including model, messages, stream, etc. |
| [`GenerationInput`](#api-generationinput) | interface | Minimum input for generate(). |
| [`GenerationOptions`](#api-generationoptions) | interface | Optional arguments for generate(). |
| [`GenerationContext`](#api-generationcontext) | interface | Execution context passed to function generators. |
| [`Generator`](#api-generator) | type alias | Generator: a static result or a function returning a result from context. |
| [`Generated`](#api-generated) | type alias | Generated result: a JSON value or response description. |
| [`Rule`](#api-rule) | interface | Rule: matching condition and corresponding generator. |
| [`MockGPTOptions`](#api-mockgptoptions) | interface | MockGPT construction options. |
| [`CallRecord`](#api-callrecord) | interface | Call record snapshot. |


## MockGPT {#api-mockgpt}

Configurable mock model instance. Create one per test or per mock server.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
class MockGPT
```

### Constructor


```ts
new MockGPT(options: MockGPTOptions): MockGPT
```

Validate options and snapshot every rule.

Each rule's id, prompt, model, predicate and output are validated here, so configuration
mistakes surface at construction rather than on the first request.

| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `options` | `MockGPTOptions` | Required | — |

**Returns:** `MockGPT`

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `stats` | `{ lifecycleHttpActions?: number \| undefined; lifecycleGenerations?: number \| undefined; batchItems: number; activeOperations: number; httpActions: number; generations: number; realtimeTurns: number; activeStreams: number; activeConnections: number; }` | Required | Read-only. Detached accounting; transport actions never imply new generations. |
| `records` | `readonly CallRecord[]` | Required | Read-only. Read-only bounded in-memory snapshot of call records; defaults to 100 entries. |
| `counts` | `Readonly<Record<string, number>>` | Required | Read-only. Hit count per rule. |
| `activeRequests` | `number` | Required | Read-only. Number of in-flight calls, including unconsumed SSE. |

## ## Member index

| Member | Purpose |
| --- | --- |
| [`registerConnection`](#member-registerconnection) | Register a duplex lifetime so reset cannot invalidate a live connection. |
| [`noteRealtimeTurn`](#member-noterealtimeturn) | Observe an explicitly admitted realtime response round. |
| [`reset`](#member-reset) | Clears records, rule counts and seed state; throws MOCK_ACTIVE when requests are active. |
| [`fetch`](#member-fetch) | Readonly-bound fetch adapter that can be injected into model SDKs supporting custom fetch; the URL is only for routing, not a remote service. |
| [`generate`](#member-generate) | Direct SDK entry; returns data without creating Request/Response, and does not add latency, chunking, HTTP errors or SSE. |

### registerConnection {#member-registerconnection}

Instance method.

Register a duplex lifetime so reset cannot invalidate a live connection.


```ts
registerConnection(close: () => void): () => void
```

Register a duplex lifetime so reset cannot invalidate a live connection.

| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `close` | `() => void` | Required | — |

**Returns:** `() => void`


### noteRealtimeTurn {#member-noterealtimeturn}

Instance method.

Observe an explicitly admitted realtime response round.


```ts
noteRealtimeTurn(): void
```

Observe an explicitly admitted realtime response round.

No call parameters.

**Returns:** `void`


### reset {#member-reset}

Instance method.

Clear history, hit counts and the PRNG sequence.


```ts
reset(): void
```

Clear history, hit counts and the PRNG sequence.

No call parameters.

**Returns:** `void`


### fetch {#member-fetch}

Instance method.

Bound callback suitable for injection into an SDK's fetch option.

Performs the HTTP side of the contract: route and method checks, byte-limited body reading,
request validation, then either a JSON/SSE `Response` or an OpenAI-shaped error response.
Transport faults (`responses.reject`) are rethrown as `MOCK_NETWORK` so SDKs observe a
network failure rather than an HTTP error.


```ts
fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
```

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Window/fetch)

| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `input` | `RequestInfo \| URL` | Required | — |
| `init` | `RequestInit \| undefined` | Optional | — |

**Returns:** `Promise<Response>`


```ts
fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `input` | `string \| Request \| URL` | Required | — |
| `init` | `RequestInit \| undefined` | Optional | — |

**Returns:** `Promise<Response>`


### generate {#member-generate}

Instance method.

Evaluate rules and return data. No Request, Response, delay or streaming is created.

Transport-only options in a generated descriptor (`delayMs`, `intervalMs`,
`interruptAfter`) are validated but ignored here, so SDK tests can exercise generators and
matching without simulating a network.


```ts
generate(input: GenerationInput, { signal }?: GenerationOptions): Promise<Generated>
```

Evaluate rules and return data. No Request, Response, delay or streaming is created.

Transport-only options in a generated descriptor (`delayMs`, `intervalMs`,
`interruptAfter`) are validated but ignored here, so SDK tests can exercise generators and
matching without simulating a network.

| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `input` | `GenerationInput` | Required | — |
| `{ signal = new AbortController().signal }` | `GenerationOptions` | Optional | — |

**Returns:** `Promise<Generated>`


## MockGPTError {#api-mockgpterror}

Error type carrying a stable machine-readable code plus optional HTTP status and details.

The HTTP adapter maps `status` onto the response and serializes `code`/`details` into the
OpenAI-style error body, so codes are part of the public contract.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
class MockGPTError extends Error
```

### Constructor


```ts
new MockGPTError(code: string, message: string, status?: number, details?: Record<string, JsonValue> | undefined): MockGPTError
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `code` | `string` | Required | — |
| `message` | `string` | Required | — |
| `status` | `number` | Optional | — |
| `details` | `Record<string, JsonValue> \| undefined` | Optional | — |

**Returns:** `MockGPTError`

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `code` | `string` | Required | Read-only. Description见类型定义。 |
| `status` | `number` | Required | Read-only. Description见类型定义。 |
| `details` | `Record<string, JsonValue> \| undefined` | Optional | Read-only. Description见类型定义。 |


## ResponseDescription {#api-responsedescription}

Wrapper that distinguishes a transport instruction from ordinary generator data.

`kind: 'model'` carries a `ModelOutput`, `'http'` an `HttpFault` response, and `'reject'` a
message used to simulate a network failure. Instances are recognized by brand rather than by
`instanceof` alone, so descriptors survive crossing the ESM/CJS boundary.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
class ResponseDescription
```

### Constructor


```ts
new ResponseDescription(kind: "model" | "scenario" | "http" | "reject", value: ModelOutput | ScenarioOutput | HttpFault | string): ResponseDescription
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `kind` | `"model" \| "scenario" \| "http" \| "reject"` | Required | — |
| `value` | `string \| ScenarioOutput \| ModelOutput \| HttpFault` | Required | — |

**Returns:** `ResponseDescription`

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | `"model" \| "scenario" \| "http" \| "reject"` | Required | Read-only. Description见类型定义。 |
| `value` | `string \| ScenarioOutput \| ModelOutput \| HttpFault` | Required | Read-only. Description见类型定义。 |


## routes {#api-routes}

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
const routes: readonly (Readonly<{ method: "POST"; path: "/chat/completions"; }> | Readonly<{ method: "POST"; path: "/v1/chat/completions"; }>)[]
```


## encodeModelResponse {#api-encodemodelresponse}

Optional app-owned codec; validation and encoding consume the same snapshots.

Thin public wrapper over `encodeModel`: re-validates identity arguments and re-snapshots both
the request and the model output, so callers that build replies themselves get identical
validation and cannot mutate the mock's state afterwards.

**Import:** `@jangts/mock-gpt`。

## Definition

### Call


```ts
encodeModelResponse(request: ModelRequest, result: ModelOutput, id: string, created: number, signal: AbortSignal, finish: (error?: unknown, cancelled?: boolean) => void): Response
```

Optional app-owned codec; validation and encoding consume the same snapshots.

Thin public wrapper over `encodeModel`: re-validates identity arguments and re-snapshots both
the request and the model output, so callers that build replies themselves get identical
validation and cannot mutate the mock's state afterwards.

| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `request` | `ModelRequest` | Required | — |
| `result` | `ModelOutput` | Required | — |
| `id` | `string` | Required | — |
| `created` | `number` | Required | — |
| `signal` | `AbortSignal` | Required | — |
| `finish` | `(error?: unknown, cancelled?: boolean) => void` | Required | — |

**Returns:** `Response`


## JsonValue {#api-jsonvalue}

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
```


## Message {#api-message}

One entry of an OpenAI chat conversation.

The runtime validates `role` against the OpenAI role set and validates the outer shape of
`content`; every other field is retained verbatim so vendor extensions flow through.

**Import:** `@jangts/mock-gpt`。

## Definition

**Type alias:** `Message`

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `role` | `string` | Required | `system`, `developer`, `user`, `assistant`, `tool` or `function`; anything else is rejected. |
| `content` | `unknown` | Optional | Text, a multimodal content-block array or null; numbers and objects are rejected. |
| `tool_calls` | `unknown` | Optional | Opaque tool-call array from a previous assistant turn; never interpreted here. |
| `tool_call_id` | `string \| undefined` | Optional | Correlates a `tool` message with the assistant tool call it answers. |


## ModelRequest {#api-modelrequest}

A normalized `/chat/completions` request, produced by `snapshotRequest`.

Optional `undefined` fields have already been dropped and `stream` is already defaulted, so
rules always observe the same shape regardless of whether the caller used `generate` or the
injected `fetch`.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface ModelRequest
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `protocol` | `string \| undefined` | Optional | Read-only. Explicit wire identity and portable ordered input, separate from prompt text. |
| `native` | `unknown` | Optional | Read-only. Description见类型定义。 |
| `orderedInput` | `readonly unknown[] \| undefined` | Optional | Read-only. Description见类型定义。 |
| `toolResults` | `readonly unknown[] \| undefined` | Optional | Read-only. Description见类型定义。 |
| `model` | `string` | Required | Read-only. Model identifier; required, non-empty, and compared verbatim by `Rule.model`. |
| `messages` | `readonly Readonly<{ [key: string]: unknown; role: string; content?: unknown; tool_calls?: unknown; tool_call_id?: string; }>[]` | Required | Read-only. Non-empty conversation; the last `user` message supplies the default prompt. |
| `stream` | `boolean` | Required | Read-only. Whether the codec should emit SSE; defaulted to `false` during normalization. |
| `tools` | `readonly unknown[] \| undefined` | Optional | Read-only. Tool schemas declared by the client; only the array shape is validated. |
| `stream_options` | `Readonly<{ include_usage?: boolean; }> \| undefined` | Optional | Read-only. `include_usage: true` appends a terminal usage-only chunk to the stream. |


## GenerationInput {#api-generationinput}

Input of `MockGPT.generate`.

Normalized exactly like an HTTP request body, so a rule matches identically through both
entry points; only `model` and `messages` are required.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface GenerationInput
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `model` | `string` | Required | Read-only. Model identifier used for `Rule.model` filtering. |
| `messages` | `readonly Readonly<{ [key: string]: unknown; role: string; content?: unknown; tool_calls?: unknown; tool_call_id?: string; }>[]` | Required | Read-only. Conversation whose last `user` message becomes the prompt. |


## GenerationOptions {#api-generationoptions}

Per-call options of `MockGPT.generate`.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface GenerationOptions
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `signal` | `AbortSignal \| undefined` | Optional | Cancels the call before or during generation; rejection reason is preserved as-is. |


## GenerationContext {#api-generationcontext}

Everything a rule or generator may read for one accepted call.

The context is frozen; the only mutable side channel is `report`, and only while the call is
still pending.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface GenerationContext
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `request` | `ModelRequest` | Required | Read-only. Frozen snapshot of the normalized request that matched. |
| `prompt` | `string` | Required | Read-only. Prompt selected by `selectPrompt`; default is the text of the last `user` message. |
| `match` | `RegExpMatchArray \| null` | Required | Read-only. Match of the matched rule's regular expression, or null for string/fallback rules. |
| `callIndex` | `number` | Required | Read-only. 1-based sequence number of this call across the instance lifetime; reset by `reset`. |
| `ruleIndex` | `number` | Required | Read-only. 1-based hit count of the matched rule, or the fallback hit count for fallback calls. |
| `signal` | `AbortSignal` | Required | Read-only. Signal for the current call; also aborts when the transport is cancelled. |
| `random` | `() => number` | Required | Read-only. Per-call deterministic PRNG in [0, 1), derived from the instance seed and call order. |
| `clock` | `() => number` | Required | Read-only. Millisecond timestamp from the configured clock; throws if the clock is not synchronous. |
| `report` | `(metadata: Record<string, JsonValue>) => void` | Required | Read-only. Bounded diagnostic data; never inserted into model content. |


## Generator {#api-generator}

A rule's output: either a fixed value (deep-copied and frozen when the instance is built) or
a function evaluated per call. A function may be async and is awaited under cancellation.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
type Generator = Generated | ((context: GenerationContext) => Generated | Promise<Generated>);
```


## Generated {#api-generated}

What a rule may produce: plain data, or a descriptor that changes transport behaviour.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
type Generated = JsonValue | ResponseDescription;
```


## Rule {#api-rule}

One ordered matching rule of a `MockGPT` instance.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface Rule
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string \| undefined` | Optional | Unique label reported in `CallRecord.ruleId`; defaults to `rule-&lt;1-based position&gt;`. |
| `prompt` | `string \| RegExp \| undefined` | Optional | Exact prompt string or pattern tested against `GenerationContext.prompt`. |
| `model` | `string \| undefined` | Optional | Restricts the rule to one request model; omitted means any model. |
| `when` | `((request: ModelRequest) => boolean) \| undefined` | Optional | Extra predicate on the whole request; must return a boolean synchronously. |
| `generator` | `Generator` | Required | Value or factory used when this rule is the first match. |
| `times` | `number \| undefined` | Optional | Maximum accepted calls before the rule is skipped; 1-based integer, omitted means unlimited. |


## MockGPTOptions {#api-mockgptoptions}

Construction options of a `MockGPT` instance.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface MockGPTOptions
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `lifecycle` | `LifecycleOptions \| undefined` | Optional | Optional bounded background, batch and file resources. |
| `maxConnections` | `number \| undefined` | Optional | Maximum simultaneous duplex connections; default 16. |
| `rules` | `readonly Rule[]` | Required | Ordered rules; the first rule whose filters all pass wins, so order is significant. |
| `fallback` | `Generator \| undefined` | Optional | Generator used when no rule matches; absent makes an unmatched call a `MOCK_RULE_NOT_FOUND` error. |
| `selectPrompt` | `((request: ModelRequest) => string) \| undefined` | Optional | Overrides prompt extraction; must return a string synchronously; default is the last user text. |
| `stream` | `Pick<OutputOptions, "chunkSize" \| "intervalMs" \| "wireChunkSize"> \| undefined` | Optional | Defaults merged under every generated output; explicit output fields take precedence. |
| `seed` | `number \| undefined` | Optional | Seed for the deterministic PRNG (0-0xffffffff); default 1, so identical call sequences repeat. |
| `clock` | `(() => number) \| undefined` | Optional | Millisecond timestamp source for `date` generators and response `created`; must be finite. |
| `recordLimit` | `number \| undefined` | Optional | Ring-buffer size of `records`; 0 disables recording; max 10 000; default 100. |
| `maxBodyBytes` | `number \| undefined` | Optional | Maximum accepted request body in bytes for `fetch`; default 1 MiB. |
| `maxOutputChars` | `number \| undefined` | Optional | Maximum generated content in code points plus serialized tool calls; default 1 000 000. |


## CallRecord {#api-callrecord}

Detached snapshot of one accepted call, exposed through `MockGPT.records`.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface CallRecord
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Required | Wire-visible completion id in the form `chatcmpl-mock-&lt;index&gt;`; reused by the HTTP codec. |
| `index` | `number` | Required | 1-based call sequence within the instance; monotonically increasing until `reset`. |
| `model` | `string` | Required | Model from the matched request. |
| `path` | `string \| undefined` | Optional | Request path when served through `fetch`; absent for `generate` calls. |
| `ruleId` | `string \| undefined` | Optional | Id of the matched rule; absent for fallback calls. |
| `fallback` | `boolean` | Required | True when the fallback generator produced the reply. |
| `status` | `"pending" \| "completed" \| "cancelled" \| "error"` | Required | Terminal state; `pending` only while the call or its stream is still running. |
| `errorCode` | `string \| undefined` | Optional | `MOCK_*` code describing the failure or cancellation; absent on success. |
| `metadata` | `Record<string, JsonValue>` | Required | Diagnostic key/values from `context.report`, capped at 8192 serialized bytes; no model content. |

## ## Examples
### Construction

```js
import { MockGPT } from '@jangts/mock-gpt';
const mock = new MockGPT({ rules: [...] });
```

Rules are evaluated in declared order; the first match wins:

```js
const mock = new MockGPT({
  seed: 42,
  rules: [
    { prompt: 'hello', generator: 'Hello, welcome to Microcola Coffee!' },
    { prompt: /order/, generator: context => ({ orderId: generators.id('order')(context) }) },
  ],
});
```

```ts
import type { Rule, MockGPTOptions, Generator, Generated } from '@jangts/mock-gpt';
```

### Direct generation with generate()

```js
const reply = await mock.generate(
  { model: 'demo', messages: [{ role: 'user', content: 'hello' }] },
  { signal },
);
```

- `input`: `{ model, messages, ... }`; additional condition fields can be passed with the request.
- Returns `Generated`: a string, a native JSON value, or a `ResponseDescription`.
- The return value is an independent frozen snapshot.

### Fetch adapter

Supports `POST /v1/chat/completions` and `POST /chat/completions`, JSON and SSE with `stream: true`:

```js
const response = await mock.fetch('https://mock.local/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({ model: 'demo', messages: [{ role: 'user', content: 'hello' }] }),
});
```

### Records and reset

```js
console.log(mock.records);  // read-only bounded in-memory snapshot of metadata
console.log(mock.counts);   // hit count per rule
mock.reset();               // clear records, counts and seed state
```
