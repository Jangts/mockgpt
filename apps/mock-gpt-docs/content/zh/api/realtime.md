---
title: "实时会话"
outline: [2, 3]
---

# 实时会话

选择 OpenAI Realtime 或 Gemini Live，并在测试中收发原生帧。

## Contents

| 符号 | 类别 | 说明 |
| --- | --- | --- |
| [`createMockDuplex`](#api-createmockduplex) | 函数 | Create an in-memory realtime session. |
| [`bindMockDataChannel`](#api-bindmockdatachannel) | 函数 | Attach a mock session to a host data channel. |
| [`MockDataChannel`](#api-mockdatachannel) | 接口 | Host data channel interface. |
| [`MockDuplex`](#api-mockduplex) | 接口 | Bidirectional mock session. |
| [`MockDuplexOptions`](#api-mockduplexoptions) | 接口 | Realtime protocol and session limits. |
| [`RealtimeProtocol`](#api-realtimeprotocol) | 类型别名 | Supported realtime protocol IDs. |
| [`RealtimeFrame`](#api-realtimeframe) | 类型别名 | A native JSON realtime frame. |


## createMockDuplex {#api-createmockduplex}

Create a server-side duplex. Explicit response requests alone admit a new model generation.

**导入：** `@jangts/mock-gpt`。

## 定义

### 调用


```ts
createMockDuplex(mock: RealtimeMock, options: MockDuplexOptions): MockDuplex
```

Create a server-side duplex. Explicit response requests alone admit a new model generation.

| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `mock` | `RealtimeMock` | 必需 | — |
| `options` | `MockDuplexOptions` | 必需 | — |

**返回：** `MockDuplex`


## bindMockDataChannel {#api-bindmockdatachannel}

**导入：** `@jangts/mock-gpt`。

## 定义

### 调用


```ts
bindMockDataChannel(mock: RealtimeMock, channel: MockDataChannel, options: MockDuplexOptions & { maxBufferedBytes?: number; maxInboundFrames?: number; }): { duplex: MockDuplex; close: () => void; }
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `mock` | `RealtimeMock` | 必需 | — |
| `channel` | `MockDataChannel` | 必需 | — |
| `options` | `MockDuplexOptions & { maxBufferedBytes?: number; maxInboundFrames?: number; }` | 必需 | — |

**返回：** `{ duplex: MockDuplex; close: () => void; }`


## MockDataChannel {#api-mockdatachannel}

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface MockDataChannel
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `bufferedAmount` | `number` | 必需 | 只读。说明见类型定义。 |
| `readyState` | `string` | 必需 | 只读。说明见类型定义。 |
| `send` | `(data: string) => void` | 必需 | 说明见类型定义。 |
| `close` | `() => void` | 必需 | 说明见类型定义。 |
| `addEventListener` | `(type: string, listener: (event: any) => void) => void` | 必需 | 说明见类型定义。 |
| `removeEventListener` | `(type: string, listener: (event: any) => void) => void` | 必需 | 说明见类型定义。 |


## MockDuplex {#api-mockduplex}

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface MockDuplex
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `send` | `(frame: RealtimeFrame, signal?: AbortSignal) => Promise<void>` | 必需 | 说明见类型定义。 |
| `frames` | `AsyncIterable<Readonly<Record<string, any>>>` | 必需 | 说明见类型定义。 |
| `close` | `() => void` | 必需 | 说明见类型定义。 |
| `closed` | `boolean` | 必需 | 只读。说明见类型定义。 |
| `generation` | `number` | 必需 | 只读。说明见类型定义。 |


## MockDuplexOptions {#api-mockduplexoptions}

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface MockDuplexOptions
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `protocol` | `RealtimeProtocol` | 必需 | 说明见类型定义。 |
| `model` | `string \| undefined` | 可省略 | 说明见类型定义。 |
| `maxQueuedFrames` | `number \| undefined` | 可省略 | 说明见类型定义。 |
| `maxFrameBytes` | `number \| undefined` | 可省略 | 说明见类型定义。 |
| `maxHistoryMessages` | `number \| undefined` | 可省略 | 说明见类型定义。 |
| `maxAudioBytes` | `number \| undefined` | 可省略 | 说明见类型定义。 |
| `signal` | `AbortSignal \| undefined` | 可省略 | 说明见类型定义。 |


## RealtimeProtocol {#api-realtimeprotocol}

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
type RealtimeProtocol = 'openai-realtime' | 'gemini-live';
```


## RealtimeFrame {#api-realtimeframe}

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
type RealtimeFrame = Readonly<Record<string, any>>;
```
