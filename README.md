# MockGPT

MockGPT SDK 与浏览器 Playground。保留原项目的应用与包目录层级。

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

包的安装和 API 用法见 [MockGPT SDK](packages/mock-gpt/README.md)。文档站位于 [pages 项目](https://github.com/Jangts/jangts-docs/blob/main/README.md)，应用消费公开包入口。

文档入口见 [项目文档](docs/README.md)，目录职责与开发方式见 [Workspace 结构](docs/workspace.md)。
