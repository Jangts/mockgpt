// mock-gpt 公开 API 的页面编排与场景示例。中文为源语言，英文在同结构中覆盖标题、导语、说明与示例。
// 该清单是「每个公开导出都有文档条目」校验的唯一真源，须与 SDK 导出保持一致。

const sharedPages = [
  {
    slug: 'mockgpt',
    notesKeys: [
      'generate',
      'fetch',
      'reset',
      'records',
      'counts',
      'activeRequests',
    ],
    symbols: [
      {
        name: 'MockGPT',
        summary: 'Core class; construct rules, run generate() and fetch adapter, read records, reset().',
      },
      {
        name: 'MockGPTError',
        summary: 'Business error with code, status and details, mapped by the error-code hub and HTTP shell.',
      },
      {
        name: 'ResponseDescription',
        summary: 'Response description class branded with a Symbol.for to distinguish it from plain JSON.',
      },
      { name: 'routes', summary: 'Model route list: POST /chat/completions and /v1/chat/completions.' },
      {
        name: 'encodeModelResponse',
        summary: 'Encode a validated model request and output as Chat Completions JSON / SSE Response.',
      },
      { name: 'JsonValue', summary: 'Recursive type for JSON-serializable values.' },
      { name: 'Message', summary: 'Read-only message structure with extensible role and content.' },
      { name: 'ModelRequest', summary: 'Model request contract including model, messages, stream, etc.' },
      { name: 'GenerationInput', summary: 'Minimum input for generate().' },
      { name: 'GenerationOptions', summary: 'Optional arguments for generate().' },
      { name: 'GenerationContext', summary: 'Execution context passed to function generators.' },
      { name: 'Generator', summary: 'Generator: a static result or a function returning a result from context.' },
      { name: 'Generated', summary: 'Generated result: a JSON value or response description.' },
      { name: 'Rule', summary: 'Rule: matching condition and corresponding generator.' },
      { name: 'MockGPTOptions', summary: 'MockGPT construction options.' },
      { name: 'CallRecord', summary: 'Call record snapshot.' },
    ],
  },
  {
    slug: 'generators',
    notesKeys: [
      'integer',
      'float',
      'boolean',
      'pick',
      'id',
      'date',
      'sentence',
      'imageUrl',
      'sequence',
      'toolCall',
      'summary',
      'bullets',
      'keywords',
      'title',
      'extract',
      'reply',
    ],
    symbols: [
      {
        name: 'generators',
        summary: 'Namespace merging value generators and input-aware text generators.',
      },
      { name: 'generatorNames', summary: 'Frozen array of available generator names.' },
      { name: 'TextSource', summary: 'Text source: a fixed string or a function returning a string from context.' },
      { name: 'TextOptions', summary: 'Common options for input-aware text generators.' },
    ],
  },
  {
    slug: 'responses',
    notesKeys: ['text', 'toolCalls', 'scenario', 'httpError', 'reject'],
    symbols: [
      { name: 'responses', summary: 'Namespace of response-description helpers.' },
      { name: 'ScenarioItem', summary: 'One ordered output item.' },
      { name: 'ScenarioOutput', summary: 'Ordered items and output options.' },
      { name: 'ToolCall', summary: 'Tool-call proposal structure.' },
      { name: 'Usage', summary: 'Explicit token usage.' },
      { name: 'OutputOptions', summary: 'Output presentation and streaming options.' },
      { name: 'ModelOutput', summary: 'Model output content and streaming options.' },
      { name: 'HttpFault', summary: 'Status and body for simulated HTTP failures.' },
    ],
  },
  {
    slug: 'sources',
    notesKeys: ['web'],
    symbols: [
      { name: 'sources', summary: 'Web-page body source namespace.' },
      { name: 'isPublicAddress', summary: 'Public-address check reused for address validation.' },
      { name: 'WebOptions', summary: 'Options for sources.web().' },
      { name: 'LoadedPage', summary: 'Web-page load result.' },
      { name: 'WebProfile', summary: 'Request-header profile: browser or crawler-compatible alias.' },
    ],
  },
  {
    slug: 'protocols',
    notesKeys: [],
    symbols: [
      { name: 'protocolCatalog', summary: 'Read-only catalog of supported native codecs.' },
      { name: 'findProtocol', summary: 'Look up a codec by native request path.' },
      { name: 'LifecycleOptions', summary: 'Opt in to background, batch and file resources.' },
      { name: 'ResourceLimits', summary: 'Per-instance lifecycle resource limits.' },
      { name: 'LifecycleFault', summary: 'A configured operation fault.' },
      { name: 'lifecycleCatalog', summary: 'Native lifecycle state transitions.' },
      { name: 'lifecycleFaultCatalog', summary: 'Supported lifecycle faults.' },
    ],
  },
  {
    slug: 'realtime',
    notesKeys: [],
    symbols: [
      { name: 'createMockDuplex', summary: 'Create an in-memory realtime session.' },
      { name: 'bindMockDataChannel', summary: 'Attach a mock session to a host data channel.' },
      { name: 'MockDataChannel', summary: 'Host data channel interface.' },
      { name: 'MockDuplex', summary: 'Bidirectional mock session.' },
      { name: 'MockDuplexOptions', summary: 'Realtime protocol and session limits.' },
      { name: 'RealtimeProtocol', summary: 'Supported realtime protocol IDs.' },
      { name: 'RealtimeFrame', summary: 'A native JSON realtime frame.' },
    ],
  },
  {
    slug: 'node',
    notesKeys: [],
    symbols: [
      { name: 'createMockServer', summary: 'Create a standalone HTTP server with listen()/close().' },
      { name: 'createMockHandler', summary: 'Create a request handler embeddable in an existing Node HTTP server.' },
      { name: 'createMockWebSocketServer', summary: 'Listen for local realtime WebSocket clients.' },
      { name: 'MockWebSocketServerOptions', summary: 'Realtime WebSocket listener options.' },
      { name: 'ServerOptions', summary: 'Options for createMockServer.' },
      { name: 'HandlerOptions', summary: 'Options for createMockHandler.' },
    ],
  },
];

