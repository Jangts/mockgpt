# 多协议与生命周期

> 适用 SDK 版本: 0.3.0

安装 `npm install @jangts/mock-gpt`，Node >=22.12。根入口提供 ESM、CommonJS 与类型；HTTP／WS 服务位于 `@jangts/mock-gpt/node`。完整首次请求见 [README](/zh/guide/step-1)，可执行示例见 `multi-protocol.mjs`。

## 原生请求

同一规则通过原生路径选择 Chat、Responses、Messages、Gemini generateContent 或 Interactions；`stream:true` 开启 SSE，Gemini 改用 `:streamGenerateContent`。模型名称不决定协议。`responses` 是描述器辅助对象，与 Responses API 分别命名。

| 协议 | POST 路径 | 原生输入 |
| --- | --- | --- |
| Chat Completions | `/v1/chat/completions` or `/chat/completions` | `model`, `messages` |
| Responses | `/v1/responses` or `/responses` | `model`, `input` |
| Messages | `/v1/messages` or `/messages` | `model`, `messages`, `max_tokens` |
| Gemini generateContent | `/v1beta/models/{model}:generateContent` | `contents` with ordered `parts` |
| Gemini streamGenerateContent | `/v1beta/models/{model}:streamGenerateContent` | same |
| Gemini Interactions | `/v1beta/interactions` | `model`, `input` |

## 有序场景

```js
import { MockGPT, responses } from '@jangts/mock-gpt';
const mock = new MockGPT({ rules: [{ generator: responses.scenario({
  items: [
    { type: 'text', text: 'Checking stock.' },
    { type: 'function-call', id: 'stock-1', name: 'stock', arguments: { sku: 'demo' } },
  ],
  usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
}) }] });
const response = await mock.fetch('https://mock.invalid/v1/responses', {
  method: 'POST', body: JSON.stringify({ model: 'mock', input: 'Check stock', stream: true }),
});
console.log(await response.text()); // native SSE; no tool executes
```

`responses.scenario({items})` 描述有序文本、函数调用、思考／签名、媒体引用、厂商搜索和拒答。它直接作为现有规则的 generator 输出；普通对象仍生成 JSON。类型为公开 `ScenarioOutput`／`ScenarioItem`。不得混用 items 与旧 content/tools；显式调用／搜索 ID 须唯一且非空。完整 scenario JSON（含签名与引用）按 UTF-8 字节计入 maxOutputChars，旧输出保留字符计量；maxBodyBytes 对所有 fetch 路由生效，与资源总量独立。Chat 中文本项必须位于函数项之前，交错无法表示时明确拒绝；codec 无法表达时明确报错，不静默丢弃。Interactions 原生 Content/status 没有可区分的拒答／安全终态，因此 refusal 项或 content_filter 明确返回 MOCK_CAPABILITY，不投影成正常 completed。签名不进入 prompt；媒体引用不下载或编码外部资源；厂商搜索不会执行本地工具。客户端仍负责工具授权、执行、结果回传和最终结果读取。JSON/schema 模拟不证明真实模型原生强约束。

## 后台、Batch 与文件

```js
import { MockGPT, responses } from '@jangts/mock-gpt';
let now = 0;
const mock = new MockGPT({
  clock: () => now,
  lifecycle: { delayMs: 10 },
  rules: [{ generator: responses.text('done') }],
});
const accepted = await mock.fetch('https://mock.invalid/v1/responses', {
  method: 'POST', headers: { 'x-mock-scope': 'test-a' },
  body: JSON.stringify({ model: 'mock', input: 'Hello', background: true }),
});
const operation = await accepted.json();
now = 20;
for (let attempt = 0; attempt < 10; attempt++) {
  const result = await mock.fetch(`https://mock.invalid/v1/responses/${operation.id}`, {
    headers: { 'x-mock-scope': 'test-a' },
  });
  const snapshot = await result.json();
  if (snapshot.status === 'completed') {
    console.log(snapshot);
    break;
  }
  if (snapshot.status !== 'in_progress' || attempt === 9) {
    throw new Error(`Unexpected status: ${snapshot.status}`);
  }
  await new Promise(resolve => setTimeout(resolve, 0));
}
```

后台、Batch 和文件需显式 `lifecycle:{}`。Responses／Interactions 提供原生提交、查询、取消；三厂 Batch 保留各自请求和结果身份，按稳定 item ID 对账。Gemini 上传模拟仅支持 start 后单次 upload/finalize，不提供多段续传、偏移恢复或真实云端存储。`x-mock-scope` 或 `lifecycle.scope(request)` 隔离实例内资源，缺省为 `default`；这是合成测试隔离，不是应用鉴权，不保存凭据作为作用域。

资源默认最多100操作、100文件、单批100项、总计16MiB、TTL 60000ms、每文件1000次读取。`lifecycle.limits` 字段对应 `maxOperations/maxFiles/maxItems/maxBytes/ttlMs/maxReads`，均为正整数。clock 决定时间，查询立即返回当前状态，不等待生成、不推进时间或重新生成；惰性过期返回 `MOCK_RESOURCE_EXPIRED`，超限返回 `MOCK_RESOURCE_LIMIT`。取消当前等待不撤销已接纳任务，应使用独立 signal 发送原生取消动作。丢确认不等于未执行，不默认安全重提。stats 分别观察动作、生成、批次项、轮次与活跃资源；reset 拒绝活跃任务或连接。

## 实时与取消

```js
import { MockGPT, createMockDuplex } from '@jangts/mock-gpt';
const mock = new MockGPT({ rules: [{ generator: 'hello' }] });
const duplex = createMockDuplex(mock, { protocol: 'openai-realtime', model: 'mock' });
try {
  await duplex.send({ type: 'session.update', session: {} });
  const reader = duplex.frames[Symbol.asyncIterator]();
  console.log((await reader.next()).value.type); // session.updated
} finally {
  duplex.close();
}
```

实时使用 `createMockDuplex(mock,{protocol:'openai-realtime'|'gemini-live'})`，完整 setup／读取／关闭示例见上文。options.signal 管理连接寿命，send 的 signal 管理一次发送；Gemini Live 的同步工具在结果全部返回后自动继续同一轮，最终回复带 turnComplete。OpenAI Realtime 提交工具结果后需要单独发送 response.create。默认队列64帧、每帧1MiB、历史1000消息、音频输入1MiB，实例默认16连接。Node 的 `createMockWebSocketServer` 提供实际本机 WS 外壳；使用返回 url，最后 await close。缺省监听回环地址，入站64帧、出站缓冲1MiB。datachannel 适配不实现 SDP、设备、轨道、编解码或真实媒体。

普通 generate 和 fetch 都支持 AbortSignal；提前取消不执行 generator，已准入次数在取消或失败后不返还。显式 usage 是合成计数，不是实际 token／费用。源码、注入 fetch、实际 HTTP／WS 与真实媒体验证应分别记录。
