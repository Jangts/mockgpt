# API 总览

`@jangts/mock-gpt` 提供三个公开入口，均支持 ESM、CommonJS 与 TypeScript 类型：

| 入口 | 内容 | 使用场景 |
| --- | --- | --- |
| `@jangts/mock-gpt` | `MockGPT`、`generators`、`responses`、`ResponseDescription`、`MockGPTError`、`routes`、`encodeModelResponse` | 浏览器与服务端通用的核心 |
| `@jangts/mock-gpt/node` | `createMockServer`、`createMockHandler`、`createMockWebSocketServer` | Node 独立模型 API 服务 |
| `@jangts/mock-gpt/web` | `sources`、`isPublicAddress` | Node 网页正文获取 |

核心入口不引入 Node HTTP、CLI 或浏览器能力；`/node` 与 `/web` 中的能力按需从子入口加载。

## 页面索引

- [MockGPT](/zh/api/mockgpt)：构造、`generate()`、`fetch`、记录与重置；
- [生成器 generators](/zh/api/generators)：值生成器与输入相关文本生成器；
- [响应描述 responses](/zh/api/responses)：文本、工具调用与故障 helper；
- [网页来源 sources](/zh/api/sources)：`sources.web()` 网页正文获取；
- [Node 服务](/zh/api/node)：`createMockServer`、`createMockHandler`、`createMockWebSocketServer`。

- [协议与生命周期](/zh/api/protocols)
- [实时会话](/zh/api/realtime)
- [原生请求与示例](/zh/guide/protocols)

## 错误码

所有错误以 `MockGPTError` 抛出，携带 `code`、`message`、`status` 与可选 `details`。HTTP 壳会把错误映射为带对应状态的错误响应。

| code | 含义 | 典型状态 |
| --- | --- | --- |
| `MOCK_CONFIG` | 配置或构造参数非法 | 500 |
| `MOCK_REQUEST` | 请求不是合法 JSON 或字段非法 | 400 |
| `MOCK_RULE_NOT_FOUND` | 没有规则匹配，且未配置 fallback | 500 |
| `MOCK_ROUTE` / `MOCK_METHOD` | 模型路由未知 / 方法不是 POST | 404 / 405 |
| `MOCK_ACTIVE` | 服务启动中重复 `listen()`，或活动请求中 `reset()` | 500 |
| `MOCK_NETWORK` | `responses.reject` 在 HTTP 壳中直接关闭连接 | — |
| `MOCK_HTTP` | `responses.httpError` 模拟的 HTTP 故障 | 400—599 |
| `MOCK_CANCELLED` | 请求被取消 | — |
| `MOCK_OUTPUT_LIMIT` | 生成结果超过 `maxOutputChars` | 500 |
| `MOCK_SEQUENCE_EXHAUSTED` | 序列生成器耗尽 | 500 |
| `MOCK_BODY_LIMIT` / `MOCK_TIMEOUT` | 请求体超限 / 服务请求超时 | 413 / 408 |
| `MOCK_CORS` | 来源不在允许列表 | 403 |
| `MOCK_WEB_*` | 网页来源各阶段失败，见 [sources](/zh/api/sources) | 502 / 504 |

## 导入示例

```js
import { MockGPT, generators, responses, MockGPTError, ResponseDescription } from '@jangts/mock-gpt';
import { createMockServer, createMockHandler } from '@jangts/mock-gpt/node';
import { sources } from '@jangts/mock-gpt/web';
```

TypeScript 类型从对应入口导入：

```ts
import type { MockGPTOptions, Rule, ModelRequest, GenerationContext, Generated } from '@jangts/mock-gpt';
```