const chineseStrings = {
  mockgpt: {
    title: 'MockGPT',
    lead: '核心类，保存规则快照、命中计数、随机源与调用记录；实例之间状态隔离。本文同时收录显式业务错误、响应描述标识与传输编码入口。',
    notes: {
      generate:
        '直接 SDK 入口，返回数据而不创建 Request／Response，不执行延迟、切片、HTTP 错误或 SSE。',
      fetch:
        'readonly 绑定的 fetch 适配，可注入支持自定义 fetch 的模型 SDK；地址只用于路由识别，不代表远程服务。',
      reset: '清空记录、规则计数与 seed 状态；存在活动请求时报 MOCK_ACTIVE。',
      records: '只读有界内存记录快照，默认最多 100 条。',
      counts: '各规则命中次数。',
      activeRequests: '生成中的调用数，含未消费的 SSE。',
    },
  },
  generators: {
    title: '生成器 generators',
    lead: '集中导出的生成器命名空间；`generatorNames` 是可用名称的冻结数组，由同一份登记直接驱动。生成器分两类：值生成器与输入相关文本生成器。',
    notes: {
      integer: '范围内随机整数。',
      float: '范围内随机浮点。',
      boolean: '随机布尔值。',
      pick: '从数组随机选一个。',
      id: '`prefix-callIndex-随机后缀`。',
      date: '使用实例 clock 的 ISO 时间。',
      sentence: '从内置句式随机选一句。',
      imageUrl: '本地 SVG data URL 占位图。',
      sequence: '按本规则命中序号逐项返回，耗尽报 MOCK_SEQUENCE_EXHAUSTED。',
      toolCall: '产生单个工具调用提议。',
      summary: '抽取式摘要，选代表句后按原文顺序拼接。',
      bullets: 'Markdown 要点。',
      keywords: 'JSON 关键词数组。',
      title: '单行标题。',
      extract: '按字段映射提取，未命中按声明返回。',
      reply: '带主题的模板回答。',
    },
  },
  responses: {
    title: '响应描述 responses',
    lead: '显式 helper 区分文本、工具调用与故障；普通 JSON 字段不会被猜成控制项。',
    notes: {
      text: '文本内容。',
      toolCalls: '多个工具调用，content 为 null。',
      scenario: '为原生协议声明有序回复项。',
      httpError: '400—599 的有效 HTTP 错误响应。',
      reject: '模拟网络失败，HTTP 壳中直接关闭连接。',
    },
  },
  sources: {
    title: '网页来源 sources',
    lead: '`/web` 是 Node 专属入口；`sources.web()` 真实抓取网页并提取正文，交给本地摘要算法，不启动浏览器、不维护登录、不抓 PDF。',
    notes: { web: '网页正文来源：抓取 HTML/纯文本、去除脚本与导航后交给文本生成器。' },
  },
  protocols: { title: '协议与生命周期', lead: '查询路径支持及配置实例级后台、批处理与文件资源。', notes: {} },
  realtime: { title: '实时会话', lead: '选择 OpenAI Realtime 或 Gemini Live，并在测试中收发原生帧。', notes: {} },
  node: {
    title: 'Node 服务',
    lead: '`/node` 入口提供独立 HTTP 服务、可嵌入 handler 与 WebSocket 服务。HTTP 使用同一个 MockGPT 实例的原生协议路由。',
    notes: {},
  },
};

