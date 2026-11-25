# MockGPT 多协议与生命周期模拟提案

日期：2026-11-25。状态：提案，未实施。触发场景：Agent Core 1.0.0 乙计划需要验证主流模型接入；DeepSeek 可支持的能力另做真实服务验证，其余能力检查 MockGPT 覆盖，缺口在本项目提出方案。本提案不将 Agent Core 注入式 fetch fixture 当作 MockGPT 能力，也不授权修改模拟器、发布或部署。

## 1. 当前覆盖和证据

源码基线为本工作区 @jangts/mock-gpt 0.2.2。检查前 Git 状态为空；本轮仅新增本提案和维护索引，不改源码、依赖或现有包身份。

- `packages/mock-gpt/src/runtime/chat-completions.ts` 的 routes 只登记 POST `/chat/completions`、`/v1/chat/completions`。
- `packages/mock-gpt/src/runtime/mock.ts` 的 fetch 先按这份 routes 匹配，再用该 codec 解析与编码；未知路径返回 MOCK_ROUTE／404。
- `packages/mock-gpt/src/runtime/responses.ts` 的 responses 是 text/toolCalls/httpError/reject 输出描述器，名称不表示支持 OpenAI Responses API。
- `packages/mock-gpt/src/node/server.ts` 是 mock.fetch 的 Node HTTP 外壳，增加监听、正文限制、超时、CORS、背压和关闭，不增加其他协议。
- `test/protocol-contract.fixture.mjs` 覆盖 Chat Completions 的 Unicode、字节分片、工具参数、finish 和 usage；这些是已有可复用基础。

本轮使用已安装 dist、Node 24.9.0 和合成数据作无端口的实际联调：`MockGPT.fetch` 注入 Agent Core `Support.createModelProvider` 的 request。完整文本、每字节切分 SSE、两轮工具 session 通过；Responses、Messages、Gemini generateContent、Interactions、Batch、Realtime 六类代表路径均返回404。未构建、安装、启动HTTP服务、调用模型或做压测。此证据覆盖当前已安装包的具体接线；源码静态盘点与运行证据分别成立，不宣称所有异常组合均已实测。

| 目标 | 当前能力 | 后续目标及限制 |
| --- | --- | --- |
| Chat Completions 完整返回／SSE | 已支持，联调文本与工具两轮通过 | 保持现有行为，补跨协议共享场景基线 |
| JSON／工具／错误／取消／usage | 已有 Chat Completions 描述器和合同测试 | 不等于原生 JSON Schema 约束、厂商能力或所有 Agent 执行权限 |
| Responses 完整／SSE | 无路由／codec | P1 优先：output items、调用结果、完成／拒答／截断、用量和续接 |
| Claude Messages 完整／SSE | 无路由／codec | P1 优先：内容块、tool_use/result、签名块、终态与schema字段 |
| Gemini generateContent／Interactions | 无路由／codec | P2：有序parts／steps、函数、思考签名、结构化与多模态引用 |
| 后台任务 | 无远端任务状态仓库／动作 | P3：提交／查询／读取／取消、受控虚拟时间、unknown与幂等能力声明 |
| OpenAI／Anthropic／Gemini Batch | 无批次／文件端点 | P3：稳定item ID、乱序结果、部分失败、文件上传／产物读取 |
| Realtime／Live | 无WebSocket／WebRTC／双向会话 | P4：可注入duplex框架与实际WS外壳；WebRTC先限定datachannel合同，不冒称真实音视频 |
| 托管工具 | 无远端工具wire事件 | P2起：显式模拟搜索提案／执行事件／引用，和本地函数调用分开 |

## 2. 产品边界

MockGPT 继续是确定性模拟 SDK，不内置真实模型、账号、计费服务或业务权限。协议模拟只证明客户端能处理声明的请求、事件和故障；不能证明真实模型语义质量、厂商接受全部参数、原生schema保证、实际费用或实时媒体体验。

新增协议和生命周期通过可选功能接入，不让现有 `new MockGPT({rules}).generate()` 或 mock.fetch 的 Chat Completions 使用者额外配置全部厂商信息。保留已发布包名、版本演进规则和入口，不因目录或协议扩展重命名包。

不建设全供应商市场、真实云端账户模拟、通用分布式作业调度或自动外网回退。WebRTC 的SDP／编解码／设备能力不能由一组JSON帧伪造；不支持的层明确说明。

## 3. 一个场景，多种协议编码

引入实际驱动路由、校验、解码和编码的声明式 protocol catalog：每项登记 id、方法／路径匹配、request decoder、response encoder、event catalog、生命周期端口、能力和固定官方资料版本。不同模型名称不决定协议；路径参数及版本由显式匹配规则解释。未知协议／路由／必需事件明确失败，元数据可忽略项集中登记。

使用共同的中立 scenario 描述一次业务结果：有序内容、函数调用、远端托管工具事件、usage、终态、受控续接、媒体引用及故障动作。各 codec 只负责原生wire映射，不按协议复制一套库存查询或工具往返业务规则。现有 generators、seed、clock、records、次数消耗及描述器尽可能复用；无法无损映射的能力在场景准备阶段给出路径和原因，不静默删字段或降低约束。

旧 ModelRequest 及描述器用局部兼容投影保留，不强迫旧规则处理跨协议大union。新中立请求保留原始协议身份与原生扩展的受控副本，签名块不混入普通prompt文本；rule作者显式选取可移植字段。

