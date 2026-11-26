---
title: "Response descriptions"
outline: [2, 3]
---

# Response descriptions

Explicit helpers separate text, tool calls and failures. Plain JSON fields are never guessed to be controls.

## Contents

| Symbol | Kind | Description |
| --- | --- | --- |
| [`responses`](#api-responses) | constant | Namespace of response-description helpers. |
| [`ScenarioItem`](#api-scenarioitem) | type alias | One ordered output item. |
| [`ScenarioOutput`](#api-scenariooutput) | interface | Ordered items and output options. |
| [`ToolCall`](#api-toolcall) | interface | Tool-call proposal structure. |
| [`Usage`](#api-usage) | interface | Explicit token usage. |
| [`OutputOptions`](#api-outputoptions) | interface | Output presentation and streaming options. |
| [`ModelOutput`](#api-modeloutput) | interface | Model output content and streaming options. |
| [`HttpFault`](#api-httpfault) | interface | Status and body for simulated HTTP failures. |


## responses {#api-responses}

**Import:** `@jangts/mock-gpt`。

## Definition

**Namespace:** `responses`

## ## Member index

| Member | Purpose |
| --- | --- |
| [`scenario`](#member-scenario) | Describe ordered items for a native protocol. |
| [`text`](#member-text) | Text content. |
| [`toolCalls`](#member-toolcalls) | Multiple tool calls; content is null. |
| [`httpError`](#member-httperror) | Valid HTTP error response with status 400–599. |
| [`reject`](#member-reject) | Simulates network failure; the HTTP shell closes the connection directly. |

### scenario {#member-scenario}

Create a portable ordered result, with the same framing options as text.


```ts
responses.scenario(value: ScenarioOutput): ResponseDescription
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `value` | `ScenarioOutput` | Required | — |

**Returns:** `ResponseDescription`


### text {#member-text}



```ts
responses.text(content: string, options?: OutputOptions): ResponseDescription
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `content` | `string` | Required | — |
| `options` | `OutputOptions` | Optional | — |

**Returns:** `ResponseDescription`


### toolCalls {#member-toolcalls}



```ts
responses.toolCalls(tools: readonly ToolCall[], options?: OutputOptions): ResponseDescription
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `tools` | `readonly ToolCall[]` | Required | — |
| `options` | `OutputOptions` | Optional | — |

**Returns:** `ResponseDescription`


### httpError {#member-httperror}



```ts
responses.httpError(status: number, body?: JsonValue): ResponseDescription
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `status` | `number` | Required | — |
| `body` | `JsonValue` | Optional | — |

**Returns:** `ResponseDescription`


### reject {#member-reject}

Simulate a transport failure that rejects the client call instead of answering with HTTP.


```ts
responses.reject(message?: string): ResponseDescription
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `message` | `string` | Optional | — |

**Returns:** `ResponseDescription`


## ScenarioItem {#api-scenarioitem}

Portable ordered result; signatures and provider search remain distinct from visible text.

**Import:** `@jangts/mock-gpt`。

## Definition

**Type alias:** `ScenarioItem`

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | `"search" \| "text" \| "function-call" \| "thinking" \| "media" \| "refusal"` | Required | Description见类型定义。 |


## ScenarioOutput {#api-scenariooutput}

An ordered scenario is an alternative to legacy content/tools, never an overlay.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface ScenarioOutput extends OutputOptions
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `items` | `readonly ScenarioItem[]` | Required | Description见类型定义。 |
| `finishReason` | `"length" \| "stop" \| "tool_calls" \| "content_filter" \| undefined` | Optional | Finish reason sent in the last content frame; defaults to `tool_calls` with tools, else `stop`. |
| `usage` | `Usage \| undefined` | Optional | Usage object included in non-stream replies and in the terminal usage chunk. |
| `delayMs` | `number \| undefined` | Optional | Artificial latency before the reply or first frame, in milliseconds; default 0. |
| `chunkSize` | `number \| undefined` | Optional | Maximum Unicode code points per content/tool-call delta; default 24; never splits a code point. |
| `intervalMs` | `number \| undefined` | Optional | Delay between SSE frames in milliseconds; default 0 (emit as fast as the consumer pulls). |
| `wireChunkSize` | `number \| undefined` | Optional | Optional transport-level byte chunks, independent of content/codepoint chunks. |
| `interruptAfter` | `number \| undefined` | Optional | Error the stream after this many data frames, without a success terminator. |


## ToolCall {#api-toolcall}

A tool call the mocked assistant emits instead of executing.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface ToolCall
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | `string` | Required | Function name exposed as `function.name` on the wire. |
| `arguments` | `JsonValue` | Required | Serialized into the `function.arguments` string; must be JSON-compatible. |
| `id` | `string \| undefined` | Optional | Optional; the codec derives `&lt;responseId&gt;_tool_&lt;index&gt;` when omitted. |


## Usage {#api-usage}

Token accounting reported by the OpenAI API; validated for internal consistency.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface Usage
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `prompt_tokens` | `number` | Required | Tokens attributed to the prompt. |
| `completion_tokens` | `number` | Required | Tokens attributed to the generated completion. |
| `total_tokens` | `number` | Required | Must equal `prompt_tokens + completion_tokens`, otherwise the output is rejected. |


## OutputOptions {#api-outputoptions}

Transport-level knobs of a generated response.

All values are simulated: they affect framing and timing of the mock reply, not real model
behaviour.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface OutputOptions
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `finishReason` | `"length" \| "stop" \| "tool_calls" \| "content_filter" \| undefined` | Optional | Finish reason sent in the last content frame; defaults to `tool_calls` with tools, else `stop`. |
| `usage` | `Usage \| undefined` | Optional | Usage object included in non-stream replies and in the terminal usage chunk. |
| `delayMs` | `number \| undefined` | Optional | Artificial latency before the reply or first frame, in milliseconds; default 0. |
| `chunkSize` | `number \| undefined` | Optional | Maximum Unicode code points per content/tool-call delta; default 24; never splits a code point. |
| `intervalMs` | `number \| undefined` | Optional | Delay between SSE frames in milliseconds; default 0 (emit as fast as the consumer pulls). |
| `wireChunkSize` | `number \| undefined` | Optional | Optional transport-level byte chunks, independent of content/codepoint chunks. |
| `interruptAfter` | `number \| undefined` | Optional | Error the stream after this many data frames, without a success terminator. |


## ModelOutput {#api-modeloutput}

The model-authored part of a reply, before it becomes JSON or SSE frames.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface ModelOutput extends OutputOptions
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `content` | `string \| null \| undefined` | Optional | Assistant text; `null` or omitted means no textual content (common for tool-call replies). |
| `tools` | `readonly ToolCall[] \| undefined` | Optional | Tool calls emitted by the assistant; their serialized size also counts toward limits. |
| `finishReason` | `"length" \| "stop" \| "tool_calls" \| "content_filter" \| undefined` | Optional | Finish reason sent in the last content frame; defaults to `tool_calls` with tools, else `stop`. |
| `usage` | `Usage \| undefined` | Optional | Usage object included in non-stream replies and in the terminal usage chunk. |
| `delayMs` | `number \| undefined` | Optional | Artificial latency before the reply or first frame, in milliseconds; default 0. |
| `chunkSize` | `number \| undefined` | Optional | Maximum Unicode code points per content/tool-call delta; default 24; never splits a code point. |
| `intervalMs` | `number \| undefined` | Optional | Delay between SSE frames in milliseconds; default 0 (emit as fast as the consumer pulls). |
| `wireChunkSize` | `number \| undefined` | Optional | Optional transport-level byte chunks, independent of content/codepoint chunks. |
| `interruptAfter` | `number \| undefined` | Optional | Error the stream after this many data frames, without a success terminator. |


## HttpFault {#api-httpfault}

A simulated HTTP-level failure returned instead of a model reply.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface HttpFault
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `status` | `number` | Required | HTTP status to return; validated to the 400-599 range because faults model failures. |
| `body` | `JsonValue` | Required | JSON body written verbatim, so callers can reproduce upstream error payloads. |

## ## Examples
```js
import { responses, ResponseDescription } from '@jangts/mock-gpt';
responses.text('chunked content', { chunkSize: 2, intervalMs: 10, delayMs: 50 });
responses.toolCalls([{ name: 'reserve', arguments: { seats: 2 } }]);
responses.httpError(429, { error: { message: 'limited' } });
responses.reject('simulated network failure');
```

`generators.toolCall(name, args, options?)` is equivalent to `responses.toolCalls([{ name, arguments: args }], options)`.

### Explicit construction

```js
new ResponseDescription('model', { content: '...' });
new ResponseDescription('http', { status: 429, body: { error: {} } });
new ResponseDescription('reject', 'simulated network failure');
```

### Custom transport adapter

```js
import { encodeModelResponse, responses } from '@jangts/mock-gpt';
const response = encodeModelResponse(request, responses.text('hello').value, id, created, signal, finish);
```

The encoder handles chunking, backpressure, stream intervals, tools, usage and finish frames. The adapter handles request validation, pre-first-packet delay and lifecycle.