const englishStrings = {
  mockgpt: {
    title: 'MockGPT',
    lead: 'Core class holding rule snapshots, hit counts, random source and call records. Instances are isolated. This page also covers explicit business errors, response-description branding and the transport encoder entry.',
    notes: {
      generate:
        'Direct SDK entry; returns data without creating Request/Response, and does not add latency, chunking, HTTP errors or SSE.',
      fetch:
        'Readonly-bound fetch adapter that can be injected into model SDKs supporting custom fetch; the URL is only for routing, not a remote service.',
      reset: 'Clears records, rule counts and seed state; throws MOCK_ACTIVE when requests are active.',
      records: 'Read-only bounded in-memory snapshot of call records; defaults to 100 entries.',
      counts: 'Hit count per rule.',
      activeRequests: 'Number of in-flight calls, including unconsumed SSE.',
    },
  },
  generators: {
    title: 'Generators',
    lead: 'Central exported generator namespace. `generatorNames` is a frozen array of available names driven by the same registry. Generators split into value generators and input-aware text generators.',
    notes: {
      integer: 'Random integer in range.',
      float: 'Random float in range.',
      boolean: 'Random boolean.',
      pick: 'Random pick from an array.',
      id: '`prefix-callIndex-random-suffix`.',
      date: 'ISO time using the instance clock.',
      sentence: 'Random sentence from built-in patterns.',
      imageUrl: 'Local SVG data-URL placeholder.',
      sequence: 'Returns items by hit index for this rule; throws MOCK_SEQUENCE_EXHAUSTED when exhausted.',
      toolCall: 'Produces a single tool-call proposal.',
      summary: 'Extractive summary: picks representative sentences and concatenates them in original order.',
      bullets: 'Markdown bullets.',
      keywords: 'JSON keyword array.',
      title: 'Single-line title.',
      extract: 'Extracts by field mapping; returns declared defaults when no match.',
      reply: 'Template reply with a topic.',
    },
  },
  responses: {
    title: 'Response descriptions',
    lead: 'Explicit helpers separate text, tool calls and failures. Plain JSON fields are never guessed to be controls.',
    notes: {
      text: 'Text content.',
      toolCalls: 'Multiple tool calls; content is null.',
      scenario: 'Describe ordered items for a native protocol.',
      httpError: 'Valid HTTP error response with status 400–599.',
      reject: 'Simulates network failure; the HTTP shell closes the connection directly.',
    },
  },
  sources: {
    title: 'Web sources',
    lead: '`/web` is a Node-only entry. `sources.web()` fetches real web pages and extracts the body text, then hands it to a local summarization algorithm. It does not start a browser, maintain logins or fetch PDFs.',
    notes: { web: 'Web-page body source: fetches HTML/plain text, removes scripts and navigation, then hands the result to a text generator.' },
  },
  protocols: { title: 'Protocols and lifecycles', lead: 'Inspect route support and configure background, batch and file resources.', notes: {} },
  realtime: { title: 'Realtime sessions', lead: 'Exchange native OpenAI Realtime or Gemini Live frames in tests.', notes: {} },
  node: {
    title: 'Node server',
    lead: 'The `/node` entry provides a standalone HTTP server, an embeddable handler and a WebSocket listener. HTTP uses the native routes on the MockGPT instance.',
    notes: {},
  },
};

export const pages = sharedPages.map((page) => {
  const strings = chineseStrings[page.slug];
  return {
    slug: page.slug,
    title: strings.title,
    lead: strings.lead,
    notes: Object.fromEntries(page.notesKeys.map((key) => [key, strings.notes[key]])),
    symbols: page.symbols,
  };
});