建议最小场景集：一次文本、JSON对象／schema成功与失败、两轮已授权工具往返、文本与多调用并存、签名续接、混合媒体顺序、远端搜索及引用。媒体使用合成字节或虚拟资源ID，不访问用户资料或自动下载外部资源。

## 4. 生命周期与故障框架

后台／Batch 共享局部 operation store，按实例、场景、operation ID 和item ID隔离。接口包含 create/query/read/cancel；变更采用确定性状态转换，虚拟clock控制到期与完成。稳定ID由场景声明或受seed控制生成；支持“接受后响应丢失”，不能把没有拿到remote ID等价成未执行。模拟端是否支持幂等键／客户端ID查询需显式声明。

Batch 文件端点绑定同一实例资源域，文件大小、项数、保留期和读取次数有界；允许乱序结果、缺项、重复ID、逐项失败及混合终态，客户端必须按官方身份字段关联，不能按数组位置猜测。原生状态名称仍由各协议codec映射。

实时共享可注入 duplex：setup/input/response/tool-result/interrupt/close，显式 generation 与response/call ID关系。Node WS外壳负责打开、关闭、队列、buffered bytes和协议升级；场景引擎负责帧顺序、轮次、迟到及故障，不把socket逻辑复制到规则。浏览器datachannel可用同一duplex合同联调，但真实WebRTC媒体作为独立证据。

故障采用集中 fault catalog，按场景点位注入：HTTP错误、网络拒绝、任意字节切分、延迟、提前EOF、错误终态、未知必需事件、终态后内容、重复／乱序工具分片、签名缺失／作用域错配、提交前拒绝、提交后丢确认、取消竞态、迟到工具、会话断开和队列溢出。每个故障有适用协议、触发点、确定性复现方法及预期可观察事实，不要求所有协议支持所有故障组合。

## 5. 计数、取消与信任

规则命中次数、HTTP动作、生成尝试、Batch item、实时轮次和模拟usage分别记录。查询／下载不伪装成新生成；失败或取消不自动返还已准入规则次数。usage是合成声明，不是实际tokenization或费用。records只保存必要元数据，不泄漏签名、媒体或私有输入。

每次读取／取消／续接绑定实例和作用域；模型或协议配置不能授予业务工具权限。远端工具事件始终标明source=provider，不生成本地执行回执。真实应用工具仍由Agent Core校验与授权。

打开连接的超时与会话存活信号分开。取消停止当前等待不代表撤销已完成副作用；迟到终态和用量仍可进入受控记录。队列、帧、缓冲、文件和操作数有显式上限，关闭后计时器／订阅／句柄释放。此类检查是确定性正确性验证，不作吞吐或容量结论。

## 6. 与 Agent Core 的联调合同

普通会话继续通过 `Support.createModelProvider({protocol,baseUrl,apiKey:'fixture',model,request:mock.fetch})` 接入，不能在Agent Core之外写临时native响应绕过MockGPT后再称其通过。模拟凭据只用于合成测试，不复制真实密钥。真实Node HTTP外壳作为独立层验证，fetch通过不等于socket背压和断线已验证。

最小实际接线（已安装两个包的消费者中运行，无网络）：

```js
import { MockGPT, responses } from '@jangts/mock-gpt';
import { ModelRunner, Support } from '@jangts/agent-core';
const mock = new MockGPT({ rules: [{ generator: responses.text('hello') }] });
const provider = Support.createModelProvider({
  protocol: 'chat-completions', baseUrl: 'https://mock.invalid/v1',
  apiKey: 'fixture', model: 'mock', request: mock.fetch,
});
console.log((await new ModelRunner({ provider }).invoke('hello')).value); // hello
```

保留同一工具目录、authorize、handler、history和结果读取，仅改变protocol及必要接线。共同参考任务应包含Runner+factory+session+ToolRuntime的完整两轮链，除请求编码外还断言真实本地工具只执行一次、未授权时无副作用、终态和账本一致。

后台／Batch通过Agent Core operation provider的注入request接入；实时通过可注入socket或duplex接入。分别断言Core准入计数、稳定ID对账、只读查询、独立cleanup、跨轮迟到隔离与资源释放。MockGPT不因联调需求依赖Agent Core运行时；交叉合同测试作为可选消费者测试，不形成环形生产依赖。

## 7. 分阶段退出条件

| 阶段 | 最小可用交付 | 验收 |
| --- | --- | --- |
| P0 合同与版本 | 协议／故障／生命周期catalog、可移植scenario及官方版本 | 冻结有限矩阵；旧入口兼容；先以两种差异最大的codec薄切片验证 |
| P1 Responses／Messages | 完整HTTP与SSE、工具／签名／终态 | 同一参考任务只换协议；字节分片、断流、拒答、schema与续接反例 |
| P2 Gemini与托管搜索 | generateContent／Interactions、有序parts／steps、搜索事件 | 与Agent Core真实编译请求往返，未知事件不丢，媒体及签名不泄漏 |
| P3 后台／Batch | operation store、文件、逐项结果和故障 | 接受后丢确认、重复查询、取消、乱序／缺项／部分失败，无重复生成 |
| P4 实时框架 | duplex与WS外壳、Realtime／Live codec | 多轮、工具、打断、迟到、背压、关闭；区分socket fixture和真实媒体 |
| P5 交付 | 文档、示例、协议矩阵、公共入口与包体 | 干净消费者安装；Agent Core可选联调；已实现／模拟／真实证据分列 |

本提案不将所有矩阵格作为现有能力，不承诺替代厂商真实服务验证。实施前按每格明确必交付、显式替代或上游不支持，未验证不能当不支持，404也不能作为已交付新协议的成功证据。
