# API Overview

`@jangts/mock-gpt` provides three public entry points, all supporting ESM, CommonJS and TypeScript types:

| Entry | Contents | Use case |
| --- | --- | --- |
| `@jangts/mock-gpt` | `MockGPT`, `generators`, `responses`, `ResponseDescription`, `MockGPTError`, `routes`, `encodeModelResponse` | Core for browser and server |
| `@jangts/mock-gpt/node` | `createMockServer`, `createMockHandler`, `createMockWebSocketServer` | Standalone Node model API server |
| `@jangts/mock-gpt/web` | `sources`, `isPublicAddress` | Node web-page body fetching |

The core entry does not bring in Node HTTP, CLI or browser capabilities; `/node` and `/web` are loaded from sub-entries on demand.

## Page index

- [MockGPT](/en/api/mockgpt): construction, `generate()`, `fetch`, records and reset.
- [Generators](/en/api/generators): value generators and input-aware text generators.
- [Response descriptions](/en/api/responses): text, tool-call and failure helpers.
- [Web sources](/en/api/sources): `sources.web()` web-page body fetching.
- [Node server](/en/api/node): `createMockServer`, `createMockHandler`, `createMockWebSocketServer`.

- [Protocols and lifecycle settings](/en/api/protocols)
- [Realtime sessions](/en/api/realtime)
- [Native requests and examples](/en/guide/protocols)

## Error codes

All errors are thrown as `MockGPTError` with `code`, `message`, `status` and optional `details`. The HTTP shell maps them to error responses with the corresponding status.

| code | Meaning | Typical status |
| --- | --- | --- |
| `MOCK_CONFIG` | Invalid configuration or constructor argument | 500 |
| `MOCK_REQUEST` | Request is not valid JSON or has invalid fields | 400 |
| `MOCK_RULE_NOT_FOUND` | No rule matched and no fallback configured | 500 |
| `MOCK_ROUTE` / `MOCK_METHOD` | Unknown model route / unsupported HTTP method | 404 / 405 |
| `MOCK_ACTIVE` | `listen()` called twice, or `reset()` while active | 500 |
| `MOCK_NETWORK` | `responses.reject` closes the connection directly in the HTTP shell | — |
| `MOCK_HTTP` | HTTP failure simulated by `responses.httpError` | 400–599 |
| `MOCK_CANCELLED` | Request was cancelled | — |
| `MOCK_OUTPUT_LIMIT` | Generated result exceeds `maxOutputChars` | 500 |
| `MOCK_SEQUENCE_EXHAUSTED` | Sequence generator exhausted | 500 |
| `MOCK_BODY_LIMIT` / `MOCK_TIMEOUT` | Request body too large / server request timeout | 413 / 408 |
| `MOCK_CORS` | Origin not in allowlist | 403 |
| `MOCK_WEB_*` | Web-source stage failures, see [sources](/en/api/sources) | 502 / 504 |

## Import examples

```js
import { MockGPT, generators, responses, MockGPTError, ResponseDescription } from '@jangts/mock-gpt';
import { createMockServer, createMockHandler } from '@jangts/mock-gpt/node';
import { sources } from '@jangts/mock-gpt/web';
```

TypeScript types are imported from the corresponding entries:

```ts
import type { MockGPTOptions, Rule, ModelRequest, GenerationContext, Generated } from '@jangts/mock-gpt';
```
