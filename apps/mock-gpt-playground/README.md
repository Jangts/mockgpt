[English](#english) | [中文](#中文)

<a id="english"></a>

# MockGPT Playground

<img src="https://mockgpt-docs.pages.jangts.cafe/branding/mockgpt-logo.png" alt="MockGPT" width="360">

A standalone visual development tool built on [MockGPT (`@jangts/mock-gpt`)](https://www.npmjs.com/package/@jangts/mock-gpt) for trying mock model output and learning and inspecting configurations. The SDK handles rule matching and response generation. Playground calls `generate()` in the browser and implements mock requests, JSON/SSE, chunking, delays, and failure interactions. No real LLM or API key required. MIT licensed.

## Install and run

Requires Node >=22.12. Run directly:

```sh
npx @jangts/mock-gpt-playground
```

npx installs the package on first use. Open `http://127.0.0.1:2333/` in your browser. The command serves prebuilt static pages; response generation and request simulation happen in the browser. Press Ctrl+C to stop.

Alternatively, install the command globally:

```sh
npm install --global @jangts/mock-gpt-playground
mock-gpt-playground
```

Optional flags: `--host` and `--port`. By default, it listens only on `127.0.0.1:2333` and reports an error if the port is occupied. Use `mock-gpt-playground --port 2334` to choose another port, or `--help` for usage.

## Static deployment

[Live demo](https://mockgpt-playground.pages.jangts.cafe/). For deployment on your own static host, see [Static hosting](docs/static-hosting.md).

To build, package, and upload to this repository’s Pages host, run from the workspace root:

```sh
npm run deploy --workspace @jangts/mock-gpt-playground
```

You can also run `npm run deploy` from this application directory. The entry point is `scripts/deploy.mjs`. `scripts/deploy.config.json` contains the target server, SSH key path, Pages root, and site name. It stores credential paths only, never keys; update paths when moving computers. Local requirements: Node/npm, tar, and OpenSSH. Server requirements: Python 3.9+ and existing sudo access.

The script builds the MockGPT SDK and Playground in order, archives only `dist/` into a temporary file, uploads it with `scp`, and verifies the archive and every file using SHA-256 over SSH. After verification it replaces `pages/mockgpt-playground/` and removes old output and temporary files. Failed verification preserves the current site. A per-site lock prevents concurrent deployments; other sites and the shared 404 are unaffected. It does not modify NPM, DNS, certificates, or restart services. Deployment scripts are repository maintenance tools and are not distributed in the npm package.

To build without uploading, run from the workspace root:

```sh
npm run build --workspace @jangts/mock-gpt
npm run build --workspace @jangts/mock-gpt-playground
```

Upload all contents of `apps/mock-gpt-playground/dist/` to static hosting. Both domain roots and subdirectories are supported, with no API service, reverse proxy, or deployed Node runtime required. Built HTML uses relative asset paths. For repository development use `npm run mockgpt:playground`; for local static preview use `npm run preview --workspace @jangts/mock-gpt-playground`.

The scenario catalog and copyable example source are bundled with the page. SSE is simulated internally with `ReadableStream`/`Response`; real model requests are not sent to a server. `chunkSize` controls content chunks and `wireChunkSize` controls UTF-8 byte chunks. The application also handles intervals, stopping, and interruption after a specified number of chunks.

Mock request bodies are limited to 1 MiB. Invalid JSON/request structures return 400; oversized bodies return 413. Neither executes generators. Stopping also works while reading request bodies, without waiting for custom stream cleanup.

Web reading makes an explicit external request with browser fetch, subject to the target’s CORS policy, HTTPS mixed-content rules, and browser access restrictions. It summarizes retrieved text, preserves the existing failure message on read errors, and stays cancelled when the user stops. It uses neither a proxy nor MockGPT’s Node web source.

HTTP rejection, unsupported content types, and read-limit violations cancel the response body without waiting for custom stream cleanup. URL diagnostics retain at most 512 characters and mark truncation; actual requests use the full address. Default mock-stream chunk settings are validated and snapshotted when the adapter is created.

## Inspect configuration and try output

A full-width header sits above a prompt list on the left, Chat in the center, and matching configuration on the right. Mobile shows Chat only; header icons open the list and configuration drawers, and choosing a prompt closes the list.

- Click a welcome shortcut to send immediately; choosing a scenario on the left fills the input so you can edit before sending.
- Inspect matching parameters and generators on the right. Copy generator contents or complete example source into your own MockGPT configuration.
- Try JSON data, Markdown images and tables, summaries, tool proposals, streaming chunks, stopping, rate limits, and interrupted connections.

MockGPT works independently in frontend or Node applications, with optional model-SDK fetch integration and a minimal HTTP service. See the [MockGPT documentation](https://www.npmjs.com/package/@jangts/mock-gpt) for rules, generators, and service integration. Playground depends directly on MockGPT and owns its UI, built-in examples, and mock requests.

Copied output is a standalone TypeScript module with SDK imports, field-generation rules, and required local dependencies. Generator modules default-export a generator; full configurations default-export a MockGPT configuration. Use directly in TypeScript projects; compile to the appropriate ESM/CommonJS module before passing to the Node CLI. Web examples use browser APIs and target browsers; use the SDK’s `/web` entry point for Node web sources. Example expressions come from actual factory arguments, without serializing function closures or converting response descriptions into plain JSON.

Copied modules import only SDK values and types they actually use. Regressions type-check with `strict`, `noUnusedLocals`, and `noUnusedParameters`.

## Examples and sessions

Includes 35 examples. The prompt list and configuration panel share one scenario declaration. Each page has its own MockGPT instance. Refreshing resets rule counts; clearing chat only removes page messages. Images use local SVG mock data. Image and table replies use Markdown, and copy buttons preserve raw text. Tool proposals are displayed only, never executed.

Data and content examples draw from larger candidate pools: 40 names, 30 drinks (including 24 coffees), 20 biographies, and varied story, task, city, and book themes. Users and orders within a batch do not repeat candidates; coffee recommendations select only coffee items. Selection uses MockGPT’s seeded random source; fixed seed, clock, and request order reproduce results. Summaries remain input-derived, while fault and sequence scenarios remain stable.

---

<a id="中文"></a>

# MockGPT Playground

<img src="https://mockgpt-docs.pages.jangts.cafe/branding/mockgpt-logo.png" alt="MockGPT" width="360">

基于 [MockGPT（`@jangts/mock-gpt`）](https://www.npmjs.com/package/@jangts/mock-gpt) 的独立可视化开发工具，用于体验模拟模型输出、学习和检查配置。MockGPT SDK 负责规则匹配与应答组织，Playground 在浏览器中调用 `generate()`，自行包装模拟请求、JSON／SSE、切片、延迟和故障交互，无需真实 LLM 或 API key。MIT 许可证。

## 安装与启动

需要 Node >=22.12，直接运行：

```sh
npx @jangts/mock-gpt-playground
```

首次运行由 npx 安装，随后在浏览器打开 `http://127.0.0.1:2333/`。命令只提供已构建的静态页面；应答生成与请求模拟在浏览器内完成。按 Ctrl+C 停止。

也可安装命令后使用：

```sh
npm install --global @jangts/mock-gpt-playground
mock-gpt-playground
```

可选 `--host`、`--port`；默认只监听 `127.0.0.1:2333`，端口被占用时会报错，可用 `mock-gpt-playground --port 2334` 指定其他端口。`--help` 查看命令说明。

## 纯静态部署

线上体验：<https://mockgpt-playground.pages.jangts.cafe/>。部署到自己的静态托管服务见[静态托管说明](docs/static-hosting.md)。

一键构建、打包并上传到本站 Pages，在 workspace 根目录执行：

```sh
npm run deploy --workspace @jangts/mock-gpt-playground
```

也可在本应用目录执行 `npm run deploy`。入口为 `scripts/deploy.mjs`，目标服务器、SSH 密钥路径、Pages 根目录和站点名集中在 `scripts/deploy.config.json`；配置只保存凭据路径，不保存密钥。换电脑时按实际位置修改路径。需要本机 Node/npm、tar、OpenSSH，服务器需要 Python 3.9+ 和已有的 sudo 权限。

脚本顺序构建 MockGPT SDK 和 Playground，仅将 `dist/` 打成临时压缩包，通过 `scp` 上传，再通过 SSH 校验压缩包及每个文件的 SHA-256。校验通过后替换 `pages/mockgpt-playground/`，清除旧成品及本次临时文件；校验失败保留现有网站。同站点发布使用互斥锁，其他网站及共享 404 不受影响。不修改 NPM、DNS、证书或重启服务。部署脚本仅供仓库维护使用，不随 npm 包分发。

只构建、不上传时，在 workspace 根目录执行：

```sh
npm run build --workspace @jangts/mock-gpt
npm run build --workspace @jangts/mock-gpt-playground
```

把 `apps/mock-gpt-playground/dist/` 的全部内容上传到静态托管即可；支持域名根目录和子目录，无需 API 服务、反向代理或部署 Node。构建后的 HTML 使用相对资源路径。仓库内开发命令仍为 `npm run mockgpt:playground`；本地静态预览可执行 `npm run preview --workspace @jangts/mock-gpt-playground`。

场景目录和可复制的示例源码随页面打包。SSE 在应用内部通过 `ReadableStream`／`Response` 模拟，真实模型请求不发往服务器；`chunkSize` 控制内容分片，`wireChunkSize` 控制 UTF-8 字节分片，间隔、停止和指定片数后中断也由应用处理。

模拟请求体最多 1 MiB；非法 JSON／请求结构返回 400，超限返回 413，均不执行生成器。读取请求体期间也响应停止，不等待自定义流的清理完成。

“网页读取”是显式外网请求，使用浏览器 fetch，受目标站点 CORS、HTTPS 混合内容和浏览器访问限制约束。取得正文时生成摘要；读取失败时返回原有提示，用户主动停止时保持取消状态。它不使用代理或 MockGPT 的 Node 网页来源。

HTTP 拒绝、不支持的内容类型和读取超限均会取消响应体，不等待自定义流的清理；URL 诊断最多保留 512 字符并标记截短，实际请求地址保持完整。模拟流的默认分片参数在适配器创建时校验并保存快照。

## 查看配置与体验输出

顶部通栏，下方左侧提示词列表、中间 Chat、右侧对应配置；移动端只显示 Chat，通过顶部图标打开列表和配置抽屉，选择提示词后自动收回列表。

- 点击欢迎区快捷问句直接发送；选择左侧场景则将问句填入输入框，便于修改后发送。
- 查看右侧匹配参数和生成器，复制生成器内容或完整示例源码，再用于自己的 MockGPT 配置。
- 体验 JSON 资料、Markdown 图片与表格、摘要、工具提议，以及流式分片、停止、限流和连接中断等场景。

MockGPT 可独立用于前端或 Node 程序，也提供可选的模型 SDK fetch 适配和最小 HTTP 服务；具体规则、生成器及服务接入见 [MockGPT 使用文档](https://www.npmjs.com/package/@jangts/mock-gpt)。Playground 直接依赖 MockGPT，界面、内置示例及模拟请求由本应用维护。

复制结果是独立 TypeScript 模块，包含 SDK 导入、字段生成规则及所需本地依赖；生成器模块默认导出生成器，完整配置默认导出 MockGPT 配置。可直接放入 TypeScript 工程；交给 Node CLI 时先编译为对应的 ESM／CommonJS 模块。网页示例使用浏览器 API，适用于浏览器；Node 网页来源请使用 SDK 的 `/web` 入口。示例表达式由实际工厂参数生成，不序列化函数闭包，也不把响应描述转换成普通 JSON。

复制模块仅引入其实际使用的 SDK 值与类型，回归同时执行 `strict`、`noUnusedLocals` 和 `noUnusedParameters` 类型检查。

## 示例与会话

内置 35 个示例，提示词列表和配置面板使用同一份场景声明。每个页面拥有独立 MockGPT 实例；刷新页面会清空规则计数，清空聊天只清理页面消息。图片使用本地 SVG 模拟数据；图片和表格回复采用 Markdown，复制按钮保留原始文本。工具提议仅展示，不实际执行。

资料与内容示例使用更丰富的候选池：40 个姓名、30 种饮品（其中 24 种咖啡）、20 条个人简介，以及不同故事、待办、城市和书籍主题。同一批用户和订单不重复抽取候选；咖啡推荐只选择咖啡品类。随机选择使用 MockGPT 的 seed 随机源，固定 seed、时钟和请求顺序可重现结果。摘要仍根据输入提取，故障与顺序场景保持稳定。
