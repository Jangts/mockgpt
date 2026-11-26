# 第 6 步 · 流式输出与接线

把客服接到真实模型客户端，需要标准 Chat Completions 的 JSON 或 SSE 包装。同一份规则，当请求带 `stream: true` 时按 SSE 分片输出。

```js
import { MockGPT } from '@jangts/mock-gpt';

const mock = new MockGPT({
  stream: { chunkSize: 8, intervalMs: 60 },
  rules: [{ prompt: /推荐/, generator: '今天推荐招牌海盐焦糖拿铁，搭配一块可颂，下午茶刚刚好。' }],
});
```

`chunkSize` 控制每个内容 delta 的最大码点数，`intervalMs` 是 SSE 帧间隔。可选 `wireChunkSize` 再把编码后的字节切开，模拟中文 UTF-8 或 SSE 边界跨读取块的情况。

## 用 fetch 适配接入模型客户端

`mock.fetch` 已绑定，可直接注入到支持自定义 fetch 的模型 SDK，不会全局拦截网络，也不会把请求转发给真实模型：

```js
const response = await mock.fetch('https://mock.local/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({
    model: 'demo',
    messages: [{ role: 'user', content: '推荐' }],
    stream: true,
  }),
});

for await (const chunk of response.body) {
  // 增量解码 SSE 的 data 帧。
}
```

支持 `POST /v1/chat/completions` 与 `POST /chat/completions`，JSON 和 `stream: true` 的 SSE 都用同一份规则。

## 独立模型 API 服务

需要让「不支持注入 fetch 的 SDK」也能接入时，用 Node 入口起一个最小服务，把 base URL 指向它：

```js
import { createMockServer } from '@jangts/mock-gpt/node';

const server = createMockServer({ mock });
const address = await server.listen({ port: 4317 });
console.log(address.url); // http://127.0.0.1:4317
// 测试完调用 await server.close();
```

也可以用 CLI，配置是可信本地模块：

```js
// mock.config.mjs
export default {
  rules: [{ prompt: '你好', generator: '你好，欢迎光临小可乐咖啡！' }],
};
```

```sh
npx @jangts/mock-gpt serve --config ./mock.config.mjs
```

模型 base URL 默认为 `http://127.0.0.1:4317/v1`，可配置 `--host`、`--port`。服务只提供模型 API，未匹配规则且没有 fallback 时会报错。

## 完整接线链路

```text
规则清单与生成器 ──► 匹配与生成 ──► fetch 适配 / Node 服务 ──► 模型客户端 SDK
```

至此，你已经掌握了流式接线。下一步我们补上「长文本摘要」，让客服面对一大段需求时能先回一句「好的」确认——见 [第 7 步 · 长文本摘要与要点](/zh/guide/step-7)。