export const englishPages = sharedPages.map((page) => {
  const strings = englishStrings[page.slug];
  return {
    slug: page.slug,
    title: strings.title,
    lead: strings.lead,
    notes: Object.fromEntries(page.notesKeys.map((key) => [key, strings.notes[key]])),
    symbols: page.symbols,
  };
});

const pageExamplesChinese = {
  mockgpt: `
### 构造实例

\`\`\`js
import { MockGPT } from '@jangts/mock-gpt';
const mock = new MockGPT({ rules: [...] });
\`\`\`

规则按声明顺序匹配，首个满足条件的规则执行：

\`\`\`js
const mock = new MockGPT({
  seed: 42,
  rules: [
    { prompt: '你好', generator: '你好，欢迎光临小可乐咖啡！' },
    { prompt: /下单/, generator: context => ({ orderId: generators.id('order')(context) }) },
  ],
});
\`\`\`

\`\`\`ts
import type { Rule, MockGPTOptions, Generator, Generated } from '@jangts/mock-gpt';
\`\`\`

### 直接生成 generate()

\`\`\`js
const reply = await mock.generate(
  { model: 'demo', messages: [{ role: 'user', content: '你好' }] },
  { signal },
);
\`\`\`

- \`input\`：\`{ model, messages, ... }\`，附加条件字段可随请求传入；
- 返回 \`Generated\`：字符串、原生 JSON 值，或 \`ResponseDescription\`；
- 返回值是独立冻结快照。

### fetch 适配

支持 \`POST /v1/chat/completions\` 与 \`POST /chat/completions\`，JSON 与 \`stream: true\` 的 SSE：

\`\`\`js
const response = await mock.fetch('https://mock.local/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({ model: 'demo', messages: [{ role: 'user', content: '你好' }] }),
});
\`\`\`

### 记录与重置

\`\`\`js
console.log(mock.records);  // 只读有界内存元数据快照
console.log(mock.counts);   // 各规则命中次数
mock.reset();               // 清空记录、计数与 seed 状态
\`\`\`
`,
  generators: `
值生成器需在规则里先创建，再在每次请求用同一个 \`context\` 求值：

\`\`\`js
import { MockGPT, generators, generatorNames } from '@jangts/mock-gpt';
const orderId = generators.id('order');
const mock = new MockGPT({
  seed: 42,
  rules: [{ prompt: /下单/, generator: context => ({ orderId: orderId(context) }) }],
});
console.log(generatorNames);
\`\`\`

输入相关文本生成器直接作为规则 generator，无真实 LLM，默认处理实例已投影的 \`prompt\` 文本，统一接受可选 \`source\`：

\`\`\`js
const mock = new MockGPT({
  rules: [
    { prompt: /总结/, generator: generators.summary({ maxChars: 120 }) },
    { prompt: /要点/, generator: generators.bullets({ count: 3 }) },
    { prompt: /关键词/, generator: generators.keywords({ count: 5 }) },
    { prompt: /标题/, generator: generators.title() },
    { prompt: /提取/, generator: generators.extract({ fields: { email: /[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}/i } }) },
    { prompt: /继续/, generator: generators.reply() },
  ],
});
\`\`\`

摘要与要点采用 TextRank 风格的句子图排序、MMR 风格的重复控制，在长度预算内选定句子后恢复阅读顺序；最多分析 30,000 码点。
`,
  responses: `
\`\`\`js
import { responses, ResponseDescription } from '@jangts/mock-gpt';
responses.text('分片内容', { chunkSize: 2, intervalMs: 10, delayMs: 50 });
responses.toolCalls([{ name: 'reserve', arguments: { seats: 2 } }]);
responses.httpError(429, { error: { message: 'limited' } });
responses.reject('模拟网络失败');
\`\`\`

\`generators.toolCall(name, args, options?)\` 等价于 \`responses.toolCalls([{ name, arguments: args }], options)\`。

### 显式构造

\`\`\`js
new ResponseDescription('model', { content: '...' });
new ResponseDescription('http', { status: 429, body: { error: {} } });
new ResponseDescription('reject', '模拟网络失败');
\`\`\`

### 自建传输适配

\`\`\`js
import { encodeModelResponse, responses } from '@jangts/mock-gpt';
const response = encodeModelResponse(request, responses.text('你好').value, id, created, signal, finish);
\`\`\`

编码器负责分片、背压、流间隔、工具、usage 与终止帧；适配器负责请求校验、首包前延迟与生命周期。
`,
  sources: `
\`\`\`js
import { MockGPT, generators } from '@jangts/mock-gpt';
import { sources } from '@jangts/mock-gpt/web';

const mock = new MockGPT({
  rules: [{
    prompt: /https?:\\/\\//,
    generator: generators.summary({ source: sources.web() }),
  }],
});
\`\`\`

\`\`\`js
sources.web({ profile: 'browser', headers: { 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' } });
\`\`\`

只用 Node HTTP 请求，默认拒绝本机、私网和保留地址，每次重定向重新检查并固定连接地址。明确的安全验证页即使 HTTP 200 也返回 \`MOCK_WEB_CHALLENGE\`；拦截页返回 \`MOCK_WEB_BLOCKED\`；重定向到登录路径识别为 \`MOCK_WEB_AUTH_REQUIRED\`；超时单独报告 \`MOCK_WEB_TIMEOUT\`。来源诊断记入 \`mock.records\`；HTML 正文提取优先使用 Mozilla Readability，未识别时退化为过滤脚本／样式／导航后的文本。
`,
  node: `
\`\`\`js
import { createMockServer, createMockHandler } from '@jangts/mock-gpt/node';
\`\`\`

### createMockServer

\`\`\`js
const server = createMockServer({ mock });
const address = await server.listen({ host: '127.0.0.1', port: 4317 });
console.log(address.url);
// 测试可用 port: 0；结束时 await server.close()。
\`\`\`

### createMockHandler

交给已有 Node HTTP 服务或开发服务器调用：

\`\`\`js
const handler = createMockHandler({ mock });
\`\`\`

Node 入口先校验 Host，再校验 Origin。反向代理保留自定义域名时用 \`createMockServer({ mock, allowedHosts: ['mock.example'] })\`，或给 handler 设置相同参数；跨域来源须显式登记 \`allowedOrigins\`。

### CLI

\`\`\`sh
npx @jangts/mock-gpt serve --config ./mock.config.mjs
\`\`\`

\`\`\`js
// mock.config.mjs
export default {
  rules: [{ prompt: '你好', generator: '你好，欢迎光临小可乐咖啡！' }],
};
\`\`\`

模型 base URL 默认为 \`http://127.0.0.1:4317/v1\`，可配置 \`--host\`、\`--port\`。配置是可信本地代码，服务不会加载远程配置。
`,
};

