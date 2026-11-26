# 项目协作约定

保留现有修改，不 reset、clean 或覆盖运行数据。安装只在根目录运行 npm ci，根 package-lock.json 是唯一依赖锁；应用与包保留 apps/*、packages/* 的目录结构。

正式文档遵守 docs/documentation-standard.md，接口设计遵守 docs/interface-design-standard.md。代码组织、日志和素材分别遵守 docs/code-organization.md、docs/logging-standard.md、docs/image-assets.md；界面目录规则见 docs/规范/01-工程目录与协作约定.md。本项目的具体实现从 docs/README.md 进入。全面代码检查、专项检查和修复复查使用全局 `$comprehensive-code-review`，自动读取[项目检查入口](docs/review-entrypoints.md)。过程记录放 docs/maintenance/ 或所属模块维护目录。临时工具与结果只放 .tmp/。格式化采用根 Prettier 配置。公共包注释使用英文或中英双语。

可枚举能力通过集中清单驱动实际执行；应用持有业务事实和权限，公共包不引入应用实现。

用户负责运行调试与视觉验收；未明确要求时不启动应用、浏览器或截图。检查只针对明确疑问执行最小范围，不默认全量构建、测试或压测。发布 npm、部署服务与公开仓库可见性均按当前用户授权执行。凭据只保存在本机私有配置，不进入源码、文档或日志。

本项目属于 Jangts，拆仓不改变既有 `@jangts/*` 包身份与任务范围内的跨项目协作责任。根 package.json 是私有 workspace 编排容器；已发布包的名称、版本及公开入口由 apps 或 packages 中原有清单维护，未经明确要求不重命名、不重置版本。
