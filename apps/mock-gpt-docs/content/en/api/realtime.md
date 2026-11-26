---
title: "Realtime sessions"
outline: [2, 3]
---

# Realtime sessions

Exchange native OpenAI Realtime or Gemini Live frames in tests.

## Contents

| Symbol | Kind | Description |
| --- | --- | --- |
| [`createMockDuplex`](#api-createmockduplex) | function | Create an in-memory realtime session. |
| [`bindMockDataChannel`](#api-bindmockdatachannel) | function | Attach a mock session to a host data channel. |
| [`MockDataChannel`](#api-mockdatachannel) | interface | Host data channel interface. |
| [`MockDuplex`](#api-mockduplex) | interface | Bidirectional mock session. |
| [`MockDuplexOptions`](#api-mockduplexoptions) | interface | Realtime protocol and session limits. |
| [`RealtimeProtocol`](#api-realtimeprotocol) | type alias | Supported realtime protocol IDs. |
| [`RealtimeFrame`](#api-realtimeframe) | type alias | A native JSON realtime frame. |


## createMockDuplex {#api-createmockduplex}

Create a server-side duplex. Explicit response requests alone admit a new model generation.

**Import:** `@jangts/mock-gpt`。

## Definition

### Call


```ts
createMockDuplex(mock: RealtimeMock, options: MockDuplexOptions): MockDuplex
```

Create a server-side duplex. Explicit response requests alone admit a new model generation.

| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `mock` | `RealtimeMock` | Required | — |
| `options` | `MockDuplexOptions` | Required | — |

**Returns:** `MockDuplex`


## bindMockDataChannel {#api-bindmockdatachannel}

**Import:** `@jangts/mock-gpt`。

## Definition

### Call


```ts
bindMockDataChannel(mock: RealtimeMock, channel: MockDataChannel, options: MockDuplexOptions & { maxBufferedBytes?: number; maxInboundFrames?: number; }): { duplex: MockDuplex; close: () => void; }
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `mock` | `RealtimeMock` | Required | — |
| `channel` | `MockDataChannel` | Required | — |
| `options` | `MockDuplexOptions & { maxBufferedBytes?: number; maxInboundFrames?: number; }` | Required | — |

**Returns:** `{ duplex: MockDuplex; close: () => void; }`


## MockDataChannel {#api-mockdatachannel}

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface MockDataChannel
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `bufferedAmount` | `number` | Required | Read-only. Description见类型定义。 |
| `readyState` | `string` | Required | Read-only. Description见类型定义。 |
| `send` | `(data: string) => void` | Required | Description见类型定义。 |
| `close` | `() => void` | Required | Description见类型定义。 |
| `addEventListener` | `(type: string, listener: (event: any) => void) => void` | Required | Description见类型定义。 |
| `removeEventListener` | `(type: string, listener: (event: any) => void) => void` | Required | Description见类型定义。 |


## MockDuplex {#api-mockduplex}

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface MockDuplex
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `send` | `(frame: RealtimeFrame, signal?: AbortSignal) => Promise<void>` | Required | Description见类型定义。 |
| `frames` | `AsyncIterable<Readonly<Record<string, any>>>` | Required | Description见类型定义。 |
| `close` | `() => void` | Required | Description见类型定义。 |
| `closed` | `boolean` | Required | Read-only. Description见类型定义。 |
| `generation` | `number` | Required | Read-only. Description见类型定义。 |


## MockDuplexOptions {#api-mockduplexoptions}

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface MockDuplexOptions
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `protocol` | `RealtimeProtocol` | Required | Description见类型定义。 |
| `model` | `string \| undefined` | Optional | Description见类型定义。 |
| `maxQueuedFrames` | `number \| undefined` | Optional | Description见类型定义。 |
| `maxFrameBytes` | `number \| undefined` | Optional | Description见类型定义。 |
| `maxHistoryMessages` | `number \| undefined` | Optional | Description见类型定义。 |
| `maxAudioBytes` | `number \| undefined` | Optional | Description见类型定义。 |
| `signal` | `AbortSignal \| undefined` | Optional | Description见类型定义。 |


## RealtimeProtocol {#api-realtimeprotocol}

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
type RealtimeProtocol = 'openai-realtime' | 'gemini-live';
```


## RealtimeFrame {#api-realtimeframe}

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
type RealtimeFrame = Readonly<Record<string, any>>;
```