const pageExamplesEnglish = {
  mockgpt: `
### Construction

\`\`\`js
import { MockGPT } from '@jangts/mock-gpt';
const mock = new MockGPT({ rules: [...] });
\`\`\`

Rules are evaluated in declared order; the first match wins:

\`\`\`js
const mock = new MockGPT({
  seed: 42,
  rules: [
    { prompt: 'hello', generator: 'Hello, welcome to Microcola Coffee!' },
    { prompt: /order/, generator: context => ({ orderId: generators.id('order')(context) }) },
  ],
});
\`\`\`

\`\`\`ts
import type { Rule, MockGPTOptions, Generator, Generated } from '@jangts/mock-gpt';
\`\`\`

### Direct generation with generate()

\`\`\`js
const reply = await mock.generate(
  { model: 'demo', messages: [{ role: 'user', content: 'hello' }] },
  { signal },
);
\`\`\`

- \`input\`: \`{ model, messages, ... }\`; additional condition fields can be passed with the request.
- Returns \`Generated\`: a string, a native JSON value, or a \`ResponseDescription\`.
- The return value is an independent frozen snapshot.

### Fetch adapter

Supports \`POST /v1/chat/completions\` and \`POST /chat/completions\`, JSON and SSE with \`stream: true\`:

\`\`\`js
const response = await mock.fetch('https://mock.local/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({ model: 'demo', messages: [{ role: 'user', content: 'hello' }] }),
});
\`\`\`

### Records and reset

\`\`\`js
console.log(mock.records);  // read-only bounded in-memory snapshot of metadata
console.log(mock.counts);   // hit count per rule
mock.reset();               // clear records, counts and seed state
\`\`\`
`,
  generators: `
Value generators must be created inside the rule and evaluated with the same \`context\` on each request:

\`\`\`js
import { MockGPT, generators, generatorNames } from '@jangts/mock-gpt';
const orderId = generators.id('order');
const mock = new MockGPT({
  seed: 42,
  rules: [{ prompt: /order/, generator: context => ({ orderId: orderId(context) }) }],
});
console.log(generatorNames);
\`\`\`

Input-aware text generators are used directly as rule generators. They use no real LLM and work on the instance-projected \`prompt\` text by default; all accept an optional \`source\`:

\`\`\`js
const mock = new MockGPT({
  rules: [
    { prompt: /summarize/, generator: generators.summary({ maxChars: 120 }) },
    { prompt: /bullets/, generator: generators.bullets({ count: 3 }) },
    { prompt: /keywords/, generator: generators.keywords({ count: 5 }) },
    { prompt: /title/, generator: generators.title() },
    { prompt: /extract/, generator: generators.extract({ fields: { email: /[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}/i } }) },
    { prompt: /continue/, generator: generators.reply() },
  ],
});
\`\`\`

Summary and bullets use a TextRank-style sentence graph and MMR-style redundancy control, select sentences within a length budget and restore the original reading order. Up to 30,000 code points are analyzed.
`,
  responses: `
\`\`\`js
import { responses, ResponseDescription } from '@jangts/mock-gpt';
responses.text('chunked content', { chunkSize: 2, intervalMs: 10, delayMs: 50 });
responses.toolCalls([{ name: 'reserve', arguments: { seats: 2 } }]);
responses.httpError(429, { error: { message: 'limited' } });
responses.reject('simulated network failure');
\`\`\`

\`generators.toolCall(name, args, options?)\` is equivalent to \`responses.toolCalls([{ name, arguments: args }], options)\`.

### Explicit construction

\`\`\`js
new ResponseDescription('model', { content: '...' });
new ResponseDescription('http', { status: 429, body: { error: {} } });
new ResponseDescription('reject', 'simulated network failure');
\`\`\`

### Custom transport adapter

\`\`\`js
import { encodeModelResponse, responses } from '@jangts/mock-gpt';
const response = encodeModelResponse(request, responses.text('hello').value, id, created, signal, finish);
\`\`\`

The encoder handles chunking, backpressure, stream intervals, tools, usage and finish frames. The adapter handles request validation, pre-first-packet delay and lifecycle.
`,
  sources: `
\`\`\`js
import { MockGPT, generators } from '@jangts/mock-gpt';
import { sources } from '@jangts/mock-gpt/web';

const mock = new MockGPT({
  rules: [{
    prompt: /https?:\\/\\//,
    generator: generators.summary({ source: sources.web() }),
  }],
});
\`\`\`

\`\`\`js
sources.web({ profile: 'browser', headers: { 'Accept-Language': 'en-US,en;q=0.9,zh;q=0.8' } });
\`\`\`

Uses Node HTTP only. By default it rejects localhost, private and reserved addresses; each redirect re-checks and pins the connection address. An explicit security-challenge page returns \`MOCK_WEB_CHALLENGE\` even on HTTP 200; a block page returns \`MOCK_WEB_BLOCKED\`; redirect to a login path is reported as \`MOCK_WEB_AUTH_REQUIRED\`; timeouts are reported separately as \`MOCK_WEB_TIMEOUT\`. Source diagnostics are recorded in \`mock.records\`. HTML body extraction prefers Mozilla Readability and falls back to text filtered from scripts, styles and navigation.
`,
  node: `
\`\`\`js
import { createMockServer, createMockHandler } from '@jangts/mock-gpt/node';
\`\`\`

### createMockServer

\`\`\`js
const server = createMockServer({ mock });
const address = await server.listen({ host: '127.0.0.1', port: 4317 });
console.log(address.url);
// Use port: 0 for tests; call await server.close() when done.
\`\`\`

### createMockHandler

Hand to an existing Node HTTP server or dev server:

\`\`\`js
const handler = createMockHandler({ mock });
\`\`\`

The Node entry validates Host first, then Origin. When a reverse proxy preserves a custom domain, use \`createMockServer({ mock, allowedHosts: ['mock.example'] })\` or set the same option on the handler. Cross-origin sources must be explicitly listed in \`allowedOrigins\`.

### CLI

\`\`\`sh
npx @jangts/mock-gpt serve --config ./mock.config.mjs
\`\`\`

\`\`\`js
// mock.config.mjs
export default {
  rules: [{ prompt: 'hello', generator: 'Hello, welcome to Microcola Coffee!' }],
};
\`\`\`

The model base URL defaults to \`http://127.0.0.1:4317/v1\`; \`--host\` and \`--port\` are configurable. The config is trusted local code; the server does not load remote config.
`,
};

export const pageExamples = {
  zh: pageExamplesChinese,
  en: pageExamplesEnglish,
};
