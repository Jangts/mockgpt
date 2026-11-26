---
title: "Node server"
outline: [2, 3]
---

# Node server

The `/node` entry provides a standalone HTTP server, an embeddable handler and a WebSocket listener. HTTP uses the native routes on the MockGPT instance.

## Contents

| Symbol | Kind | Description |
| --- | --- | --- |
| [`createMockServer`](#api-createmockserver) | function | Create a standalone HTTP server with listen()/close(). |
| [`createMockHandler`](#api-createmockhandler) | function | Create a request handler embeddable in an existing Node HTTP server. |
| [`createMockWebSocketServer`](#api-createmockwebsocketserver) | function | Listen for local realtime WebSocket clients. |
| [`MockWebSocketServerOptions`](#api-mockwebsocketserveroptions) | interface | Realtime WebSocket listener options. |
| [`ServerOptions`](#api-serveroptions) | interface | Options for createMockServer. |
| [`HandlerOptions`](#api-handleroptions) | interface | Options for createMockHandler. |


## createMockServer {#api-createmockserver}

Create a self-contained mock HTTP server with explicit `listen`/`close` control.

No UI or static assets are served: only the model routes answer, everything else is a 404.

**Import:** `@jangts/mock-gpt/node`。

## Definition

### Call


```ts
createMockServer(options: ServerOptions): { listen({ host, port }?: { host?: string; port?: number; }): Promise<{ host: string; port: number; url: string; }>; close(): Promise<void>; }
```

Create a self-contained mock HTTP server with explicit `listen`/`close` control.

No UI or static assets are served: only the model routes answer, everything else is a 404.

| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `options` | `ServerOptions` | Required | — |

**Returns:** `{ listen({ host, port }?: { host?: string; port?: number; }): Promise<{ host: string; port: number; url: string; }>; close(): Promise<void>; }`


## createMockHandler {#api-createmockhandler}

Create a bare Node request listener backed by the mock.

**Import:** `@jangts/mock-gpt/node`。

## Definition

### Call


```ts
createMockHandler(options: HandlerOptions): (incoming: IncomingMessage, outgoing: ServerResponse) => void
```

Create a bare Node request listener backed by the mock.

| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `options` | `HandlerOptions` | Required | — |

**Returns:** `(incoming: IncomingMessage, outgoing: ServerResponse) => void`


## createMockWebSocketServer {#api-createmockwebsocketserver}

Listen on loopback by default. The returned close waits for sockets and listening handles.

**Import:** `@jangts/mock-gpt/node`。

## Definition

### Call


```ts
createMockWebSocketServer(mock: RealtimeMock, options: MockWebSocketServerOptions): Promise<{ url: string; server: Server<typeof WebSocket, typeof IncomingMessage>; close(): Promise<void>; }>
```

Listen on loopback by default. The returned close waits for sockets and listening handles.

| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `mock` | `RealtimeMock` | Required | — |
| `options` | `MockWebSocketServerOptions` | Required | — |

**Returns:** `Promise<{ url: string; server: Server<typeof WebSocket, typeof IncomingMessage>; close(): Promise<void>; }>`


## MockWebSocketServerOptions {#api-mockwebsocketserveroptions}

**Import:** `@jangts/mock-gpt/node`。

## Definition

```ts
interface MockWebSocketServerOptions extends MockDuplexOptions
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `host` | `string \| undefined` | Optional | Description见类型定义。 |
| `port` | `number \| undefined` | Optional | Description见类型定义。 |
| `maxBufferedBytes` | `number \| undefined` | Optional | Description见类型定义。 |
| `maxInboundFrames` | `number \| undefined` | Optional | Description见类型定义。 |
| `protocol` | `RealtimeProtocol` | Required | Description见类型定义。 |
| `model` | `string \| undefined` | Optional | Description见类型定义。 |
| `maxQueuedFrames` | `number \| undefined` | Optional | Description见类型定义。 |
| `maxFrameBytes` | `number \| undefined` | Optional | Description见类型定义。 |
| `maxHistoryMessages` | `number \| undefined` | Optional | Description见类型定义。 |
| `maxAudioBytes` | `number \| undefined` | Optional | Description见类型定义。 |
| `signal` | `AbortSignal \| undefined` | Optional | Description见类型定义。 |


## ServerOptions {#api-serveroptions}

Options of `createMockServer`, adding shutdown behaviour.

**Import:** `@jangts/mock-gpt/node`。

## Definition

```ts
interface ServerOptions extends HandlerOptions
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `closeTimeoutMs` | `number \| undefined` | Optional | Grace period before active requests are aborted on `close`, in milliseconds; default 1000. |
| `mock` | `MockGPT` | Required | Instance whose `fetch` answers every accepted request. |
| `maxBodyBytes` | `number \| undefined` | Optional | Maximum request body in bytes; default 1 MiB. |
| `requestTimeoutMs` | `number \| undefined` | Optional | Deadline for one request including streaming, in milliseconds; default 30 000. |
| `allowedOrigins` | `readonly string[] \| undefined` | Optional | Exact origins allowed to call cross-origin; same-origin requests always pass. |
| `allowedHosts` | `readonly string[] \| undefined` | Optional | Extra hostnames accepted in `Host`; localhost, 127.0.0.1 and ::1 are always accepted. |


## HandlerOptions {#api-handleroptions}

Options shared by the standalone server and the bare request handler.

**Import:** `@jangts/mock-gpt/node`。

## Definition

```ts
interface HandlerOptions
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `mock` | `MockGPT` | Required | Instance whose `fetch` answers every accepted request. |
| `maxBodyBytes` | `number \| undefined` | Optional | Maximum request body in bytes; default 1 MiB. |
| `requestTimeoutMs` | `number \| undefined` | Optional | Deadline for one request including streaming, in milliseconds; default 30 000. |
| `allowedOrigins` | `readonly string[] \| undefined` | Optional | Exact origins allowed to call cross-origin; same-origin requests always pass. |
| `allowedHosts` | `readonly string[] \| undefined` | Optional | Extra hostnames accepted in `Host`; localhost, 127.0.0.1 and ::1 are always accepted. |

## ## Examples
```js
import { createMockServer, createMockHandler } from '@jangts/mock-gpt/node';
```

### createMockServer

```js
const server = createMockServer({ mock });
const address = await server.listen({ host: '127.0.0.1', port: 4317 });
console.log(address.url);
// Use port: 0 for tests; call await server.close() when done.
```

### createMockHandler

Hand to an existing Node HTTP server or dev server:

```js
const handler = createMockHandler({ mock });
```

The Node entry validates Host first, then Origin. When a reverse proxy preserves a custom domain, use `createMockServer({ mock, allowedHosts: ['mock.example'] })` or set the same option on the handler. Cross-origin sources must be explicitly listed in `allowedOrigins`.

### CLI

```sh
npx @jangts/mock-gpt serve --config ./mock.config.mjs
```

```js
// mock.config.mjs
export default {
  rules: [{ prompt: 'hello', generator: 'Hello, welcome to Microcola Coffee!' }],
};
```

The model base URL defaults to `http://127.0.0.1:4317/v1`; `--host` and `--port` are configurable. The config is trusted local code; the server does not load remote config.
