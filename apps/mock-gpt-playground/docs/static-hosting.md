[English](#english) | [中文](#中文)

<a id="english"></a>

# Static hosting

MockGPT Playground runs its generators, chat interactions and simulated JSON/SSE requests in the browser. A static host only serves the built files; it needs no model credentials, application backend or Node runtime.

## Get the built site

Install the published package in a separate local directory, using Node.js 22.12 or newer:

```sh
mkdir playground-static
cd playground-static
npm init -y
npm install @jangts/mock-gpt-playground
```

The built site is `node_modules/@jangts/mock-gpt-playground/dist/`. Upload **all contents of that directory**, including index.html and its asset directories, to the public directory of your static host. The site's index.html should become the destination's index.html; do not upload only the HTML file or include the surrounding node_modules tree.

The npm package contains a prebuilt site, so consumers do not run repository build or SSH deployment scripts. Your host owns the domain, HTTPS and access controls.

## Local use and URL paths

For local use, run `npx @jangts/mock-gpt-playground` and open `http://127.0.0.1:2333/`. Stop with Ctrl+C. Use `--port 2334` if the default port is occupied. This serves the packaged build without rebuilding it.

The build uses relative resource paths and supports a domain root or a subdirectory. When hosting under `/playground/`, upload files into that directory and access the URL with its trailing slash. Use HTTP(S), rather than opening index.html through file://.

Core examples work without a model service. Explicit web-reading examples use browser fetch and remain subject to the target site's CORS policy and browser restrictions; static hosting does not add a proxy or bypass those restrictions. Page refresh resets the in-memory session.

[Back to README](../README.md)

---

<a id="中文"></a>

# 静态托管

MockGPT Playground 的生成器、聊天交互和模拟 JSON／SSE 请求都在浏览器执行。静态主机只需提供构建文件，无需模型凭据、业务后端或 Node 运行时。

## 取得成品

在独立本地目录安装已发布的包，使用 Node.js 22.12 或更新版本：

```sh
mkdir playground-static
cd playground-static
npm init -y
npm install @jangts/mock-gpt-playground
```

成品目录为 `node_modules/@jangts/mock-gpt-playground/dist/`。把该目录的**全部内容**上传到静态主机的公开目录，包含 index.html 和资源目录。目的地的 index.html 应直接对应成品中的 index.html；不要只传 HTML，也不需要上传外围 node_modules 依赖树。

npm 包已包含构建成品，使用者无需运行仓库的构建或 SSH 部署脚本。域名、HTTPS 和访问控制由托管方负责。

## 本地使用与路径

本地运行 `npx @jangts/mock-gpt-playground`，打开 `http://127.0.0.1:2333/`，按 Ctrl+C 停止。默认端口被占用时传入 `--port 2334`。命令直接托管包内成品，不重新构建。

资源使用相对路径，可部署到域名根目录或子目录。部署到 `/playground/` 时，把文件放进该目录，并使用带末尾斜杠的 URL 访问。通过 HTTP(S) 打开，不使用 file:// 直接打开 index.html。

基础示例不需要模型服务。显式网页读取示例使用浏览器 fetch，仍受目标站点 CORS 与浏览器访问规则约束；静态托管不会增加代理或绕过这些限制。刷新页面会重置内存会话。

[返回 README](../README.md)
