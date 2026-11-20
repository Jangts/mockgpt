[English](#english) | [中文](#中文)

<a id="english"></a>

# MockGPT

<img src="https://mockgpt-docs.pages.jangts.cafe/branding/mockgpt-logo.png" alt="MockGPT" width="360">

A configurable mock response SDK. Generate replies from fixed content, functions, or lightweight text algorithms without a real LLM, API key, or prepared fixtures.

`@jangts/mock-gpt` · MIT · Node >=22.12 · ESM/CommonJS and TypeScript types. Call `generate()` directly from frontend or server code; you control where it runs and how requests and transport work. Optional fetch integration and a minimal Node server are included. Node HTTP and web extraction load through separate entry points.

## Quick start

```sh
npm install @jangts/mock-gpt
```

```js
import { MockGPT } from '@jangts/mock-gpt';

const mock = new MockGPT({
  rules: [
    { prompt: 'Hello', generator: 'Hello, how can I help?' },
    { prompt: /Generate data/, generator: { title: 'Demo data', status: 'ready' } },
  ],
});

const reply = await mock.generate({
  model: 'demo',
  messages: [{ role: 'user', content: 'Hello' }],
});
console.log(reply); // Hello, how can I help?
```

`generate(input, { signal })` shares rule matching, counters, seed, cancellation, records, and output budgets. It returns a string, native JSON, or explicit `ResponseDescription`, without creating Request/Response objects or executing described delays, chunking, HTTP errors, or SSE. Plain JSON retains its data type; explicit descriptions retain their brand and configuration for the caller to interpret. Input includes `model` and `messages`, with additional condition fields allowed. Results are independent frozen snapshots.

Optional object fields set to `undefined` are omitted without mutating the input. Sparse arrays, array `undefined`, circular references, and non-JSON data are rejected as `MOCK_REQUEST`. Generated output remains strictly validated, including rejection of `undefined`. ESM and CommonJS entry points of the same version can share response descriptions, sequences, and `MockGPTError`; plain JSON does not acquire response-description identity.

Directly constructed `ResponseDescription` objects follow the same validation: HTTP failures need a 400–599 status and body, network failure messages must be strings, and tool proposals require arguments. Cancellation before a generator starts prevents execution; allocated hit counts are not rolled back.

Built-in text generators and web sources snapshot configuration at creation. Later changes to the original options cannot replace the source, template, URL, or trusted loader. The caller remains responsible for external state captured by callbacks.

Frontend applications can wrap responses in simulated requests, streaming interactions, or SSE. Servers can use the same SDK directly. `generate()` records end when generation finishes and do not track the caller’s subsequent transport or display lifecycle.

## Optional fetch adapter

Use the standard fetch adapter to check an existing model client’s protocol:

```js
const response = await mock.fetch('https://mock.local/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({
    model: 'demo',
    messages: [{ role: 'user', content: 'Hello' }],
  }),
});
console.log((await response.json()).choices[0].message.content);
```

`require('@jangts/mock-gpt')` is also supported. `mock.fetch` is bound and can be injected into model SDKs supporting custom fetch. It does not intercept networking globally or forward requests to real models. Supports `POST /v1/chat/completions` and `POST /chat/completions`, JSON, and SSE with `stream: true`.

## Playground configuration demo

Install [MockGPT Playground](https://www.npmjs.com/package/@jangts/mock-gpt-playground) to try output and learn rule and generator configuration. This standalone visual developer tool lets you choose example prompts, inspect matching parameters and generators, and copy configuration or complete source. Try JSON, Markdown images and tables, tool proposals, streaming chunks, and failure scenarios.

```sh
npx @jangts/mock-gpt-playground
```

Open `http://127.0.0.1:2333/` in your browser. Playground is a separately published optional developer tool installed by npx on first use; see its README for flags. It calls `generate()` in the browser and owns simulated requests, JSON/SSE, chunking, and interactions. Static deployment is supported. The SDK npm package does not include Playground; SDK use needs no UI installation or running server.

## Standalone model API server

Configuration is a trusted local module:

```js
// mock.config.mjs
export default {
  rules: [{ prompt: 'Hello', generator: 'Hello, how can I help?' }],
};
```

```sh
npx @jangts/mock-gpt serve --config ./mock.config.mjs
```

The default model base URL is `http://127.0.0.1:4317/v1`; configure `--host` and `--port` as needed. The service provides only the model API. Unmatched requests fail unless a fallback is configured.

Programmatic server and Node request adapter:

```js
import { createMockServer, createMockHandler } from '@jangts/mock-gpt/node';
const server = createMockServer({ mock });
const address = await server.listen({ port: 4317 });
// Tests can use port: 0; call await server.close() when finished.

// Alternatively, use with an existing Node HTTP or development server.
const handler = createMockHandler({ mock });
```

The Node entry validates Host before Origin. By default it accepts localhost, loopback IPs, and the local IP actually reached by the connection. `createMockServer.listen({ host })` also accepts the explicitly bound hostname. For reverse proxies preserving custom domains, use `createMockServer({ mock, allowedHosts: ['mock.example'] })` or the same handler option. `allowedHosts` lists hostnames/IPs without wildcards. `allowedOrigins` separately allows cross-origin sources and does not authorize unregistered Hosts. HTTPS same-origin checks use the actual TLS socket; cross-origin reverse-proxy sources must be explicitly registered.

Calling `listen()` while starting, listening, or closing rejects with `MOCK_ACTIVE` without changing current Host settings. `close()` waits for pending startup; concurrent closes await the same operation. Restarting is allowed afterward.

## Rules and generators

Rules match in declaration order. The first matching, unexhausted rule executes; there is no automatic specificity sorting.

| Option | Behavior |
| --- | --- |
| `prompt` | Exact string or RegExp; defaults to text blocks of the last user message, joined in order with newlines |
| `model` / `when(request)` | Optional model name and synchronous predicate; when receives the standard model request and can match tool results |
| `generator` | String, JSON value, or synchronous/asynchronous function; plain objects produce JSON content |
| `times` / `id` | Optional positive integer use limit and unique ID; defaults to a positional ID |
| `fallback` | Explicit instance-level fallback; absent by default, never connects to a real model |
| `selectPrompt(request)` | Instance-level synchronous text projection for wrapped requests |
| `seed` / `clock` | Random seed and a function returning milliseconds; exact reproduction requires a fixed test environment |

Functions receive `request`, `prompt`, `match`, `callIndex`, `ruleIndex`, `signal`, `random()`, `clock()`, and `report(metadata)`. Requests are frozen snapshots; indexes are assigned on matching. Failure or cancellation does not refund uses. Custom functions should cooperate with signal; external side effects are not automatically rolled back.

```js
import { generators, responses, generatorNames } from '@jangts/mock-gpt';

// Input-dependent, without LLM inference.
generators.summary({ maxChars: 120 });
generators.bullets({ count: 3 });
generators.keywords({ count: 5 });
generators.title({ maxChars: 24 });
generators.extract({ fields: { email: /([\w.+-]+@[\w.-]+)/ } });
generators.reply();

// Primitive data generators return functions, usually evaluated inside a custom generator.
generators.integer(1, 100);
generators.float(0, 1);
generators.boolean();
generators.pick(['a', 'b']);
generators.id();
generators.date();
generators.sentence();
generators.imageUrl({ width: 320, height: 180 }); // Local SVG data URL

generators.sequence(['First round', 'Second round']); // Per-rule hit index within the instance; errors on exhaustion
```

To mock a user profile, create field generators first and evaluate them with the same `context` on every request. Do not place generator functions themselves in returned JSON.

```js
import { MockGPT, generators } from '@jangts/mock-gpt';

const userId = generators.id('user');
const age = generators.integer(18, 60);
const name = generators.pick(['Alex', 'Robin', 'Sam']);
const avatar = generators.imageUrl({ width: 128, height: 128 });

const mock = new MockGPT({
  seed: 42,
  rules: [{
    prompt: 'Generate a user profile',
    generator: context => ({
      id: userId(context), name: name(context),
      age: age(context), avatar: avatar(context),
    }),
  }],
});
```

The complete object is encoded as JSON text in the model reply. Dates, random numbers, and image URLs can all be parts of a reply.

Text generators accept an optional `source`: a fixed string or a function returning a string/`Promise<string>`; the default is the projected prompt. `summary` and `bullets` default to count 3. Default code-point limits are 240 for summary, 500 for bullets, 24 for title, and 500 for reply. Summaries and bullets use TextRank-style sentence-graph ranking and MMR-style redundancy control, restoring reading order after selecting sentences within the length budget. They analyze up to 30,000 code points and 180 candidate sentences distributed throughout the text. Long texts are sampled at the beginning, middle, and end rather than only the beginning. Other text generators use at most the first 30,000 code points. Keywords return a JSON array; extract defaults to email, date, and amount, with null for no match. `maxChars` never truncates JSON into invalid JSON.

Default summaries consist of representative source sentences, without LLM paraphrasing. Inspect `summaryMethod`, `summaryCandidates`, and `summarySelectedIndexes` in `mock.records` to check whether later text was selected. Records do not contain the source body.

Summary quality is not a model-capability guarantee. These generators make output vary with input; strict regressions can still use fixed results.

## Tools and failures

Configure chunking for an entire instance or override it per response:

```js
const mock = new MockGPT({
  stream: { chunkSize: 4, intervalMs: 60, wireChunkSize: 16 },
  rules: [{ generator: 'This is a progressively generated mock reply.' }],
});
```

`chunkSize` limits code points per content/tool-name/tool-arguments delta (default 24); `intervalMs` sets the SSE frame interval (default 0). Optional `wireChunkSize` splits encoded SSE into byte chunks to simulate UTF-8, JSON, or SSE boundaries crossing reads; no extra splitting occurs by default. Actual HTTP networks may merge reads, so clients must still decode incrementally. These settings apply only to requests with `stream: true`. Adjust sizes and intervals to observe generation.

```js
// A tool proposal does not execute a tool; callers own authorization, execution, and results.
generators.toolCall('weather', { city: 'Wuhan' });
responses.toolCalls([{ name: 'weather', arguments: { city: 'Wuhan' } }]);
responses.text('Chunked content', { chunkSize: 2, intervalMs: 10, delayMs: 50 });
responses.text('Interruption test', { interruptAfter: 2 });
responses.httpError(429, { error: { message: 'limited' } });
responses.reject('Simulated network failure');
```

Explicit helpers mark tool calls and failures; ordinary JSON fields are not guessed. Tool arguments are JSON-serialized once. Configure strings directly for invalid JSON bodies. Invalid tool arguments and raw malformed SSE are not generated automatically; keep handwritten fixtures for these low-level negative parsing tests.

`usage` accepts only explicit mock `{ prompt_tokens, completion_tokens, total_tokens }` values; it does not estimate real tokens. SSE sends a usage chunk only when the request sets `stream_options.include_usage` and usage is configured. Only one choice (`n=1`) is supported.

Custom transport adapters can reuse `encodeModelResponse(request, output, id, created, signal, finish)` to encode validated `ModelRequest` and `ModelOutput` into a Chat Completions JSON/SSE `Response`. For `output`, use `responses.text`/`responses.toolCalls` or the `value` of a model description returned by `mock.generate()`. `created` is Unix seconds; `finish(error?, cancelled?)` is called on completion, failure, or cancellation. Adapters own request validation, pre-first-packet `delayMs`, IDs, and lifecycle. The encoder owns demand-driven chunks, backpressure, intervals, tools, usage, and termination frames. It does not execute rules, change MockGPT records, or merge generation and transport lifecycles. Content chunks are read lazily by code point without expanding the whole text first.

## Web access and summaries

```js
import { sources } from '@jangts/mock-gpt/web';
const webMock = new MockGPT({
  rules: [{ prompt: /https?:\/\//, generator: generators.summary({ source: sources.web({
    fallback: 'I cannot access live web pages right now. Paste the article text and I can summarize it.',
  }) }) }],
});
// Input: Summarize https://example.com/article
```

Web sources fetch actual HTML/plain text, remove scripts, styles, and component templates, then use Readability to extract article text for local summarization, keeping template CSS out of results. Options: `url` (fixed address/context function), `timeoutMs` (20,000, covering connection and full body download), `maxBytes` (2 MiB), `maxChars` (30,000), and `maxRedirects` (3). By default the unique URL is read from the prompt. Ordinary generators do not access the network.

Web sources use ordinary HTTP fetching with a default 20-second total budget. Retrieved text goes to the text generator. The example explicitly configures `fallback` to generate a mock reply from alternative source text on read failure; SSE is supported too. No browser, login, or Cookie configuration is required. Real agents typically retrieve material with a web tool and supply it as model input; tool-result text can be passed directly to `generators.summary({ source })`.

`fallback` is explicitly configured alternative source text, still processed by the chosen text generator. Without it, read failures terminate with a source error, suitable for strict tests. Diagnostics retain `sourceError`, upstream status, and other details, marking replacement text with `sourceFallback: true` rather than successful retrieval. Cancellation always aborts without a fallback reply. URL format and destination validation errors still fail.

By default, ordinary HTTP requests use a browser-compatible User-Agent and standard HTML Accept, language, and compression headers. Override `User-Agent`, `Accept`, and `Accept-Language` through `headers`. `profile` accepts `'browser'` or its alias `'crawler'`, using identical headers. Configuration snapshots remain consistent across redirects. Host, Cookie, and Authorization overrides are rejected.

```js
sources.web({ profile: 'browser', headers: { 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' } });
```

All DNS destinations are validated before use and connection addresses are pinned. Only connection failures allow fallback across at most four validated addresses; 403 responses or challenge pages do not trigger address rotation. Redirects are bounded, checked at every hop, and checked for loops. Recognized security challenges return `MOCK_WEB_CHALLENGE` even with HTTP 200 instead of being summarized as articles. HTTP rejection retains `details.upstreamStatus`. Untitled rejection pages whose body explicitly identifies a firewall block return `MOCK_WEB_BLOCKED` with `reason: firewall-denied`. Nonstandard status codes such as 567 alone do not determine the cause, explicit blocks are not retried automatically, and timeouts report `MOCK_WEB_TIMEOUT` separately. Request compatibility measures do not guarantee passing site challenges or access restrictions.

Fetching runs in Node; `/web` is Node-only. Local, private, and reserved addresses are denied by default. Every redirect is rechecked and connection addresses are pinned. Model-request credentials are not forwarded. Supports gzip/deflate/br and TextDecoder encodings, with limits before and after decompression. Does not execute page JavaScript, log in, or fetch PDFs; not every login/challenge page is guaranteed to be recognized.

Automated tests can inject a trusted `load(url, signal, maxBytes)` returning `{ bytes, url, contentType }`; the injector owns destination restrictions. Pages change, so a fixed seed alone cannot reproduce live fetching. Source diagnostics appear in `mock.records`; default summaries remain plain text. HTTP sources retain `webStage` (DNS/connection/TLS/headers/body), received transfer bytes `receivedBytes`, and observed `upstreamStatus`, including after timeouts. This distinguishes incomplete downloads after HTTP 200 from sites returning 403.

Web sources use only Node HTTP requests, without installing or launching browsers or maintaining login sessions. Redirects to common login paths produce `MOCK_WEB_AUTH_REQUIRED`; explicit fallback or the caller determines the reply. Login pages are not summarized as articles.

## Records and reset

`mock.records` is a bounded in-memory metadata snapshot, defaulting to 100 records; set `recordLimit: 0` to disable it. It stores neither full bodies nor authorization headers and does not persist automatically. Sources can explicitly contribute up to 8 KiB of metadata; trusted configuration controls its content.

Built-in web-source diagnostics retain at most 512 code points each for requested and final URLs, marking truncation with `urlTruncated: true`. Actual requests use full URLs so long addresses do not exhaust diagnostics budgets and interfere with body processing.

`mock.counts` returns rule hit counts; `mock.activeRequests` counts ongoing generation and, with the optional fetch adapter, unconsumed SSE. Requests are released when responses finish reading, bodies are cancelled, or requests are aborted. `reset()` fails while requests are active; otherwise it clears records, rule counts, and seed state, but not custom functions’ external closures. Remaining sequence capacity is its configured item count minus the corresponding hit count.

Optional fetch request bodies default to a 1 MiB limit. Both entry paths default to 1,000,000 output code points, with serialized length used for tool descriptions. Configure `maxBodyBytes`/`maxOutputChars` to change these. Unmatched calls and generation errors reject in-process; HTTP wrappers map them to error responses with codes. Explicit `responses.reject` closes the HTTP connection directly to distinguish network failure from HTTP errors. Interrupted streams do not append a successful termination frame. Request-format and routing errors return the corresponding 4xx Response directly.

JSON snapshots allow at most 64 levels and 100,000 value nodes. Overly complex requests return `MOCK_REQUEST` (400); generated output reports `MOCK_GENERATION`. Snapshots read each field once before validation and encoding, without calling hidden `toJSON` methods. Names such as `__proto__` are retained as ordinary own data fields.

## Configuration assistant Skill

Bundled entry: [`skills/mock-gpt-config/SKILL.md`](skills/mock-gpt-config/SKILL.md). Copy the entire directory according to your coding assistant’s discovery rules. Installing the npm package does not change global user configuration.

Prepare mock configuration from requirements/designs, then adapt it to an existing agent’s actual requests and generate necessary tests. This optional authoring aid is not part of the runtime and does not require preparing fixtures first.

## Implementation and scope

Protocol verification includes an independent official SDK and does not call paid models.

From the repository root, `npm run test:agent-audit -- --repeat=2` runs MockGPT logic, security, and performance regressions twice. It merges V8 ranges with c8/Istanbul and checks coverage includes every generated ESM module. Statement, line, function, and branch coverage must all reach 100%; uncovered logic fails the audit. Coverage and the latest summary are written to `.tmp/agent-audit/`; `--no-build` reuses existing builds. Performance regressions check repeated work counts for history trimming, preview paths, and schema measurement, avoiding fixed timing thresholds dependent on machine speed.

The `src/` root contains three public entry points (`index.ts`, `node.ts`, `web.ts`) and shared types in `types.ts`. Implementation is organized by responsibility:

| Directory | Responsibility |
| --- | --- |
| `runtime/` | Rule matching, call state, Chat Completions requests and JSON/SSE response encoding, response declarations |
| `generators/` | Generator registration, text extraction, tokenization, and summarization algorithms |
| `node/` | Node HTTP request adapter and standalone model API server |
| `sources/` | Web article sources, HTTP fetching, address validation, and compressed transfer |
| `shared/` | JSON validation, cancellation, byte reading, errors, and other primitives |

Internal modules import implementations directly; public entry points provide stable exports. Builds first clean the package’s generated `dist/` to avoid stale output after source moves.

Responses/Anthropic APIs, schema-based data generation, remote configuration management, and a tool-execution framework are not provided. Further classification, Q&A, and outline generators remain future work; see [Design and phases](docs/design.md). See [MIT LICENSE](LICENSE) for licensing.

---

<a id="中文"></a>

# MockGPT

<img src="https://mockgpt-docs.pages.jangts.cafe/branding/mockgpt-logo.png" alt="MockGPT" width="360">

可配置的模拟应答 SDK。用固定内容、函数或轻量文本算法组织回复，无需真实 LLM、API key 或预先准备 fixture。

`@jangts/mock-gpt` · MIT · Node >=22.12 · ESM／CommonJS 与 TypeScript 类型。`generate()` 可由前端或服务端直接调用；挂载位置、请求与传输方式由使用者决定。已有 `fetch` 适配和最小 Node server 可选使用；Node HTTP 与网页提取从独立子入口加载。

## 最简使用

```sh
npm install @jangts/mock-gpt
```

```js
import { MockGPT } from '@jangts/mock-gpt';

const mock = new MockGPT({
  rules: [
    { prompt: '你好', generator: '你好，有什么可以帮你？' },
    { prompt: /生成资料/, generator: { title: '演示资料', status: 'ready' } },
  ],
});

const reply = await mock.generate({
  model: 'demo',
  messages: [{ role: 'user', content: '你好' }],
});
console.log(reply); // 你好，有什么可以帮你？
```

`generate(input, { signal })` 共用规则匹配、计数、seed、取消、记录和输出预算，返回字符串、原生 JSON 或显式 `ResponseDescription`，不创建 Request／Response，不执行描述中的延迟、切片、HTTP 错误或 SSE。普通 JSON 保持数据类型；显式描述保留品牌和配置，交给调用方解释。输入含 `model`、`messages`，允许附加条件字段；返回值是独立冻结快照。

输入对象中值为 `undefined` 的可选字段会被省略，不修改原对象；数组空位、数组中的 `undefined`、循环引用及非 JSON 数据仍作为 `MOCK_REQUEST` 拒绝。生成结果继续严格校验，不省略输出中的 `undefined`。同一版本的 ESM 与 CommonJS 入口可混用响应描述、sequence 和 `MockGPTError`，普通 JSON 不会获得响应描述身份。

直接构造的 `ResponseDescription` 也必须遵守相同校验：HTTP 故障状态为 400—599 且包含 body，网络故障消息为字符串，工具提议必须包含 arguments。取消若发生在生成器开始执行前，会阻止执行；已经分配的命中次数仍不回退。

内置文本生成器与网页来源在创建时保存配置快照；之后修改原 options 对象不会替换 source、template、URL 或可信 load。回调函数自身捕获的外部状态仍由调用方负责。

前端应用可自行把应答包装成模拟请求、流式交互或 SSE；服务端也可直接使用同一 SDK。`generate()` 的记录在生成完成时结束，不追踪调用方后续的传输或展示生命周期。

## 可选 fetch 适配

需要检查既有模型客户端协议时，可使用已有的标准 fetch 适配：

```js
const response = await mock.fetch('https://mock.local/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({
    model: 'demo',
    messages: [{ role: 'user', content: '你好' }],
  }),
});
console.log((await response.json()).choices[0].message.content);
```

也可 `require('@jangts/mock-gpt')`。`mock.fetch` 已绑定，可直接注入支持自定义 fetch 的模型 SDK；不会全局拦截网络，也不把模型请求转发给真实模型。支持 `POST /v1/chat/completions` 与 `POST /chat/completions`，JSON 和 `stream: true` 的 SSE。

## Playground 配置演示

想先体验生成效果、了解规则和生成器怎么配置，可以安装使用 [MockGPT Playground](https://www.npmjs.com/package/@jangts/mock-gpt-playground)。它是基于 `@jangts/mock-gpt` 的独立可视化开发工具：选择示例问句即可试用，在对应面板查看匹配参数与生成器，复制配置或完整示例源码；也可体验 JSON、Markdown 图片和表格、工具提议、流式分片及故障场景。

```sh
npx @jangts/mock-gpt-playground
```

然后在浏览器打开 `http://127.0.0.1:2333/`。Playground 是单独发布的可选开发工具，首次运行由 npx 安装；具体参数见其 README。它在浏览器中调用 `generate()`，自行维护模拟请求、JSON／SSE、切片与交互，也支持纯静态部署。MockGPT 的 npm 包不包含 Playground，使用 SDK 无需安装界面或启动 server。

## 独立模型 API 服务

配置文件是可信本地模块：

```js
// mock.config.mjs
export default {
  rules: [{ prompt: '你好', generator: '你好，有什么可以帮你？' }],
};
```

```sh
npx @jangts/mock-gpt serve --config ./mock.config.mjs
```

模型 base URL 默认为 `http://127.0.0.1:4317/v1`，可配置 `--host`、`--port`。服务只提供模型 API，未匹配规则且没有 fallback 时会报错。

编程式服务与 Node 请求适配：

```js
import { createMockServer, createMockHandler } from '@jangts/mock-gpt/node';
const server = createMockServer({ mock });
const address = await server.listen({ port: 4317 });
// 测试可用 port: 0；结束时 await server.close()。

// 也可交给已有 Node HTTP 服务或开发服务器调用。
const handler = createMockHandler({ mock });
```

Node 入口先校验 Host，再校验 Origin。默认接受 localhost、回环 IP 和本次连接实际到达的本地 IP；`createMockServer.listen({ host })` 还接受明确绑定的主机名。反向代理保留自定义域名时，使用 `createMockServer({ mock, allowedHosts: ['mock.example'] })` 或给 handler 设置相同参数。`allowedHosts` 登记主机名／IP，不支持通配符；`allowedOrigins` 单独允许指定跨域来源，不会放行未登记的 Host。HTTPS 同源判断使用实际 TLS socket；反向代理跨域来源须显式登记。

启动中、监听中或关闭中再次 `listen()` 会以 `MOCK_ACTIVE` 拒绝，不修改当前 Host 配置。`close()` 会等待尚未完成的启动；并发关闭等待同一次关闭完成，之后允许重新启动。

## 规则与生成器

规则按声明顺序匹配，第一个满足条件且未耗尽的规则执行。不按“具体程度”自动排序。

| 配置 | 行为 |
| --- | --- |
| `prompt` | 字符串精确匹配或 RegExp；默认比较最后一条 user 消息中的文本块，按原顺序以换行拼接 |
| `model`／`when(request)` | 可选模型名及同步请求谓词；when 收到标准模型请求，可匹配工具回执 |
| `generator` | 字符串、JSON 值或同步／异步函数；普通对象产生 JSON 内容 |
| `times`／`id` | 可选正整数使用次数及唯一标识；默认位置 ID |
| `fallback` | 实例级显式兜底；默认无兜底，不连接真实模型 |
| `selectPrompt(request)` | 实例级同步文本投影，用于包装后的请求 |
| `seed`／`clock` | 随机源初值及返回毫秒时间的函数；固定测试环境才能保证逐字复现 |

函数收到 `request`、`prompt`、`match`、`callIndex`、`ruleIndex`、`signal`、`random()`、`clock()` 和 `report(metadata)`。请求是冻结快照，序号在匹配时分配；失败或取消不归还次数。自定义函数应配合 signal，外部副作用不自动撤销。

```js
import { generators, responses, generatorNames } from '@jangts/mock-gpt';

// 输入相关，无 LLM 推理。
generators.summary({ maxChars: 120 });
generators.bullets({ count: 3 });
generators.keywords({ count: 5 });
generators.title({ maxChars: 24 });
generators.extract({ fields: { email: /([\w.+-]+@[\w.-]+)/ } });
generators.reply();

// 基础造数器返回函数，通常在自定义 generator 内组合求值。
generators.integer(1, 100);
generators.float(0, 1);
generators.boolean();
generators.pick(['a', 'b']);
generators.id();
generators.date();
generators.sentence();
generators.imageUrl({ width: 320, height: 180 }); // 本地 SVG data URL

generators.sequence(['第一轮', '第二轮']); // 每条规则的实例内命中序号；耗尽报错
```

例如模拟模型返回一份用户资料：先创建字段生成器，再在每次请求中传入同一个 `context` 求值。不要把生成器函数本身放进返回的 JSON。

```js
import { MockGPT, generators } from '@jangts/mock-gpt';

const userId = generators.id('user');
const age = generators.integer(18, 60);
const name = generators.pick(['小雨', '星河', '暖暖']);
const avatar = generators.imageUrl({ width: 128, height: 128 });

const mock = new MockGPT({
  seed: 42,
  rules: [{
    prompt: '生成用户资料',
    generator: context => ({
      id: userId(context), name: name(context),
      age: age(context), avatar: avatar(context),
    }),
  }],
});
```

完整对象会编码为模型回复的 JSON 文本。日期、随机数和图片地址都可以作为回复中的组成部分。

文本生成器可选 `source`：固定字符串，或返回字符串／`Promise<string>` 的函数；默认是投影 prompt。`summary`／`bullets` 的默认 count 为 3；`summary` 默认最多 240 码点，bullets 500、title 24、reply 500。摘要和要点采用 TextRank 风格的句子图排序、MMR 风格的重复控制，在长度预算内选定句子后才恢复阅读顺序。最多分析 30,000 码点、180 个分布于全文的候选句；超长文本按首／中／尾采样，不固定只保留开头。其余文本生成器仍使用最多前 30,000 码点。关键词返回 JSON 数组；extract 默认提取 email、date、amount，无匹配为 null。JSON 结果不因 `maxChars` 被截成不合法 JSON。

默认摘要仍由原文代表句组成，不进行 LLM 释义改写。`mock.records` 中的 `summaryMethod`、`summaryCandidates`、`summarySelectedIndexes` 可检查它是否实际选到了后文，记录不包含原文正文。

摘要是否合理不作为模型能力保证；这些生成器用于让结果随输入变化。严格回归仍可直接使用固定结果。

## 工具与故障

分片可以对整个实例配置，也可以由单条响应覆盖：

```js
const mock = new MockGPT({
  stream: { chunkSize: 4, intervalMs: 60, wireChunkSize: 16 },
  rules: [{ generator: '这是一段逐步生成的模拟回答。' }],
});
```

`chunkSize` 控制每个内容／工具名称／工具参数 delta 的最多码点数（默认 24）；`intervalMs` 是 SSE 帧间隔（默认 0）。可选 `wireChunkSize` 将编码后的 SSE 数据再按字节切开，模拟中文 UTF-8、JSON 或 SSE 边界跨读取块的情况；默认不额外切分。真实 HTTP 网络可能合并读取块，客户端仍必须增量解码。以上仅在请求 `stream: true` 时应用。可配置分片大小和间隔以观察生成过程。

```js
// 工具提议不等于执行工具；调用方仍负责授权、执行与回执。
generators.toolCall('weather', { city: '武汉' });
responses.toolCalls([{ name: 'weather', arguments: { city: '武汉' } }]);
responses.text('分片内容', { chunkSize: 2, intervalMs: 10, delayMs: 50 });
responses.text('中断测试', { interruptAfter: 2 });
responses.httpError(429, { error: { message: 'limited' } });
responses.reject('模拟网络失败');
```

工具调用和故障通过显式 helper 标记，不猜测普通 JSON 字段。工具参数按 JSON 序列化一次；非法 JSON 正文可以直接配置字符串。首版不自动制造非法工具参数或原始损坏 SSE；这类底层负向解析测试应保留手写 fixture。

`usage` 仅接受显式 `{ prompt_tokens, completion_tokens, total_tokens }` 模拟数值，不估算真实 token。SSE 只在请求 `stream_options.include_usage` 且已配置 usage 时发送用量块。当前只支持一个 choice（`n=1`）。

自建传输适配器可复用 `encodeModelResponse(request, output, id, created, signal, finish)`：将已校验的 `ModelRequest` 和 `ModelOutput` 编码为 Chat Completions JSON／SSE `Response`。`output` 使用 `responses.text`／`responses.toolCalls` 或 `mock.generate()` 返回的 model 描述中的 `value`；`created` 为 Unix 秒，`finish(error?, cancelled?)` 在响应完成、失败或取消时调用。适配器负责请求校验、首包前的 `delayMs`、ID 与生命周期，编码器负责按需分片、背压、流间隔、工具、usage 和终止帧。此函数不执行规则、不改变 MockGPT 记录，也不将生成与传输的生命周期合并。内容分片按码点惰性读取，不先展开完整文本。

## 网页访问与摘要

```js
import { sources } from '@jangts/mock-gpt/web';
const webMock = new MockGPT({
  rules: [{ prompt: /https?:\/\//, generator: generators.summary({ source: sources.web({
    fallback: '我目前不支持访问实时网页。你可以把网页正文发给我，我可以帮你总结。',
  }) }) }],
});
// 输入：总结 https://example.com/article
```

网页来源真实获取 HTML／纯文本，先排除脚本、样式和组件模板，再由 Readability 提取正文，交给本地摘要算法，避免模板内的 CSS 混入结果。可选 `url`（固定地址／上下文函数）、`timeoutMs`（20,000，覆盖连接与完整正文下载）、`maxBytes`（2 MiB）、`maxChars`（30,000）和 `maxRedirects`（3）。默认从 prompt 读取唯一 URL。普通生成器不联网。

网页来源使用普通 HTTP 抓取和默认 20 秒总预算。取得正文时交给文本生成器；上例显式配置 `fallback`，读取失败后使用替代来源文本生成模拟回复，也支持 SSE。无需浏览器、登录或 Cookie 配置。真实 Agent 通常由网页工具取得资料，再将资料作为模型输入；可直接把工具回执中的正文交给 `generators.summary({ source })`。

`fallback` 是显式配置的替代来源文本，随后仍经过所选文本生成器；未配置时，读取失败按来源错误退出，适合严格测试。诊断保留 `sourceError`、上游状态等，并以 `sourceFallback: true` 标记替代文本；不会记录为成功取得原文。请求取消始终中止，不生成兜底回复。URL 格式和目标地址校验仍然报错。

默认使用浏览器兼容 User-Agent、常规 HTML Accept、语言及压缩请求头，通过普通 HTTP 请求读取网页内容。可通过 `headers` 覆盖 `User-Agent`、`Accept`、`Accept-Language`。`profile` 可取 `'browser'` 或其别名 `'crawler'`，两者使用相同请求头。配置快照在重定向中保持一致，不接受 Host、Cookie 或 Authorization 覆盖。

```js
sources.web({ profile: 'browser', headers: { 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' } });
```

DNS 返回的目标均先校验，连接地址保持固定；仅连接失败时在最多四个已校验地址间回退，不因 403 或验证页轮换地址重试。有限重定向逐跳校验，并检测循环。对于明确的安全验证页，即使 HTTP 为 200 也返回 `MOCK_WEB_CHALLENGE`，不把它总结为文章；HTTP 拒绝保留 `details.upstreamStatus`；无标题但正文明确说明防火墙拦截的拒绝页返回 `MOCK_WEB_BLOCKED` 和 `reason: firewall-denied`。不单凭 567 等非标准状态码推断原因，不自动重试明确的拦截；超时单独报告 `MOCK_WEB_TIMEOUT`。这些请求兼容措施不保证通过站点的人机验证或访问限制。

Node 执行抓取；`/web` 是 Node 专属入口。默认拒绝本机、私网和保留地址，每次重定向重新检查并固定连接地址，不携带模型请求的鉴权信息。支持 gzip／deflate／br 及 TextDecoder 支持的字符编码，限制解压前后大小。首版不执行页面 JS、不登录、不抓 PDF，不保证登录／验证页面都能识别。

自动测试可注入可信的 `load(url, signal, maxBytes)`，返回 `{ bytes, url, contentType }`；注入方负责目标限制。页面会变化，实时抓取不能只凭相同 seed 重现。来源诊断在 `mock.records` 中，默认摘要仍是纯文本。HTTP 来源记录 `webStage`（DNS／连接／TLS／响应头／正文）、已接收的传输字节数 `receivedBytes` 和已观察到的 `upstreamStatus`，超时后也保留；收到 200 后下载未完成与网站返回 403 可据此区分。

网页来源仅使用 Node HTTP 请求，不安装或启动浏览器，不维护登录会话。文章被重定向到常见登录路径时识别为 `MOCK_WEB_AUTH_REQUIRED`，由显式 fallback 或调用方决定回复；不会把登录页当成文章总结。

## 记录与重置

`mock.records` 是有界内存元数据快照，默认最多 100 条，可设 `recordLimit: 0` 关闭；不存完整正文或鉴权 header，不自动落盘。来源可显式贡献最多 8 KiB 元数据；此入口由可信配置负责选取内容。

内置网页来源的请求／最终 URL 诊断各最多 512 码点，截短时标记 `urlTruncated: true`；实际网络请求仍使用完整地址，避免长 URL 耗尽诊断额度而影响正文处理。

`mock.counts` 返回各规则命中次数，`mock.activeRequests` 统计生成中的调用；使用可选 `fetch` 适配时还包括未消费的 SSE。读取完响应、取消 body 或取消请求后释放。存在活动请求时 `reset()` 报错；否则清空记录、规则计数与 seed 状态，不重置自定义函数外部闭包。sequence 剩余量可由配置项数减去对应命中数判断。

可选 `fetch` 适配的请求体默认最多 1 MiB；两种入口的输出默认最多 1,000,000 码点（工具描述计序列化长度），可用 `maxBodyBytes`／`maxOutputChars` 配置。调用／匹配未命中和生成错误在进程内 reject；HTTP 壳映射为带 code 的错误响应。显式 `responses.reject` 在 HTTP 壳中直接关闭连接，以区别于 HTTP 错误响应；流中断也不会补成功终止帧。请求格式与路由错误直接返回相应 4xx Response。

JSON 快照最多 64 层、100,000 个值节点；超出复杂度的请求返回 `MOCK_REQUEST`（400），生成结果报 `MOCK_GENERATION`。快照仅读取每个字段一次，再执行校验与编码，不调用输入对象的隐藏 `toJSON` 方法；`__proto__` 等名称作为普通自有数据字段保留。

## 配置辅助 Skill

随包入口：[`skills/mock-gpt-config/SKILL.md`](skills/mock-gpt-config/SKILL.md)。按编码助手的发现规则复制整个目录即可；安装 npm 包不会自动改用户全局配置。

支持从需求／设计先准备模拟配置，再适配已有 Agent 的真实请求并生成必要测试。它是可选编写辅助，不参与运行时，不要求使用者先整理 fixture。

## 实现与范围

协议验证包含独立官方 SDK，不调用付费模型。

仓库根目录的 `npm run test:agent-audit -- --repeat=2` 连续运行 MockGPT 的逻辑、安全和性能回归，通过 c8／Istanbul 合并 V8 区间，检查全部生成的 ESM 模块是否纳入覆盖统计。语句、行、函数与分支覆盖率均须达到 100%，存在未覆盖逻辑时审计失败。覆盖率与最新摘要写入 `.tmp/agent-audit/`；`--no-build` 可复用已有构建。性能回归检查历史裁切、预览路径和 schema 计量的重复工作次数，避免依赖机器速度的固定耗时阈值。

`src/` 根目录保留三个公开入口（`index.ts`、`node.ts`、`web.ts`）与公共类型 `types.ts`，实现按职责组织：

| 目录 | 职责 |
| --- | --- |
| `runtime/` | 规则匹配、调用状态、Chat Completions 请求与 JSON／SSE 响应编码、响应声明 |
| `generators/` | 生成器注册及文本提取、分词和摘要算法 |
| `node/` | Node HTTP 请求适配与独立模型 API 服务 |
| `sources/` | 网页正文来源、HTTP 抓取、地址校验与压缩传输 |
| `shared/` | JSON 校验、取消、字节读取及错误等基础函数 |

内部模块直接导入实现；公开入口负责稳定导出。构建先清理本包生成的 `dist/`，避免源码移动后旧产物残留。

当前没有 Responses／Anthropic API、schema 造数、远程配置管理或工具执行框架。更多分类／问答／大纲生成器留待后续，详见[设计与分期](docs/design.md)。许可证见 [MIT LICENSE](LICENSE)。
