# MockGPT 设计

> 文档类型：设计规划。公开接口和使用方式见 [使用文档](../README.md)。

日期：2026-10-30。状态：首版已实现，发布状态以 npm 为准。本页维护设计约束与扩展方向；当前 API、默认值和可运行示例以 [README](../README.md) 及导出类型为准。

## 1. 已确认方向

MockGPT 是独立 package，不属于 agent-core、Support 或某个 Kit。它以配置和程序规则组织模拟应答，通过 SDK 供前端或服务端调用；挂载与请求包装由使用者决定，服务于开发、演示和程序测试；不承担自然语言推理质量的验证。

依赖与调用关系：

```text
其他框架／模型 SDK ──────────────────────┐
                                       ↓
App → agent-core → Provider → MockGPT 模拟 API
                                       ↑
                              规则清单与生成器
```

已确认：

1. 本包有独立用途与自己的接口，不导入 agent-core，不继承其 ChatProvider，不依赖其 ModelPart、阶段名或业务协议。
2. agent-core 计划依赖并提供本包的集成入口；ModelRunner 仍只消费 Provider 合同，真实模型执行不经过 Mock。
3. agent-core 接入 Mock 时仍需 Provider，优先复用真实 Provider，验证请求构造、HTTP／SSE 解析和后续执行。
4. `generate()` 提供应答数据，不创建传输对象；可选 `fetch` 适配继续覆盖现有 Chat Completions 接入。生成内容与 API 包装是不同职责，两者共用规则执行而非维护两套生成规则。
5. `prompt` 支持字符串与 pattern；`generator` 支持字符串、转为 JSON 的对象以及函数，可选常用内置生成器。
6. agent-core 后续部分集成测试可依赖本包。纯算法单元测试与真实 LLM 行为评估保留各自路径。
7. 同时提供进程内库调用与可独立监听端口的最小 Node 壳，共用规则、生成器和模型协议处理。
8. Playground 是可纯静态部署的独立前端，直接使用 `generate()`；模拟请求、JSON／SSE、字节切片、延迟与交互归 Playground，Vite 只承担开发与构建。
9. 随包提供配置辅助 Skill，基于需求文档、设计文档或已有 Agent 程序生成预演场景、开发配置与测试断言；没有程序时可先通过独立 Playground 体验。使用 Mock 本身不依赖 Skill 或真实模型。
10. 内置生成器不局限于固定响应和随机字段，还提供依赖输入的摘要、要点、关键词、标题、字段提取与模板回答，以轻量算法模拟 AI 生成形态，不要求语义准确。

Node 壳与 Skill 的交付边界见[独立运行与配置辅助](standalone-service-skill.md)。

首版包含规则引擎、JSON／SSE、基础与输入相关生成器、网页来源、Node 壳和 Skill；分类、资料检索回答、大纲和 schema 造数仍是后续方向。

## 2. 配置原则

