# Workspace 结构

本项目位于 Jangts 组织目录的 `mockgpt/`，保留 `apps/*` 和 `packages/*` 的 npm workspace 结构。只在本项目根目录运行安装、构建及检查，不在组织目录运行。

包源码和自身使用文档归 packages，应用归 apps，构建工具归 development/scripts，正式素材及必要原件归 shared/visual-assets。公共包以本项目的 packages/catalog.json 登记，build:packages 按登记顺序统一构建，check:workspace 核对登记、依赖、模块边界和双格式导出。

开发依赖与构建产物分别由本目录自己的 npm workspace 和锁文件管理，不依赖网站的 node_modules。文档站位于 `apps/mock-gpt-docs/`，从 `packages/mock-gpt/` 的源码和手册生成。

文档与执行规则见[协作约定](../AGENTS.md)，具体工具与产品规则见[项目检查入口](review-entrypoints.md)。跨项目资料输入按本文约定消费，不形成对其他项目协作规范的路径依赖。

## Jangts 组织协作

所有子项目仍属于 Jangts，已发布 npm 包保留原有 `@jangts/*` 名称、版本和公开入口。保留组织目录用于跨项目源码联调、文档生成及调用方同步；相关任务按实际影响同时处理各项目，Git 记录和发布按各仓库分别管理。私有 workspace 根目录只承担依赖安装和命令编排，不另设 npm 包身份。

本项目的锁文件管理自己的安装结果；跨项目依赖通过原有包名和公开入口声明。源码联调、文档生成和发布版本分别明确来源，目录搬迁不改变已经确定的 npm 身份。
