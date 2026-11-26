---
layout: home
hero:
  name: MockGPT
  text: 可配置的模拟应答 SDK
  tagline: 无需真实 LLM、API key 或 fixture，用规则与生成器组织回复。
  actions:
    - theme: brand
      text: 从零开始
      link: /zh/guide/
    - theme: alt
      text: 查阅 API 参考
      link: /zh/api/
features:
  - title: 声明式规则
    details: 按声明顺序匹配，首个满足条件的规则执行；字符串、正则与请求谓词即可组织业务应答。
    link: /zh/guide/step-2
  - title: 结构化回复
    details: 普通对象产生 JSON 内容，显式 helper 区分工具提议与故障，不猜测字段含义。
    link: /zh/api/responses
  - title: 生成器
    details: 固定资料、随机字段、摘要、关键词与字段提取都能随输入变化。
    link: /zh/api/generators
  - title: 流式与接线
    details: 同一份规则产出 JSON 或 SSE；内置 fetch 适配与最小 Node 服务可接入既有模型客户端。
    link: /zh/guide/step-6
---

## 选择阅读路径

| 你想了解 | 从这里开始 |
| --- | --- |
| 用一个示例逐步入门 | [指南课程](/zh/guide/) |
| 规则怎么匹配 | [规则与业务问答](/zh/guide/step-2) |
| 返回工具调用或模拟故障 | [响应描述 responses](/zh/api/responses) |
| 生成随机资料与摘要 | [生成器 generators](/zh/api/generators) |
| 起一个独立模型 API 服务 | [Node 服务](/zh/api/node) |
| 查错误码与字段约束 | [API 总览](/zh/api/) |