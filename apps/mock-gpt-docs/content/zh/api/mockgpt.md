---
title: "MockGPT"
outline: [2, 3]
---

# MockGPT

核心类，保存规则快照、命中计数、随机源与调用记录；实例之间状态隔离。本文同时收录显式业务错误、响应描述标识与传输编码入口。

## Contents

| 符号 | 类别 | 说明 |
| --- | --- | --- |
| [`MockGPT`](#api-mockgpt) | 类 | Core class; construct rules, run generate() and fetch adapter, read records, reset(). |
| [`MockGPTError`](#api-mockgpterror) | 类 | Business error with code, status and details, mapped by the error-code hub and HTTP shell. |
| [`ResponseDescription`](#api-responsedescription) | 类 | Response description class branded with a Symbol.for to distinguish it from plain JSON. |
| [`routes`](#api-routes) | 常量 | Model route list: POST /chat/completions and /v1/chat/completions. |
| [`encodeModelResponse`](#api-encodemodelresponse) | 函数 | Encode a validated model request and output as Chat Completions JSON / SSE Response. |
| [`JsonValue`](#api-jsonvalue) | 类型别名 | Recursive type for JSON-serializable values. |
| [`Message`](#api-message) | 类型别名 | Read-only message structure with extensible role and content. |
| [`ModelRequest`](#api-modelrequest) | 接口 | Model request contract including model, messages, stream, etc. |
| [`GenerationInput`](#api-generationinput) | 接口 | Minimum input for generate(). |
| [`GenerationOptions`](#api-generationoptions) | 接口 | Optional arguments for generate(). |
| [`GenerationContext`](#api-generationcontext) | 接口 | Execution context passed to function generators. |
| [`Generator`](#api-generator) | 类型别名 | Generator: a static result or a function returning a result from context. |
| [`Generated`](#api-generated) | 类型别名 | Generated result: a JSON value or response description. |
| [`Rule`](#api-rule) | 接口 | Rule: matching condition and corresponding generator. |
| [`MockGPTOptions`](#api-mockgptoptions) | 接口 | MockGPT construction options. |
| [`CallRecord`](#api-callrecord) | 接口 | Call record snapshot. |


## MockGPT {#api-mockgpt}

Configurable mock model instance. Create one per test or per mock server.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
class MockGPT
```

### 构造函数


```ts
new MockGPT(options: MockGPTOptions): MockGPT
```

Validate options and snapshot every rule.

Each rule's id, prompt, model, predicate and output are validated here, so configuration
mistakes surface at construction rather than on the first request.

| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `options` | `MockGPTOptions` | 必需 | — |

**返回：** `MockGPT`

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `stats` | `{ lifecycleHttpActions?: number \| undefined; lifecycleGenerations?: number \| undefined; batchItems: number; activeOperations: number; httpActions: number; generations: number; realtimeTurns: number; activeStreams: number; activeConnections: number; }` | 必需 | 只读。Detached accounting; transport actions never imply new generations. |
| `records` | `readonly CallRecord[]` | 必需 | 只读。只读有界内存记录快照，默认最多 100 条。 |
| `counts` | `Readonly<Record<string, number>>` | 必需 | 只读。各规则命中次数。 |
| `activeRequests` | `number` | 必需 | 只读。生成中的调用数，含未消费的 SSE。 |

## ## 成员目录

| 成员 | 用途 |
| --- | --- |
| [`registerConnection`](#member-registerconnection) | Register a duplex lifetime so reset cannot invalidate a live connection. |
| [`noteRealtimeTurn`](#member-noterealtimeturn) | Observe an explicitly admitted realtime response round. |
| [`reset`](#member-reset) | 清空记录、规则计数与 seed 状态；存在活动请求时报 MOCK_ACTIVE。 |
| [`fetch`](#member-fetch) | readonly 绑定的 fetch 适配，可注入支持自定义 fetch 的模型 SDK；地址只用于路由识别，不代表远程服务。 |
| [`generate`](#member-generate) | 直接 SDK 入口，返回数据而不创建 Request／Response，不执行延迟、切片、HTTP 错误或 SSE。 |

### registerConnection {#member-registerconnection}

Instance method.

Register a duplex lifetime so reset cannot invalidate a live connection.


```ts
registerConnection(close: () => void): () => void
```

Register a duplex lifetime so reset cannot invalidate a live connection.

| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `close` | `() => void` | 必需 | — |

**返回：** `() => void`


### noteRealtimeTurn {#member-noterealtimeturn}

Instance method.

Observe an explicitly admitted realtime response round.


```ts
noteRealtimeTurn(): void
```

Observe an explicitly admitted realtime response round.

无调用参数。

**返回：** `void`


### reset {#member-reset}

Instance method.

Clear history, hit counts and the PRNG sequence.


```ts
reset(): void
```

Clear history, hit counts and the PRNG sequence.

无调用参数。

**返回：** `void`


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

| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `input` | `RequestInfo \| URL` | 必需 | — |
| `init` | `RequestInit \| undefined` | 可省略 | — |

**返回：** `Promise<Response>`


```ts
fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `input` | `string \| Request \| URL` | 必需 | — |
| `init` | `RequestInit \| undefined` | 可省略 | — |

**返回：** `Promise<Response>`


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

| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `input` | `GenerationInput` | 必需 | — |
| `{ signal = new AbortController().signal }` | `GenerationOptions` | 可省略 | — |

**返回：** `Promise<Generated>`


## MockGPTError {#api-mockgpterror}

Error type carrying a stable machine-readable code plus optional HTTP status and details.

The HTTP adapter maps `status` onto the response and serializes `code`/`details` into the
OpenAI-style error body, so codes are part of the public contract.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
class MockGPTError extends Error
```

### 构造函数


```ts
new MockGPTError(code: string, message: string, status?: number, details?: Record<string, JsonValue> | undefined): MockGPTError
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `code` | `string` | 必需 | — |
| `message` | `string` | 必需 | — |
| `status` | `number` | 可省略 | — |
| `details` | `Record<string, JsonValue> \| undefined` | 可省略 | — |

**返回：** `MockGPTError`

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `code` | `string` | 必需 | 只读。说明见类型定义。 |
| `status` | `number` | 必需 | 只读。说明见类型定义。 |
| `details` | `Record<string, JsonValue> \| undefined` | 可省略 | 只读。说明见类型定义。 |


## ResponseDescription {#api-responsedescription}

Wrapper that distinguishes a transport instruction from ordinary generator data.

`kind: 'model'` carries a `ModelOutput`, `'http'` an `HttpFault` response, and `'reject'` a
message used to simulate a network failure. Instances are recognized by brand rather than by
`instanceof` alone, so descriptors survive crossing the ESM/CJS boundary.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
class ResponseDescription
```

### 构造函数


```ts
new ResponseDescription(kind: "model" | "scenario" | "http" | "reject", value: ModelOutput | ScenarioOutput | HttpFault | string): ResponseDescription
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `kind` | `"model" \| "scenario" \| "http" \| "reject"` | 必需 | — |
| `value` | `string \| ScenarioOutput \| ModelOutput \| HttpFault` | 必需 | — |

**返回：** `ResponseDescription`

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `kind` | `"model" \| "scenario" \| "http" \| "reject"` | 必需 | 只读。说明见类型定义。 |
| `value` | `string \| ScenarioOutput \| ModelOutput \| HttpFault` | 必需 | 只读。说明见类型定义。 |


## routes {#api-routes}

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
const routes: readonly (Readonly<{ method: "POST"; path: "/chat/completions"; }> | Readonly<{ method: "POST"; path: "/v1/chat/completions"; }>)[]
```


## encodeModelResponse {#api-encodemodelresponse}

Optional app-owned codec; validation and encoding consume the same snapshots.

Thin public wrapper over `encodeModel`: re-validates identity arguments and re-snapshots both
the request and the model output, so callers that build replies themselves get identical
validation and cannot mutate the mock's state afterwards.

**导入：** `@jangts/mock-gpt`。

## 定义

### 调用


```ts
encodeModelResponse(request: ModelRequest, result: ModelOutput, id: string, created: number, signal: AbortSignal, finish: (error?: unknown, cancelled?: boolean) => void): Response
```

Optional app-owned codec; validation and encoding consume the same snapshots.

Thin public wrapper over `encodeModel`: re-validates identity arguments and re-snapshots both
the request and the model output, so callers that build replies themselves get identical
validation and cannot mutate the mock's state afterwards.

| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `request` | `ModelRequest` | 必需 | — |
| `result` | `ModelOutput` | 必需 | — |
| `id` | `string` | 必需 | — |
| `created` | `number` | 必需 | — |
| `signal` | `AbortSignal` | 必需 | — |
| `finish` | `(error?: unknown, cancelled?: boolean) => void` | 必需 | — |

**返回：** `Response`


## JsonValue {#api-jsonvalue}

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
```


## Message {#api-message}

One entry of an OpenAI chat conversation.

The runtime validates `role` against the OpenAI role set and validates the outer shape of
`content`; every other field is retained verbatim so vendor extensions flow through.

**导入：** `@jangts/mock-gpt`。

## 定义

**Type alias:** `Message`

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `role` | `string` | 必需 | `system`, `developer`, `user`, `assistant`, `tool` or `function`; anything else is rejected. |
| `content` | `unknown` | 可省略 | Text, a multimodal content-block array or null; numbers and objects are rejected. |
| `tool_calls` | `unknown` | 可省略 | Opaque tool-call array from a previous assistant turn; never interpreted here. |
| `tool_call_id` | `string \| undefined` | 可省略 | Correlates a `tool` message with the assistant tool call it answers. |


## ModelRequest {#api-modelrequest}

A normalized `/chat/completions` request, produced by `snapshotRequest`.

Optional `undefined` fields have already been dropped and `stream` is already defaulted, so
rules always observe the same shape regardless of whether the caller used `generate` or the
injected `fetch`.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface ModelRequest
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `protocol` | `string \| undefined` | 可省略 | 只读。Explicit wire identity and portable ordered input, separate from prompt text. |
| `native` | `unknown` | 可省略 | 只读。说明见类型定义。 |
| `orderedInput` | `readonly unknown[] \| undefined` | 可省略 | 只读。说明见类型定义。 |
| `toolResults` | `readonly unknown[] \| undefined` | 可省略 | 只读。说明见类型定义。 |
| `model` | `string` | 必需 | 只读。Model identifier; required, non-empty, and compared verbatim by `Rule.model`. |
| `messages` | `readonly Readonly<{ [key: string]: unknown; role: string; content?: unknown; tool_calls?: unknown; tool_call_id?: string; }>[]` | 必需 | 只读。Non-empty conversation; the last `user` message supplies the default prompt. |
| `stream` | `boolean` | 必需 | 只读。Whether the codec should emit SSE; defaulted to `false` during normalization. |
| `tools` | `readonly unknown[] \| undefined` | 可省略 | 只读。Tool schemas declared by the client; only the array shape is validated. |
| `stream_options` | `Readonly<{ include_usage?: boolean; }> \| undefined` | 可省略 | 只读。`include_usage: true` appends a terminal usage-only chunk to the stream. |


## GenerationInput {#api-generationinput}

Input of `MockGPT.generate`.

Normalized exactly like an HTTP request body, so a rule matches identically through both
entry points; only `model` and `messages` are required.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface GenerationInput
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `model` | `string` | 必需 | 只读。Model identifier used for `Rule.model` filtering. |
| `messages` | `readonly Readonly<{ [key: string]: unknown; role: string; content?: unknown; tool_calls?: unknown; tool_call_id?: string; }>[]` | 必需 | 只读。Conversation whose last `user` message becomes the prompt. |


## GenerationOptions {#api-generationoptions}

Per-call options of `MockGPT.generate`.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface GenerationOptions
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `signal` | `AbortSignal \| undefined` | 可省略 | Cancels the call before or during generation; rejection reason is preserved as-is. |


## GenerationContext {#api-generationcontext}

Everything a rule or generator may read for one accepted call.

The context is frozen; the only mutable side channel is `report`, and only while the call is
still pending.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface GenerationContext
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `request` | `ModelRequest` | 必需 | 只读。Frozen snapshot of the normalized request that matched. |
| `prompt` | `string` | 必需 | 只读。Prompt selected by `selectPrompt`; default is the text of the last `user` message. |
| `match` | `RegExpMatchArray \| null` | 必需 | 只读。Match of the matched rule's regular expression, or null for string/fallback rules. |
| `callIndex` | `number` | 必需 | 只读。1-based sequence number of this call across the instance lifetime; reset by `reset`. |
| `ruleIndex` | `number` | 必需 | 只读。1-based hit count of the matched rule, or the fallback hit count for fallback calls. |
| `signal` | `AbortSignal` | 必需 | 只读。Signal for the current call; also aborts when the transport is cancelled. |
| `random` | `() => number` | 必需 | 只读。Per-call deterministic PRNG in [0, 1), derived from the instance seed and call order. |
| `clock` | `() => number` | 必需 | 只读。Millisecond timestamp from the configured clock; throws if the clock is not synchronous. |
| `report` | `(metadata: Record<string, JsonValue>) => void` | 必需 | 只读。Bounded diagnostic data; never inserted into model content. |


## Generator {#api-generator}

A rule's output: either a fixed value (deep-copied and frozen when the instance is built) or
a function evaluated per call. A function may be async and is awaited under cancellation.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
type Generator = Generated | ((context: GenerationContext) => Generated | Promise<Generated>);
```


## Generated {#api-generated}

What a rule may produce: plain data, or a descriptor that changes transport behaviour.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
type Generated = JsonValue | ResponseDescription;
```


## Rule {#api-rule}

One ordered matching rule of a `MockGPT` instance.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface Rule
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `id` | `string \| undefined` | 可省略 | Unique label reported in `CallRecord.ruleId`; defaults to `rule-&lt;1-based position&gt;`. |
| `prompt` | `string \| RegExp \| undefined` | 可省略 | Exact prompt string or pattern tested against `GenerationContext.prompt`. |
| `model` | `string \| undefined` | 可省略 | Restricts the rule to one request model; omitted means any model. |
| `when` | `((request: ModelRequest) => boolean) \| undefined` | 可省略 | Extra predicate on the whole request; must return a boolean synchronously. |
| `generator` | `Generator` | 必需 | Value or factory used when this rule is the first match. |
| `times` | `number \| undefined` | 可省略 | Maximum accepted calls before the rule is skipped; 1-based integer, omitted means unlimited. |


## MockGPTOptions {#api-mockgptoptions}

Construction options of a `MockGPT` instance.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface MockGPTOptions
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `lifecycle` | `LifecycleOptions \| undefined` | 可省略 | Optional bounded background, batch and file resources. |
| `maxConnections` | `number \| undefined` | 可省略 | Maximum simultaneous duplex connections; default 16. |
| `rules` | `readonly Rule[]` | 必需 | Ordered rules; the first rule whose filters all pass wins, so order is significant. |
| `fallback` | `Generator \| undefined` | 可省略 | Generator used when no rule matches; absent makes an unmatched call a `MOCK_RULE_NOT_FOUND` error. |
| `selectPrompt` | `((request: ModelRequest) => string) \| undefined` | 可省略 | Overrides prompt extraction; must return a string synchronously; default is the last user text. |
| `stream` | `Pick<OutputOptions, "chunkSize" \| "intervalMs" \| "wireChunkSize"> \| undefined` | 可省略 | Defaults merged under every generated output; explicit output fields take precedence. |
| `seed` | `number \| undefined` | 可省略 | Seed for the deterministic PRNG (0-0xffffffff); default 1, so identical call sequences repeat. |
| `clock` | `(() => number) \| undefined` | 可省略 | Millisecond timestamp source for `date` generators and response `created`; must be finite. |
| `recordLimit` | `number \| undefined` | 可省略 | Ring-buffer size of `records`; 0 disables recording; max 10 000; default 100. |
| `maxBodyBytes` | `number \| undefined` | 可省略 | Maximum accepted request body in bytes for `fetch`; default 1 MiB. |
| `maxOutputChars` | `number \| undefined` | 可省略 | Maximum generated content in code points plus serialized tool calls; default 1 000 000. |


## CallRecord {#api-callrecord}

Detached snapshot of one accepted call, exposed through `MockGPT.records`.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface CallRecord
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `id` | `string` | 必需 | Wire-visible completion id in the form `chatcmpl-mock-&lt;index&gt;`; reused by the HTTP codec. |
| `index` | `number` | 必需 | 1-based call sequence within the instance; monotonically increasing until `reset`. |
| `model` | `string` | 必需 | Model from the matched request. |
| `path` | `string \| undefined` | 可省略 | Request path when served through `fetch`; absent for `generate` calls. |
| `ruleId` | `string \| undefined` | 可省略 | Id of the matched rule; absent for fallback calls. |
| `fallback` | `boolean` | 必需 | True when the fallback generator produced the reply. |
| `status` | `"pending" \| "completed" \| "cancelled" \| "error"` | 必需 | Terminal state; `pending` only while the call or its stream is still running. |
| `errorCode` | `string \| undefined` | 可省略 | `MOCK_*` code describing the failure or cancellation; absent on success. |
| `metadata` | `Record<string, JsonValue>` | 必需 | Diagnostic key/values from `context.report`, capped at 8192 serialized bytes; no model content. |

## ## 使用示例
### 构造实例

```js
import { MockGPT } from '@jangts/mock-gpt';
const mock = new MockGPT({ rules: [...] });
```

规则按声明顺序匹配，首个满足条件的规则执行：

```js
const mock = new MockGPT({
  seed: 42,
  rules: [
    { prompt: '你好', generator: '你好，欢迎光临小可乐咖啡！' },
    { prompt: /下单/, generator: context => ({ orderId: generators.id('order')(context) }) },
  ],
});
```

```ts
import type { Rule, MockGPTOptions, Generator, Generated } from '@jangts/mock-gpt';
```

### 直接生成 generate()

```js
const reply = await mock.generate(
  { model: 'demo', messages: [{ role: 'user', content: '你好' }] },
  { signal },
);
```

- `input`：`{ model, messages, ... }`，附加条件字段可随请求传入；
- 返回 `Generated`：字符串、原生 JSON 值，或 `ResponseDescription`；
- 返回值是独立冻结快照。

### fetch 适配

支持 `POST /v1/chat/completions` 与 `POST /chat/completions`，JSON 与 `stream: true` 的 SSE：

```js
const response = await mock.fetch('https://mock.local/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({ model: 'demo', messages: [{ role: 'user', content: '你好' }] }),
});
```

### 记录与重置

```js
console.log(mock.records);  // 只读有界内存元数据快照
console.log(mock.counts);   // 各规则命中次数
mock.reset();               // 清空记录、计数与 seed 状态
```
