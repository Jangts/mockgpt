---
title: "Node 服务"
outline: [2, 3]
---

# Node 服务

`/node` 入口提供独立 HTTP 服务、可嵌入 handler 与 WebSocket 服务。HTTP 使用同一个 MockGPT 实例的原生协议路由。

## Contents

| 符号 | 类别 | 说明 |
| --- | --- | --- |
| [`createMockServer`](#api-createmockserver) | 函数 | Create a standalone HTTP server with listen()/close(). |
| [`createMockHandler`](#api-createmockhandler) | 函数 | Create a request handler embeddable in an existing Node HTTP server. |
| [`createMockWebSocketServer`](#api-createmockwebsocketserver) | 函数 | Listen for local realtime WebSocket clients. |
| [`MockWebSocketServerOptions`](#api-mockwebsocketserveroptions) | 接口 | Realtime WebSocket listener options. |
| [`ServerOptions`](#api-serveroptions) | 接口 | Options for createMockServer. |
| [`HandlerOptions`](#api-handleroptions) | 接口 | Options for createMockHandler. |


## createMockServer {#api-createmockserver}

Create a self-contained mock HTTP server with explicit `listen`/`close` control.

No UI or static assets are served: only the model routes answer, everything else is a 404.

**导入：** `@jangts/mock-gpt/node`。

## 定义

### 调用


```ts
createMockServer(options: ServerOptions): { listen({ host, port }?: { host?: string; port?: number; }): Promise<{ host: string; port: number; url: string; }>; close(): Promise<void>; }
```

Create a self-contained mock HTTP server with explicit `listen`/`close` control.

No UI or static assets are served: only the model routes answer, everything else is a 404.

| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `options` | `ServerOptions` | 必需 | — |

**返回：** `{ listen({ host, port }?: { host?: string; port?: number; }): Promise<{ host: string; port: number; url: string; }>; close(): Promise<void>; }`


## createMockHandler {#api-createmockhandler}

Create a bare Node request listener backed by the mock.

**导入：** `@jangts/mock-gpt/node`。

## 定义

### 调用


```ts
createMockHandler(options: HandlerOptions): (incoming: IncomingMessage, outgoing: ServerResponse) => void
```

Create a bare Node request listener backed by the mock.

| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `options` | `HandlerOptions` | 必需 | — |

**返回：** `(incoming: IncomingMessage, outgoing: ServerResponse) => void`


## createMockWebSocketServer {#api-createmockwebsocketserver}

Listen on loopback by default. The returned close waits for sockets and listening handles.

**导入：** `@jangts/mock-gpt/node`。

## 定义

### 调用


```ts
createMockWebSocketServer(mock: RealtimeMock, options: MockWebSocketServerOptions): Promise<{ url: string; server: Server<typeof WebSocket, typeof IncomingMessage>; close(): Promise<void>; }>
```

Listen on loopback by default. The returned close waits for sockets and listening handles.

| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `mock` | `RealtimeMock` | 必需 | — |
| `options` | `MockWebSocketServerOptions` | 必需 | — |

**返回：** `Promise<{ url: string; server: Server<typeof WebSocket, typeof IncomingMessage>; close(): Promise<void>; }>`


## MockWebSocketServerOptions {#api-mockwebsocketserveroptions}

**导入：** `@jangts/mock-gpt/node`。

## 定义

```ts
interface MockWebSocketServerOptions extends MockDuplexOptions
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `host` | `string \| undefined` | 可省略 | 说明见类型定义。 |
| `port` | `number \| undefined` | 可省略 | 说明见类型定义。 |
| `maxBufferedBytes` | `number \| undefined` | 可省略 | 说明见类型定义。 |
| `maxInboundFrames` | `number \| undefined` | 可省略 | 说明见类型定义。 |
| `protocol` | `RealtimeProtocol` | 必需 | 说明见类型定义。 |
| `model` | `string \| undefined` | 可省略 | 说明见类型定义。 |
| `maxQueuedFrames` | `number \| undefined` | 可省略 | 说明见类型定义。 |
| `maxFrameBytes` | `number \| undefined` | 可省略 | 说明见类型定义。 |
| `maxHistoryMessages` | `number \| undefined` | 可省略 | 说明见类型定义。 |
| `maxAudioBytes` | `number \| undefined` | 可省略 | 说明见类型定义。 |
| `signal` | `AbortSignal \| undefined` | 可省略 | 说明见类型定义。 |


## ServerOptions {#api-serveroptions}

Options of `createMockServer`, adding shutdown behaviour.

**导入：** `@jangts/mock-gpt/node`。

## 定义

```ts
interface ServerOptions extends HandlerOptions
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `closeTimeoutMs` | `number \| undefined` | 可省略 | Grace period before active requests are aborted on `close`, in milliseconds; default 1000. |
| `mock` | `MockGPT` | 必需 | Instance whose `fetch` answers every accepted request. |
| `maxBodyBytes` | `number \| undefined` | 可省略 | Maximum request body in bytes; default 1 MiB. |
| `requestTimeoutMs` | `number \| undefined` | 可省略 | Deadline for one request including streaming, in milliseconds; default 30 000. |
| `allowedOrigins` | `readonly string[] \| undefined` | 可省略 | Exact origins allowed to call cross-origin; same-origin requests always pass. |
| `allowedHosts` | `readonly string[] \| undefined` | 可省略 | Extra hostnames accepted in `Host`; localhost, 127.0.0.1 and ::1 are always accepted. |


## HandlerOptions {#api-handleroptions}

Options shared by the standalone server and the bare request handler.

**导入：** `@jangts/mock-gpt/node`。

## 定义

```ts
interface HandlerOptions
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `mock` | `MockGPT` | 必需 | Instance whose `fetch` answers every accepted request. |
| `maxBodyBytes` | `number \| undefined` | 可省略 | Maximum request body in bytes; default 1 MiB. |
| `requestTimeoutMs` | `number \| undefined` | 可省略 | Deadline for one request including streaming, in milliseconds; default 30 000. |
| `allowedOrigins` | `readonly string[] \| undefined` | 可省略 | Exact origins allowed to call cross-origin; same-origin requests always pass. |
| `allowedHosts` | `readonly string[] \| undefined` | 可省略 | Extra hostnames accepted in `Host`; localhost, 127.0.0.1 and ::1 are always accepted. |

## ## 使用示例
```js
import { createMockServer, createMockHandler } from '@jangts/mock-gpt/node';
```

### createMockServer

```js
const server = createMockServer({ mock });
const address = await server.listen({ host: '127.0.0.1', port: 4317 });
console.log(address.url);
// 测试可用 port: 0；结束时 await server.close()。
```

### createMockHandler

交给已有 Node HTTP 服务或开发服务器调用：

```js
const handler = createMockHandler({ mock });
```

Node 入口先校验 Host，再校验 Origin。反向代理保留自定义域名时用 `createMockServer({ mock, allowedHosts: ['mock.example'] })`，或给 handler 设置相同参数；跨域来源须显式登记 `allowedOrigins`。

### CLI

```sh
npx @jangts/mock-gpt serve --config ./mock.config.mjs
```

```js
// mock.config.mjs
export default {
  rules: [{ prompt: '你好', generator: '你好，欢迎光临小可乐咖啡！' }],
};
```

模型 base URL 默认为 `http://127.0.0.1:4317/v1`，可配置 `--host`、`--port`。配置是可信本地代码，服务不会加载远程配置。
