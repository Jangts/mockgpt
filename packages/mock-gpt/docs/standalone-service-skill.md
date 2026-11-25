# 独立模型 API 服务与配置辅助 Skill

MockGPT 提供[多协议 JSON／SSE](multi-protocol.md)、`createMockServer` 和可嵌入 Node 服务的 `createMockHandler`。CLI 使用 `mock-gpt serve --config ./mock.config.mjs`；配置是可信本地代码，服务不会加载远程配置或调用真实模型。

基于 MockGPT 的 [Playground](https://www.npmjs.com/package/@jangts/mock-gpt-playground) 是单独发布的静态 Vite + Lit TypeScript 应用，可用 `npx @jangts/mock-gpt-playground` 提供已构建页面。规则生成、模拟请求和 SSE 均在浏览器中执行；网页来源使用浏览器 fetch，受 CORS 等限制。前端、场景目录、包含依赖的可复制 TypeScript 配置和场景回归由该应用拥有，不随 MockGPT 包发布。包不依赖 Vite、Lit 或 UI 组件库。

配置辅助 Skill 支持从需求、设计文档和已有 Agent 请求生成配置及回归用例。没有 Agent 程序时准备可体验的输入和预期输出；已有程序时校验真实协议、工具回执、取消、错误和预算。模拟器的结果不能代替真实模型能力评估。

临时资料、实测录包和诊断输出保留在 Git 忽略目录；正式回归只包含必要且可公开的最小样本。不得把模型密钥或用户会话写进配置和示例。
