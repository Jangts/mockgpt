# MockGPT

MockGPT SDK、浏览器 Playground 和双语文档站。

| 目录 | 职责 |
| --- | --- |
| `packages/mock-gpt` | 模拟应答 SDK、Node 服务与网页来源 |
| `apps/mock-gpt-playground` | 可静态部署的浏览器调试工具 |

使用 Node.js >=22.12.0，在本目录运行 `npm ci`；根 `package-lock.json` 是唯一依赖锁。

```sh
npm run build:packages
npm run test:packages
npm run mockgpt:playground
```

包的安装和 API 用法见 [MockGPT SDK](packages/mock-gpt/README.md)。双语文档站从本仓库的 SDK 源码生成。在仓库根目录执行 `npm run build:docs:mock-gpt`，详见[文档站维护说明](apps/mock-gpt-docs/docs/deployment.md)。

文档入口见 [项目文档](docs/README.md)，目录职责与开发方式见 [Workspace 结构](docs/workspace.md)。
