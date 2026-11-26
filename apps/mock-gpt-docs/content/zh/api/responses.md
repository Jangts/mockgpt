---
title: "响应描述 responses"
outline: [2, 3]
---

# 响应描述 responses

显式 helper 区分文本、工具调用与故障；普通 JSON 字段不会被猜成控制项。

## Contents

| 符号 | 类别 | 说明 |
| --- | --- | --- |
| [`responses`](#api-responses) | 常量 | Namespace of response-description helpers. |
| [`ScenarioItem`](#api-scenarioitem) | 类型别名 | One ordered output item. |
| [`ScenarioOutput`](#api-scenariooutput) | 接口 | Ordered items and output options. |
| [`ToolCall`](#api-toolcall) | 接口 | Tool-call proposal structure. |
| [`Usage`](#api-usage) | 接口 | Explicit token usage. |
| [`OutputOptions`](#api-outputoptions) | 接口 | Output presentation and streaming options. |
| [`ModelOutput`](#api-modeloutput) | 接口 | Model output content and streaming options. |
| [`HttpFault`](#api-httpfault) | 接口 | Status and body for simulated HTTP failures. |


## responses {#api-responses}

**导入：** `@jangts/mock-gpt`。

## 定义

**Namespace:** `responses`

## ## 成员目录

| 成员 | 用途 |
| --- | --- |
| [`scenario`](#member-scenario) | 为原生协议声明有序回复项。 |
| [`text`](#member-text) | 文本内容。 |
| [`toolCalls`](#member-toolcalls) | 多个工具调用，content 为 null。 |
| [`httpError`](#member-httperror) | 400—599 的有效 HTTP 错误响应。 |
| [`reject`](#member-reject) | 模拟网络失败，HTTP 壳中直接关闭连接。 |

### scenario {#member-scenario}

Create a portable ordered result, with the same framing options as text.


```ts
responses.scenario(value: ScenarioOutput): ResponseDescription
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `value` | `ScenarioOutput` | 必需 | — |

**返回：** `ResponseDescription`


### text {#member-text}



```ts
responses.text(content: string, options?: OutputOptions): ResponseDescription
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `content` | `string` | 必需 | — |
| `options` | `OutputOptions` | 可省略 | — |

**返回：** `ResponseDescription`


### toolCalls {#member-toolcalls}



```ts
responses.toolCalls(tools: readonly ToolCall[], options?: OutputOptions): ResponseDescription
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `tools` | `readonly ToolCall[]` | 必需 | — |
| `options` | `OutputOptions` | 可省略 | — |

**返回：** `ResponseDescription`


### httpError {#member-httperror}



```ts
responses.httpError(status: number, body?: JsonValue): ResponseDescription
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `status` | `number` | 必需 | — |
| `body` | `JsonValue` | 可省略 | — |

**返回：** `ResponseDescription`


### reject {#member-reject}

Simulate a transport failure that rejects the client call instead of answering with HTTP.


```ts
responses.reject(message?: string): ResponseDescription
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `message` | `string` | 可省略 | — |

**返回：** `ResponseDescription`


## ScenarioItem {#api-scenarioitem}

Portable ordered result; signatures and provider search remain distinct from visible text.

**导入：** `@jangts/mock-gpt`。

## 定义

**Type alias:** `ScenarioItem`

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `type` | `"search" \| "text" \| "function-call" \| "thinking" \| "media" \| "refusal"` | 必需 | 说明见类型定义。 |


## ScenarioOutput {#api-scenariooutput}

An ordered scenario is an alternative to legacy content/tools, never an overlay.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface ScenarioOutput extends OutputOptions
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `items` | `readonly ScenarioItem[]` | 必需 | 说明见类型定义。 |
| `finishReason` | `"length" \| "stop" \| "tool_calls" \| "content_filter" \| undefined` | 可省略 | Finish reason sent in the last content frame; defaults to `tool_calls` with tools, else `stop`. |
| `usage` | `Usage \| undefined` | 可省略 | Usage object included in non-stream replies and in the terminal usage chunk. |
| `delayMs` | `number \| undefined` | 可省略 | Artificial latency before the reply or first frame, in milliseconds; default 0. |
| `chunkSize` | `number \| undefined` | 可省略 | Maximum Unicode code points per content/tool-call delta; default 24; never splits a code point. |
| `intervalMs` | `number \| undefined` | 可省略 | Delay between SSE frames in milliseconds; default 0 (emit as fast as the consumer pulls). |
| `wireChunkSize` | `number \| undefined` | 可省略 | Optional transport-level byte chunks, independent of content/codepoint chunks. |
| `interruptAfter` | `number \| undefined` | 可省略 | Error the stream after this many data frames, without a success terminator. |


## ToolCall {#api-toolcall}

A tool call the mocked assistant emits instead of executing.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface ToolCall
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `name` | `string` | 必需 | Function name exposed as `function.name` on the wire. |
| `arguments` | `JsonValue` | 必需 | Serialized into the `function.arguments` string; must be JSON-compatible. |
| `id` | `string \| undefined` | 可省略 | Optional; the codec derives `&lt;responseId&gt;_tool_&lt;index&gt;` when omitted. |


## Usage {#api-usage}

Token accounting reported by the OpenAI API; validated for internal consistency.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface Usage
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `prompt_tokens` | `number` | 必需 | Tokens attributed to the prompt. |
| `completion_tokens` | `number` | 必需 | Tokens attributed to the generated completion. |
| `total_tokens` | `number` | 必需 | Must equal `prompt_tokens + completion_tokens`, otherwise the output is rejected. |


## OutputOptions {#api-outputoptions}

Transport-level knobs of a generated response.

All values are simulated: they affect framing and timing of the mock reply, not real model
behaviour.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface OutputOptions
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `finishReason` | `"length" \| "stop" \| "tool_calls" \| "content_filter" \| undefined` | 可省略 | Finish reason sent in the last content frame; defaults to `tool_calls` with tools, else `stop`. |
| `usage` | `Usage \| undefined` | 可省略 | Usage object included in non-stream replies and in the terminal usage chunk. |
| `delayMs` | `number \| undefined` | 可省略 | Artificial latency before the reply or first frame, in milliseconds; default 0. |
| `chunkSize` | `number \| undefined` | 可省略 | Maximum Unicode code points per content/tool-call delta; default 24; never splits a code point. |
| `intervalMs` | `number \| undefined` | 可省略 | Delay between SSE frames in milliseconds; default 0 (emit as fast as the consumer pulls). |
| `wireChunkSize` | `number \| undefined` | 可省略 | Optional transport-level byte chunks, independent of content/codepoint chunks. |
| `interruptAfter` | `number \| undefined` | 可省略 | Error the stream after this many data frames, without a success terminator. |


## ModelOutput {#api-modeloutput}

The model-authored part of a reply, before it becomes JSON or SSE frames.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface ModelOutput extends OutputOptions
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `content` | `string \| null \| undefined` | 可省略 | Assistant text; `null` or omitted means no textual content (common for tool-call replies). |
| `tools` | `readonly ToolCall[] \| undefined` | 可省略 | Tool calls emitted by the assistant; their serialized size also counts toward limits. |
| `finishReason` | `"length" \| "stop" \| "tool_calls" \| "content_filter" \| undefined` | 可省略 | Finish reason sent in the last content frame; defaults to `tool_calls` with tools, else `stop`. |
| `usage` | `Usage \| undefined` | 可省略 | Usage object included in non-stream replies and in the terminal usage chunk. |
| `delayMs` | `number \| undefined` | 可省略 | Artificial latency before the reply or first frame, in milliseconds; default 0. |
| `chunkSize` | `number \| undefined` | 可省略 | Maximum Unicode code points per content/tool-call delta; default 24; never splits a code point. |
| `intervalMs` | `number \| undefined` | 可省略 | Delay between SSE frames in milliseconds; default 0 (emit as fast as the consumer pulls). |
| `wireChunkSize` | `number \| undefined` | 可省略 | Optional transport-level byte chunks, independent of content/codepoint chunks. |
| `interruptAfter` | `number \| undefined` | 可省略 | Error the stream after this many data frames, without a success terminator. |


## HttpFault {#api-httpfault}

A simulated HTTP-level failure returned instead of a model reply.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface HttpFault
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `status` | `number` | 必需 | HTTP status to return; validated to the 400-599 range because faults model failures. |
| `body` | `JsonValue` | 必需 | JSON body written verbatim, so callers can reproduce upstream error payloads. |

## ## 使用示例
```js
import { responses, ResponseDescription } from '@jangts/mock-gpt';
responses.text('分片内容', { chunkSize: 2, intervalMs: 10, delayMs: 50 });
responses.toolCalls([{ name: 'reserve', arguments: { seats: 2 } }]);
responses.httpError(429, { error: { message: 'limited' } });
responses.reject('模拟网络失败');
```

`generators.toolCall(name, args, options?)` 等价于 `responses.toolCalls([{ name, arguments: args }], options)`。

### 显式构造

```js
new ResponseDescription('model', { content: '...' });
new ResponseDescription('http', { status: 429, body: { error: {} } });
new ResponseDescription('reject', '模拟网络失败');
```

### 自建传输适配

```js
import { encodeModelResponse, responses } from '@jangts/mock-gpt';
const response = encodeModelResponse(request, responses.text('你好').value, id, created, signal, finish);
```

编码器负责分片、背压、流间隔、工具、usage 与终止帧；适配器负责请求校验、首包前延迟与生命周期。
