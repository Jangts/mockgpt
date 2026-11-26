# 项目检查入口

| 范围 | 实际入口 | 能说明什么 |
| --- | --- | --- |
| 直接生成与配置 | [generate 回归](../packages/mock-gpt/test/generate.test.mjs)、[配置快照](../packages/mock-gpt/test/configuration-snapshot.test.mjs) | 输入、返回、规则及配置隔离；不衡量真实模型推理质量 |
| 客户端协议 | [协议回归](../packages/mock-gpt/test/protocol-contract.test.mjs)、[独立 SDK 接入](../packages/mock-gpt/test/sdk.test.mjs) | JSON／SSE、工具提案及实际客户端消费；本机 HTTP 用例与注入 fetch 用例分别记录 |
| 取消与资源 | [生命周期](../packages/mock-gpt/test/lifecycle.test.mjs)、[安全与工作量边界](../packages/mock-gpt/test/security-performance.test.mjs) | 容量、快照、取消与资源释放；不作吞吐、容量或线上收益结论 |
| 网页来源 | [来源回归](../packages/mock-gpt/test/web.test.mjs)、[HTTP 传输](../packages/mock-gpt/test/web-transport.test.mjs) | 校验、地址策略与离线／本机传输；不保证实时网页可用 |
| Playground | [模拟传输](../apps/mock-gpt-playground/test/simulated-fetch.test.mjs)、[配置示例](../apps/mock-gpt-playground/test/example-copy.test.mjs)、[静态构建合同](../apps/mock-gpt-playground/test/static-build.test.mjs) | 对应的交互配置与静态输出合同；不代表完整视觉验收 |
| 全模块审计 | [审计入口](../development/scripts/agent/audit-libraries.mjs) | 本项目 MockGPT 全模块覆盖及既有阈值；按脚本参数决定是否构建，不自动运行 |
| 品牌副本 | [素材同步清单](../development/scripts/site-sync/brand-assets.mjs) | shared 原件与 SDK、Playground 和文档站的发布副本的一致性 |

## 诊断与素材

MockGPT 的 records 是有界内存元数据快照，不自动落盘；容量、reset、activeRequests、计数和取消按 [SDK 使用说明](../packages/mock-gpt/README.md)及[公开类型](../packages/mock-gpt/src/types.ts)解释。来源通过可信配置贡献元数据，调用方仍负责选择允许记录的字段。Node 服务与网页来源的错误分类不代表业务应用已接入持久日志。

Playground 的模拟请求和展示状态由 Playground 持有，不以它们替代 SDK 的执行记录。shared/visual-assets/branding/mockgpt 保存本项目品牌原件；SDK 和 Playground 按同步清单独立打包副本。

执行规则见[协作约定](../AGENTS.md)。源码检查、类型、离线协议、本机服务、实时网页与视觉结果分别记录。入口存在不表示本次已经执行。

## 多协议与生命周期

- [独立 wire 合同](../packages/mock-gpt/test/multi-protocol-wire.test.mjs)：原生字段、终态与 SSE；不以消费者 decoder 作为唯一依据。
- [可选 Agent Core 消费者](../packages/mock-gpt/test/multi-protocol-agent-core.test.mjs)：实际 MockGPT.fetch 接入公开消费者；不形成生产依赖。
- [后台／Batch／文件](../packages/mock-gpt/test/multi-protocol-lifecycle.test.mjs)：实例资源、稳定 ID、取消及故障。
- [实时与 WS](../packages/mock-gpt/test/multi-protocol-realtime.test.mjs)：duplex 与实际 socket 的证据分别解释；不代表真实媒体。
- [公开多协议说明](../packages/mock-gpt/docs/multi-protocol.md)与[可运行示例](../packages/mock-gpt/examples/multi-protocol.mjs)。
