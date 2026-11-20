# 组织拆分落实记录

日期：2026-11-20。本项目保持 Jangts 组织归属，Git 记录和依赖安装独立管理。既有 npm 名称、版本、公开入口和调用方 import 不变；没有发布 npm 或部署站点。

MockGPT SDK 和 MockGPT Playground 保留 packages/mock-gpt、apps/mock-gpt-playground 的裁切结构。私有 workspace 根容器不另设 npm 名称；实际发布单元保持 @jangts/mock-gpt@0.2.2 和 @jangts/mock-gpt-playground@0.2.3。

共用规范使用 docs 中的本地副本；产品手册与维护记录随所属代码保留。组织目录提供 jangts.code-workspace，在一个编辑器窗口中管理四个仓库；组织目录及 .external 不建立仓库。

本项目已初始化 main 分支并连接私有远端 Jangts/mockgpt，采用拆分内容的初始快照，不复制网站的完整 Git 历史。临时结果、依赖、编译产物和本机配置不纳入初始快照。

独立 npm ci、SDK 构建、workspace／依赖边界检查、Playground 类型检查与生产构建通过；Playground 86 项测试通过。未执行 SDK 完整行为回归、真实外部模型调用或浏览器视觉验收。