采用“匹配条件 → 生成器”的声明式规则。固定字符串或对象就是完整的最简用法；函数、随机生成器、有限命中次数、重置和延迟按需开启，不要求学习占位符 DSL。请求规范化、规则匹配、生成与模型协议包装各自承担明确职责，实例之间隔离状态，延迟支持取消且默认无等待。 规则配置参考 [Mock.js](https://github.com/nuysoft/Mock/wiki/Mock.mock%28%29)，请求与响应处理器分离参考 [MSW](https://mswjs.io/docs/http/intercepting-requests/)；本包不承诺兼容其全部语法。

## 3. 首期外部接口

`generate(input, { signal })` 是直接 SDK 入口，输入为普通 model／messages 数据，返回生成值或惰性应答描述。它不等待描述里的延迟、不生成切片、不解释 HTTP 故障，也不需要 Request／Response 或 server。生成结束即释放本次记录；后续传输的生命周期由调用方管理。

已有符合标准 `typeof fetch` 的实例适配供模型客户端选择使用，不拦截或改写全局 fetch，不要求启动 HTTP 服务。

```ts
// 接口草案。
const mock = new MockGPT({
  rules: [
    { prompt: '你好', generator: '你好，有什么可以帮你？' },
    { prompt: '生成资料', generator: { title: '演示资料', status: 'ready' } },
    { prompt: /介绍一下(.+)/, generator: ({ match }) => `这是关于${match[1]}的介绍。` },
  ],
});

const response = await mock.fetch('https://mock.local/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'demo-model',
    messages: [{ role: 'user', content: '你好' }],
  }),
});
```

实例 fetch 应可作为回调直接传出，不依赖调用处的 this。它处理标准 Request／RequestInit 和 signal，不将模型 API 请求转发到真实模型；地址用于路由识别，不建立监听，也不代表远程服务。默认生成路径离线；只有配置显式选择网页来源或自定义联网函数时，才按该来源合同获取外部内容。

协议路由建议独立声明 method／path，首期支持 POST `/chat/completions` 与 POST `/v1/chat/completions`。支持范围需要显式列出，不对任意后缀做宽泛匹配；其他服务前缀可通过路由配置增加。host 匹配默认不参与场景选择，是否允许限制 host 在接口定稿时确定。

SDK 若不支持注入 fetch，可将 base URL 指向独立运行的 Node 壳；本包不自动启动服务或修改 SDK。Node 壳纳入首期独立入口，基础导入不引入 Node HTTP、CLI 或 playground，也不产生监听副作用。直接 SDK 与可选适配共用规则、计数和生成执行；协议适配不是 SDK 生成的必经路径。

## 4. 请求规范化与规则匹配

输入是模型 API 请求，不是 Core 的内部数据。适配器将 method、URL、model、messages、tools、stream 等转为本包的只读请求视图，同时保留必要的原始请求数据供高级函数使用。

建议规则字段：

| 字段 | 初步语义 |
| --- | --- |
| id | 可选，便于记录和诊断；省略时由实例按位置生成稳定标识 |
| prompt | 字符串精确匹配，或 RegExp 模式匹配；省略表示本路由内的兜底条件 |
| model | 可选，精确匹配模型名 |
| when | 可选的请求谓词；复杂场景读取完整规范化请求 |
| generator | 必需，产生内容或明确的响应描述 |
| times | 可选，正整数；省略表示可重复命中，1 表示只使用一次 |

匹配规则按声明顺序执行，首个满足全部条件且仍有额度的规则拥有此次请求。不增加隐藏优先级，不因为字符串“看起来更具体”而重排。generator 返回 undefined 应报生成错误，不能无声跳到下一条规则。

装配时检查重复规则 ID、非法匹配项、缺少 generator 和无效 times。规则、协议路由和内置生成器分别由集中声明直接驱动匹配与执行；实现入口引用必须有效，文档和回归用例尽量读取同一声明，不维护旁路枚举。

默认 prompt 投影为最后一条 user 消息的文本；它不包含系统说明，不自动 JSON.parse 后寻找 request／message 等业务字段。多模态内容块的文本提取顺序需要在 Chat Completions 适配器内明确；图片不假装被识别。没有可用 user 文本时使用空文本，并保留完整请求让 when 判断。

高级调用方可提供 selectPrompt(request) 指定投影，解决应用将原问题封装进 JSON、工具回执或多条消息后的匹配需求。RegExp 每次独立匹配，不能因 g／y 的 lastIndex 导致相同请求轮流命中／失配。捕获组和具名捕获组提供给 generator。

未命中默认抛本地配置错误 MOCK_RULE_NOT_FOUND，并允许显式 fallback。不能自动连接真实模型。明确配置 fallback 的响应应记录为 fallback，不能与普通规则命中混同。

## 5. 生成器合同

| generator 类型 | 行为 |
| --- | --- |
| string | 原文作为模型内容，保留空白；可故意提供非法 JSON 测试下游解析 |
| JSON 对象／数组 | 每次执行时序列化为模型内容；不把某些业务字段猜成工具调用或 HTTP 控制项 |
| function | 接收生成上下文，支持同步或异步返回以上内容，或返回显式响应描述 |

字面量模板按配置快照保存，每次生成产生独立值。循环引用、BigInt、不可序列化值或顶层 undefined 给出可定位的生成错误，不悄悄删除数据、强制转字符串或声称生成成功。函数抛错不自动转成成功正文。

生成上下文建议包含：规范化请求、prompt、正则 match、本次全局调用序号、本规则命中序号、signal、可控随机源及 clock。序号与规则额度在请求匹配时分配，不能因为异步完成先后而串位。

内置函数建议通过 generators 集中导出，先考虑 integer／float／boolean、pick、id、date、sentence、imageUrl、sequence。它们返回执行时求值的生成器，不能在声明规则时就把“随机日期”固定下来。具体名称、参数与首期清单待实现前定稿。

输入相关生成器同样通过该目录导出，首批增加 summary／bullets／keywords／title／extract／reply；分类、资料检索回答、计划大纲和 schema 造数按需扩展。统一输入选择、算法默认值、输出合同与分期见[模拟智能生成器](input-aware-generators.md)。这些机制不调用真实模型，算法语义效果不作为通过要求，但 JSON、长度、取消与确定性等程序合同仍须成立。

内置文本生成器的 source 支持同步／异步文本。可选网页来源 `sources.web()` 读取网页并提取正文，再组合 summary 等已有生成器；不会使普通摘要隐式联网。网页内容加载、正文提取与摘要算法分别负责各自错误、取消和预算，细节见同页“网页访问与总结”。

网页来源只执行普通 Node HTTP 抓取，不提供浏览器驱动、登录维护或 Cookie 导入。Node 来源取得正文时摘要，读取失败时通过显式 `sources.web({ fallback })` 返回“不支持访问实时网页”的模拟回复。来源诊断仍保留真实失败原因并标记 `sourceFallback`；取消和目标地址校验不被兜底吞掉。不配置 fallback 的来源继续严格报错，供程序测试使用。Agent 自行取得的正文可直接作为文本 source 输入。

```ts
// 接口草案。
{ prompt: /随机一句/, generator: generators.sentence() }
{ prompt: /演示图片/, generator: generators.imageUrl({ width: 320, height: 180 }) }
{ prompt: /下一步/, generator: generators.sequence(['第一次回复', '第二次回复']) }
```

图片函数优先考虑无需外网的本地 data URL 占位图；它不生成真实照片。日期与随机数通过实例 clock／seed 控制；可复现条件是输入、调用顺序、seed 和 clock 均一致。自定义函数使用外部时钟或随机库时，由该函数自己承担可复现性。

sequence 依赖本规则的实例内命中序号，不使用共享闭包计数。默认耗尽时报错；是否支持显式重复最后一项，待接口定稿。数组字面量仍是 JSON 内容，不能自动当作 sequence。

## 6. 工具提议与响应描述

普通 JSON 数据与 API 控制信息必须可区分。建议使用显式 helper 构造文本、工具提议、usage、完成原因和故障描述；不通过猜测对象字段决定类型。

```ts
// 接口草案；helper 只创建响应描述，不执行工具。
{ prompt: /天气/, generator: generators.toolCall('weather', { city: '武汉' }) }
```

工具提议由协议适配器编码为 Chat Completions 的 tool_calls。调用 ID 应稳定且可关联，参数只序列化一次。接收方仍负责校验名字与参数、授权和实际执行。

常规模式不自动修复不符合工具 schema 的参数，也不把外部工具调用说成已经完成。需要测试未知工具、错误参数、非法 JSON 或并行提议时，应能通过显式负向场景描述产生对应响应。

本包不读 Core 的 stage／transport，不把 Core 内部协议作为统一响应结构。适合 agent-core 的场景配置可以在消费侧维护，但本包基础 API 面向标准模型请求。

## 7. JSON、SSE 与故障模拟

同一份规则和生成结果，根据请求 stream 决定普通 JSON 或 SSE 包装；不是两套生成规则，也不是两种“模型推理模式”。

Chat Completions 适配器需要覆盖：

- 普通 assistant 文本、JSON 字符串内容，以及显式工具调用。
- 分片中的 role／content／tool_calls；工具名字和 arguments 可以分片，但索引与 ID 关联必须一致。
- 正确的 finish_reason、完成终止、`[DONE]`；启用 usage 时提供可说明来源的模拟用量。
- 对正常响应按规范编码；故意的截断、非法帧、矛盾完成原因通过独立故障描述产生，不由普通字符串意外触发。

用量不调用真实 tokenizer。字面量可以显式指定 usage；是否提供估算值、如何标注及默认是否省略，需要在实现前定稿，不能把字符长度当成真实 token 统计。

故障能力分开表达：有效 HTTP 错误响应、请求 Promise 拒绝、生成器程序错误、流中断。它们进入不同接收路径，不能一律折算为 HTTP 500 或正常文本。

建议首期提供响应前延迟、分片大小／间隔、指定片段后中断、显式 HTTP 状态。默认零延迟；等待与输出均响应 signal。中止后停止后续输出和可取消任务，不额外补结束帧；任意自定义函数的外部副作用无法靠 signal 自动撤销。

非法 HTTP／SSE 字节注入作为明确的低层负向测试扩展，不作为日常 generator 配置要求。具体故障 helper 名称与请求校验的 HTTP 状态映射待定。

## 8. 记录、计数与重置

建议每个 Mock 实例拥有独立的规则快照、命中计数、随机源与调用记录。不得使用跨测试共享的全局规则、全局拦截或全局随机种子。

匹配并分配规则后即消耗本次命中额度；失败或随后取消不回退，避免并发请求重复领取 once 规则。请求开始前已取消时不匹配、不消耗额度。规则与 sequence 的重置只影响之后的新请求，不回头更改已生成内容。

调用记录默认保留必要元数据：调用 ID、路由、模型、规则 ID、顺序、完成／错误／取消状态；完整请求和响应内容需显式开启并设置上限。记录只在内存，不自动落盘，不保存鉴权 header；不能引入默认长期数据归档。

reset 建议清理本实例记录、计数和随机状态。首期在存在活动请求时拒绝 reset，避免复位后旧请求写入新一轮记录。它不重置自定义函数捕获的外部闭包、数据库或外部库状态。运行期覆盖规则的 API 是否首期提供待定，不影响基础声明式配置。

## 9. agent-core 集成与交付

接线草案：

```ts
const mock = new MockGPT({ rules });
const provider = new CompatibleModelProvider(
  { baseUrl: 'https://mock.local/v1', apiKey: 'mock', model: 'demo-model' },
  { request: mock.fetch },
);
const text = await new ModelRunner({ provider }).invoke('你好');
```

模拟端提供模型 API，Provider 解析协议，Core 执行模型交互和工具合同。Mock 不直接生成 ModelPart 绕过 Provider，也不在其内部调用 Core。

独立使用者导入 `@jangts/mock-gpt`。agent-core 可通过 `@jangts/agent-core/mock` 提供集成出口并随依赖安装；出口名称、原样再导出与便利创建函数在实现时确定。任何便利封装内部仍必须构造 Provider，不能让 Mock 成为另一种 Core 私有执行通道。

本包 manifest、ESM／CommonJS、类型导出、根锁文件和 packages/catalog.json 已登记；agent-core 的依赖与 packageConsumers 同步登记，`/mock` 入口只再导出模拟器。核心执行代码不导入此入口。

workspace 检查的 agent-core 无业务依赖白名单已精确增加独立模拟器；不放宽其他依赖约束。

## 10. 验证分工与实施顺序

| 验证对象 | 路径与证据 |
| --- | --- |
| 规则、生成器、随机与计数算法 | 本包直接单元测试；精确匹配、正则捕获、顺序、耗尽、并发与 reset |
| JSON／SSE 编码 | 本包按官方格式制作的独立固定样例和字段断言；不能只用同源编码／解码回环证明正确 |
| 模型客户端接入 | 至少通过一个非 agent-core 的 SDK 或独立协议客户端验证，防止接口只适配内部实现 |
| Node 壳与 playground | 实际回环 HTTP 上的 JSON／SSE、取消、错误和关闭；Playground 验证自己的请求适配、分片和静态构建。浏览器视觉检查按用户明确授权执行 |
| Skill 产物 | 使用有代表性的 Agent 请求验证生成配置可加载、命中规则及断言；区分建议、已执行检查和真实模型验证 |
| agent-core 集成 | Mock API → 真实 Provider → Core，验证请求构造、文本／结构化输出、工具提议、真实回执、预算与取消 |
| Provider 自身的负向解析 | 保留手写原始 HTTP／SSE fixture，覆盖 Mock 正常包装不会产生的异常；不把所有测试迁移为同一种 helper |
| 真实 LLM 能力 | 独立验证模型是否按约定生成、是否理解语义及保留信息；Mock 结果不作为这些能力的证据 |

建议实施顺序：

1. 定稿请求视图、匹配字段和 generator 返回合同；先用固定文本／对象／函数，不要求随机模板。
2. 实现独立规则引擎与 fetch 注入，打通 Chat Completions JSON／SSE 正常路径。
3. 实现工具提议、取消、可控故障、计数／sequence、少量基础生成器和重置；补首批输入相关生成器，以简单抽取和模板组合打通动态摘要、标题及回答。
4. 提供可独立运行的 Node 壳与 CLI；用原生 HTTP／独立客户端确认与进程内接口一致，再接入独立 Playground 开发项目。
5. 固定首批配置合同，提供配置辅助 Skill；以一个真实 Agent 的请求结构设计最小开发场景和隔离测试，不要求先导出完整历史语料。
6. 迁移 agent-core 少量代表性集成测试，保留原始负向 fixture；确认独立客户端可用后完善分发与示例。Responses／Anthropic 等格式仍按实际需求另议。

## 11. 后续扩展

- 分类、资料问答、计划大纲与 schema 造数在具体参数与适配成本确认后扩展。
- 自定义路由前缀、更多模型格式与原始损坏字节故障仍按实际需要扩展。
- 暂不支持完整请求／响应记录、运行时修改规则或活动请求中 reset。
- usage 首版仅接受显式值，暂无 tokenizer 或估算默认值。
- 更多 agent-core 场景按真实维护需求逐步接入，不批量改写原始负向 fixture。

这些细节可以通过小型原型再确定；不影响独立包、模型 API 边界和 Provider 适配这三个已确认方向。

## 12. 回放与测试数据约束

回放资料由测试侧按需提供，不要求普通使用者先制作 fixture。实现应遵守：

- 区分原始协议录包、聚合模型内容、应用场景数据和人为合成的故障；每个 fixture 标明来源层级。
- sequence 必须暴露响应耗尽与未消费数量，不能重复最后一项或自动补成功回复来掩盖流程变化。
- 原字符串内容可以逐字回放，包括空白和不合法 JSON；不能经 parse／stringify 统一改写所有历史样本。
- 补造的 JSON 外壳、SSE 分片、完成标记和工具调用适配应明确标为重建／转换，不能冒充真实采集结果。
- 本包只消费通用模型内容及明确的响应描述；历史 intent／next、页面、身份、查询结果与业务评分留在 Jangts 的场景适配和测试侧。
- 不以历史业务评分作为当前实现必须通过的通用标准，不用离线回放证明真实模型语义、网络性能或实际 token 消耗。

临时语料和候选来源索引只在本地忽略目录维护；正式回归仅纳入验证确实需要且可安全发布的最小样本。
