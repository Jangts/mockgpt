# MockGPT 多协议实施与验收记录

日期：2026-11-25。状态：七角色设计对齐、有限矩阵实施与验收完成。原提案保留；本记录承接其实施授权。

## 冻结合同

共同执行所有者仍为 MockGPT.evaluate；旧 generate、responses 描述器、Chat routes/encodeModelResponse 保持合同。新增有序 scenario 通过显式描述器接入；其内容项不得与旧 content/tools 同时配置。共同校验拥有未知输入、快照、大小预算和能力拒绝，codec 不静默丢字段。请求保留规范 messages 与独立协议身份/有序原始块，签名不进入 prompt。

protocol catalog 实际驱动路径、方法、decoder/encoder、能力、事件；fault catalog 实际驱动触发点与合法组合；lifecycle catalog 实际驱动转换。能力不能表示时准备期定位失败。根入口环境中立，Node WS 独立子入口；MockGPT 不依赖 Agent Core 生产运行时。

规则次数在生成准入消耗，失败与取消不返还；query/read/download/cancel 不重新生成。实例拥有有界 operation/file store，clock 控制到期，ID 与作用域独立。接受后丢确认保留任务，不自动重提。activeRequests 仍代表进行中的生成/流；活跃任务与连接独立计数，reset 在活跃资源存在时拒绝，终态资源在 reset 清除。取消等待与远端撤销分开。

## 有限必交矩阵

以下每行均需记录 codec、实际 mock.fetch、适用 Agent Core 消费者及本机 HTTP/WS 证据，空白是未验证，不是通过。

| ID | 协议与动作 | 共同场景及反例 | 必要断言 | 状态 |
| --- | --- | --- | --- | --- |
| G1 | Chat 完整/SSE | 文本、JSON/schema声明、多函数混合、拒答/截断、usage、取消 | 旧入口、字节切分、终态与计数 | 通过有限合同 |
| G2 | Responses POST /v1/responses 完整/SSE | 同G1，output items、工具结果、续接 | 同一scenario；无重复本地执行 | 通过有限合同 |
| G3 | Messages POST /v1/messages 完整/SSE | 同G1，签名块、tool_use/result | 签名隔离、原生块顺序 | 通过有限合同 |
| G4 | Gemini models/{model}:generateContent/streamGenerateContent | 同G1，parts/thoughtSignature | 输入输出引用顺序、签名续接 | 通过有限合同 |
| G5 | Gemini Interactions POST /v1beta/interactions 完整/SSE | 同G1，steps/thought | step身份与终态、续接 | 通过有限合同 |
| H1 | Responses web_search | 远端调用、搜索阶段、来源与引用 | source=provider；本地执行数0 | 通过有限合同 |
| H2 | Messages web_search_20250305 | server_tool_use/result、引用 | 明确版本；不隐含code execution | 通过有限合同 |
| H3 | Interactions google_search | call/result steps、来源 | 每次授权与私有续接 | 通过有限合同 |
| O1 | Responses 后台 submit/query/read/cancel | 接纳后丢确认、重复查询、取消竞态 | 稳定ID、无重复生成、实例隔离 | 通过有限合同 |
| O2 | Interactions 后台 submit/query/read/cancel | 同O1 | 同O1 | 通过有限合同 |
| B1 | OpenAI Batch/Files | 上传JSONL、创建/查询/取消、结果/错误文件 | 稳定item ID、乱序/缺项/部分失败 | 通过有限合同 |
| B2 | Anthropic Batch/Files | requests、results JSONL、文件动作 | 同B1；不虚构厂商幂等 | 通过有限合同 |
| B3 | Gemini Batch/Files | inline/文件、创建/查询/取消、下载产物 | 显式key关联、文件域隔离 | 通过有限合同 |
| R1 | Realtime duplex | setup、多轮、工具结果、interrupt、迟到、close | generation/call/response关联；有限队列 | 通过有限合同 |
| R2 | Gemini Live duplex | 同R1 | ack屏障、迟到隔离 | 通过有限合同 |
| R3 | 实际Node WS外壳 | 两codec实际本机socket、背压与关闭 | upgrade/缓冲上限/资源释放 | 通过有限合同 |
| R4 | WebRTC datachannel合同 | 相同duplex接线 | 仅数据帧；SDP/设备/编码/真实媒体分列 | 通过有限合同 |
| C1 | Agent Core公开消费者 | 五协议相同factory+Runner+session+ToolRuntime工具场景 | 授权/执行次数、终态、账本、续接、拒权零副作用 | 通过有限合同 |
| P1 | 最终包体 | ESM/CJS/root/node/types、双语示例及Skill | 仓外干净安装、源码与tarball指纹 | 通过有限合同 |

schema 场景验证指定输出及客户端校验，不冒称模型原生约束。Gemini strict 拒绝不删去 JSON/schema 场景。媒体使用合成引用，未知或不可表达能力不能静默忽略。真实模型、真实云端资源、WebRTC SDP/设备/轨道/编解码与真实媒体不由本机JSON/WS证据替代。

## 文件责任

主审独占 types.ts、runtime/responses.ts、runtime/mock.ts、index.ts/node.ts 及公共合同；协议codec、operation/file store、duplex/WS由专门实施者在独立文件拥有。Core运行源码只读，可选消费者测试归MockGPT；先冻结公共合同再实施。

## 首轮评审及处置

- scope_review S1—S7：全部采纳，上述矩阵、共享场景、证据层级与包体条件承接；待原方逐项回查。
- independent_review I1—I10：全部采纳，独立中立场景、Messages/Responses薄切片、动作计数、实际WS、官方独立核验及文件责任承接；待原方逐项回查。
- source_review S1—S6：全部采纳，唯一准入、完整预算、拒绝双输出、请求兼容、一次finish与资源reset、双构建及旧导出承接；待原方逐项回查。

原意见对齐不等于实现验收。尚未收齐角色的意见不计同意；具体未对齐A/B依授权交除原方之外六人投票，主审不投，3:3交用户。

### 反方补强（全部采纳，待原方复核）

A1/A7：中立有序合同先于codec实现；共同基线不得使用native passthrough。A2：官方wire独立断言与Core消费者分离，不能互相证明协议正确。A3：内部接纳事实、客户端已知ID、厂商可查询能力分别存储；未声明幂等/客户端ID查询时，丢确认允许无法自动恢复，不赠送恢复端点。A4：同一clock时刻任意查询次数不影响完成时间、结果顺序和保留期。A5：真实WS用小上限慢读分别触发入站队列和出站缓冲，断言关闭后无生成/悬挂等待。A6：工具共同场景增加跨轮撤权，计数从真实ToolRuntime handler取得；records不含签名/媒体，托管搜索不产生本地回执。

### API 与故障补强（全部采纳，待原方复核）

API A1—A6：旧入口零新增必填；scenario描述器直接作为Rule.generator输出，不新增runner；统一request视图提供text、ordered内容及toolResults，协议身份另存。双输出冲突使用MOCK_CONFIG并定位scenario.items/content/tools。普通生成不启用资源仓库；后台/Batch/realtime显式可选且复用同实例。response/call/operation/file ID默认由实例按序生成，仅对账/故障需显式指定。交付双语旧文本→切换协议→工具两轮→后台/Batch→实时的完整import/运行前提/结果/取消示例及Skill，解释responses helper与Responses API区别。

故障F1—F8：丢确认发生于store接纳之后、响应交付之前。完成先发生则cancel返回已有终态，取消先发生则完成不可改写；取消HTTP等待不撤销任务，cleanup独立signal，重复cancel不消耗生成。公开stats分别观察httpActions/generations/batchItems/realtimeTurns/activeStreams/activeOperations/activeConnections。续接绑定实例/协议/模型/端点版本/scope/历史锚点，错误在准入前拒绝且零消耗。流区分正常/拒答/截断/EOF/错误事件/消费取消，一次finish；终态后内容只由显式fault产生。UTF8和工具参数任意字节切分必测。interrupt按响应/调用ID或Live ack屏障关联，迟到工具不进新轮，工具结果不自动生成。

资源候选默认：operation 100个、file 100个、单批100项、资源总计16MiB、TTL 60000ms、连接16个、队列64帧、单帧1MiB、buffered bytes 1MiB；全部为可配置正整数，超限MOCK_RESOURCE_LIMIT；TTL只由clock决定，清理按动作惰性执行；关闭/取消/溢出释放等待器与订阅，reset拒绝活跃资源且清终态资源。fault登记协议/阶段/参数校验/handler/可观察事实，非法组合准备期MOCK_CONFIG定位失败。

## 公共类型合同

ScenarioOutput 为 OutputOptions 加 items 有序数组；ScenarioItem 为 text{text}、function-call{id?,name,arguments}、thinking{text,signature?}、media{modality:image|audio|video|file,uri,mimeType?}、search{id?,query,sources:[{url,title?}]}、refusal{text}。ResponseDescription新增kind=scenario，responses.scenario(value)校验并快照；旧model描述器投影为text与function-call序列。ScenarioOutput与ModelOutput分离，旧ModelOutput不加blocks。通用大小预算计算整个scenario JSON UTF8字节与既有字符限制，不允许签名/媒体逃逸。

ProtocolCodec具有id/match(path)/decode(body,url):ModelRequest/encode(request,scenario,id,created,signal,finish):Response/capabilities/events/source。normalizeScenario将旧输出投影一次；protocol catalog登记chat与四新协议，fetch匹配catalog后才解析。规范ModelRequest可选protocol、native、orderedInput、toolResults，tools与messages继续兼容；decoder不按协议决定业务生成。

LifecycleRuntime构造注入generate(input,signal):Promise<Generated>，并提供handle(request):Promise<Response|undefined>、activeOperations、reset。fetch先给lifecycle路由匹配，再进入生成catalog；后台及batch内部生成调用同一generate/evaluate，读取存储的结果由codec编码。lifecycle默认关闭，通过MockGPTOptions.lifecycle显式开启。RealtimeRuntime通过独立createMockDuplex(mock,{protocol,...})按需创建，并以mock.generate执行每轮；Node createMockWebSocketServer(mock,options)装配同一duplex；根入口不引入node依赖。

### 执行门槛与分层补强

Messages/Responses 两个薄切片使用共同场景通过完整响应和SSE，并确认业务规则无协议分支后，才扩展其余codec。官方来源、核对日期、采用版本、字段/事件及独立测试落点逐格记录于配套wire验收表，不以Core decoder为裁决标准。

分层L1—L6全部采纳：evaluate唯一准入；scenario规范化与codec分层；三catalog各自所有者而非大目录；store拥有接纳/身份/容量/TTL/原子终态、adapter映射厂商状态；HTTP/生成/operation分别终结；duplex与socket双向幂等关闭。主审独占scenario规范化/资源限制/故障执行公共端口，协议实施者独占共享SSE writer及codec，生命周期实施者独占store，实时实施者独占duplex/WS。不得复制SSE取消与一次finish机制。

### 原提出方复审回执

source_review S1/S3—S6采纳，S2独立ScenarioOutput合理改写，六项均对齐；提醒活跃duplex必须登记至MockGPT保证reset实际保护。adversary_review A1—A7逐项确认准确采纳，无仍反对取舍。scope_review首轮复审S2/S4—S7采纳、S3合理改写，S1要求独立wire子表后再确认。independent_review首轮复审I1/I2/I4—I9采纳，I3/I10要求执行门槛与官方核验落点后再确认。未回应不计同意。

F7补齐：惰性清理时，到期活跃任务原子进入expired，释放等待器并退出活跃计数；后续读取返回MOCK_RESOURCE_EXPIRED，重复动作不恢复、不生成。过期文件读取同样返回该错误，保留有界过期ID墓碑以区分不存在；厂商无expired状态时adapter映射原生错误，内部事实独立。连接lifetime不依赖资源TTL，显式close/取消/溢出释放。

scope S1补表后已合理改写对齐，S1—S7全部设计对齐。independent I3执行门槛已采纳、I10子表合理改写，I1—I10全部设计对齐。上述回执均非实施验收。


## 实施与证据快照

七方原意见均已明确回查：scope S1—S7、independent I1—I10、source S1—S6、adversary A1—A7、fault F1—F8、API A1—A6、layer L1—L6。合理改写为独立ScenarioOutput、wire子表及生命周期细化，其余准确采纳；无仍反对的具体A/B，因此未启动投票。该处置不替代以下实施证据。

实际实现：protocol catalog登记Chat及四新codec，公共scenario规范化与单一evaluate准入；lifecycle独立store与fault/state/route catalogs；Realtime/Live duplex、datachannel适配及Node实际WS。保留旧routes/encodeModelResponse和generate，生产依赖无Agent Core。WS依赖ws，其公开声明所需@types/ws随依赖交付。

最终只读审查曾复现三项P2并已修复：Chat工具回复null兼容、Chat无法表示交错有序项时明确拒绝、lifecycle请求使用独立maxBodyBytes限额。补充重复显式调用ID拒绝、activeStreams独立计数与正文超限零接纳/无部分写入反例。没有通过跳过失败关闭缺陷。

### 已运行检查

- Node 22.20.0 ESM/CJS正式构建通过。
- 最终包回归同时配置两个可选Core消费者入口：251/251通过，0失败、0跳过。日志 `.tmp/multi-protocol-all-final.log`。早期未配置peer时的跳过结果不作为最终验收。
- 定向80/80通过：独立wire24项、生命周期44项（38普通及6可选Core）、实时12项；包含在最终251项，不重复相加。日志 `.tmp/multi-protocol-final-targeted.log`。
- 生命周期含实际MockGPT.fetch、真实loopback HTTP、2后台/3Batch及unknown提交的公开Core消费者，44/44通过。正文限额11反例在其中。日志 `.tmp/mockgpt-lifecycle-body-limit.log`。
- 可选Core普通/实时消费者53/53通过：五协议文本/工具/拒权撤权/历史锚点隔离、JSON/schema成功及失败、三搜索授权/隐私、三签名协议HTTP/SSE续接及有序输入、两实时协议duplex/实际WS。最初四项历史篡改失败由Core维护方独占修复后，保留原断言全部回归通过。日志 `.tmp/core-result.txt`。
- 最终tarball仓外安装并通过ESM/CJS/root/node/四codec/duplex及随包示例；strict TypeScript消费root/node新类型通过。消费者目录由 `.tmp/multi-protocol-consumer-path` 记录，无workspace链接。
- tarball确认包含双语说明、示例、Skill，无临时文件/凭据；136文件，172926字节。版本仍0.2.2，未发布。

### 指纹

31个src TypeScript文件按相对路径排序，以path+NUL+原始bytes+NUL计算SHA256：`73af3086cc753e9276c634e9cf01e9ee43e3bb6f09ad80b94e95f418c481f50e`。

`.tmp/jangts-mock-gpt-0.2.2.tgz` SHA256：`cfa7be4cc30e428c2c8654c9490403578f500b96d110e5ea492ab8c770ddb0e2`。包体与源码指纹分别记录，不把源码检查当包体验证。

### 官方核对与边界

核对日期2026-11-25；协议实施者独立读取Responses streaming-events、Claude streaming、Gemini generateContent与Interactions streaming；生命周期实施者读取OpenAI background/batch、Claude batches、Gemini batch/files及Interactions；实时实施者读取OpenAI realtime-conversations与Gemini Live。具体URL见wire子表及源文件头。独立wire断言未使用Core decoder生成期望。

有限能力：Responses/Messages/Gemini两协议完整HTTP与SSE、结构化指定输出、工具、签名、有序输入引用，合法输出引用按各协议capabilities；Responses/Messages普通助手输出无法表示任意媒体时明确拒绝。搜索只实现Responses web_search、Messages web_search_20250305、Interactions google_search。后台为Responses/Interactions；Batch三厂及对应文件；Gemini上传仅start→单次finalize，不保证分段续传。实时为手动轮次、文本/工具/合成base64音频数据帧，有界队列和实际WS。datachannel使用合同fixture，无真实SDP、设备、轨道、编解码、媒体质量、厂商服务、云端计费或分布式持久化证据。

未提交、推送、发布或部署；未调用DeepSeek或读取真实凭据。最初直接npm install依赖偏离项目只在根npm ci的安装约定，随后已回到根npm ci按锁重装，未修改系统Node。


## 最终接线与协议差异

可选消费者不形成运行依赖：`MOCKGPT_AGENT_CORE=file:///Users/ivan/Codes/jangts/main/packages/agent-core/dist/esm/index.js` 驱动53项普通/实时消费者；`MOCKGPT_AGENT_CORE_MODULE` 同路径驱动生命周期文件中的6项Core消费者。其余使用公开Support factory+Runner+session+ToolRuntime，保留真实授权、执行次数、账本、终态与续接断言。未配置peer会显式跳过，不将跳过计成功。

G5拒答细格为采用的Interactions原生schema无可区分refusal/content_filter合同；源码显式MOCK_CAPABILITY，不冒称模拟成功，也不推断真实模型不会拒答。G1交错有序输出无法表达时显式拒绝；G2/G3任意输出媒体引用无法表达时显式拒绝。R4仅datachannel合同fixture通过，真实WebRTC媒体仍未验证。这些是逐格的协议与证据边界，不是404替代交付。

本机真实HTTP、WS是loopback资源；未启动Playground/浏览器或做压测。全部模拟内容和测试身份为合成数据。Node22通过当前workspace命令运行，未修改系统Node。

## 修改文件

原有提案与维护索引改动保留；本次源码、文档、包配置/锁及新增测试如下（未提交）：

- `docs/maintenance/README.md`
- `docs/maintenance/multi-protocol-agent-core-proposal.md`
- `docs/maintenance/multi-protocol-implementation.md`
- `docs/maintenance/multi-protocol-wire-matrix.md`
- `docs/review-entrypoints.md`
- `package-lock.json`
- `packages/mock-gpt/README.md`
- `packages/mock-gpt/docs/multi-protocol.md`
- `packages/mock-gpt/examples/multi-protocol.mjs`
- `packages/mock-gpt/package.json`
- `packages/mock-gpt/skills/mock-gpt-config/SKILL.md`
- `packages/mock-gpt/src/index.ts`
- `packages/mock-gpt/src/lifecycle/faults.ts`
- `packages/mock-gpt/src/lifecycle/index.ts`
- `packages/mock-gpt/src/lifecycle/store.ts`
- `packages/mock-gpt/src/node.ts`
- `packages/mock-gpt/src/node/websocket.ts`
- `packages/mock-gpt/src/protocols/catalog.ts`
- `packages/mock-gpt/src/protocols/gemini.ts`
- `packages/mock-gpt/src/protocols/interactions.ts`
- `packages/mock-gpt/src/protocols/messages.ts`
- `packages/mock-gpt/src/protocols/request.ts`
- `packages/mock-gpt/src/protocols/responses.ts`
- `packages/mock-gpt/src/protocols/sse.ts`
- `packages/mock-gpt/src/realtime/datachannel.ts`
- `packages/mock-gpt/src/realtime/duplex.ts`
- `packages/mock-gpt/src/runtime/mock.ts`
- `packages/mock-gpt/src/runtime/responses.ts`
- `packages/mock-gpt/src/runtime/scenario.ts`
- `packages/mock-gpt/src/types.ts`
- `packages/mock-gpt/test/multi-protocol-agent-core.test.mjs`
- `packages/mock-gpt/test/multi-protocol-lifecycle.test.mjs`
- `packages/mock-gpt/test/multi-protocol-realtime.test.mjs`
- `packages/mock-gpt/test/multi-protocol-wire.test.mjs`

## Gemini Live 同步工具续答复验（2026-11-25）

[Google Live 官方工具指南](https://ai.google.dev/gemini-api/docs/live-api/tools)的 JavaScript 示例发送 `sendToolResponse` 后直接继续读取模型消息。同步工具结果全部回传后，MockGPT 自动继续当前轮次。收到工具提案时客户端可立即回传结果，`turnComplete` 在最终模型回复时发出。多个调用结果可分次送达，未到齐时保持等待。错误批次整体拒绝，重复结果不触发额外生成。OpenAI 仍使用独立的 `response.create`。

Node 22 构建与实时定向 14 项通过。新增两项分别覆盖多工具等待、同一 generation、一次最终回复，以及通过真实本机 WebSocket 发送工具结果后收到最终回复。这次检查单独记录，早先 251 项结果和包体指纹对应当时工件。待 Core 续答接口就绪后再验证公开消费者的实际运行与计数。

Core 最终构建的公开消费者复验通过，共 113 项，零失败、零跳过。其中普通及实时消费者 55 项，生命周期 44 项，MockGPT 独立实时 14 项。新增续答覆盖 OpenAI Realtime 与 Gemini Live 各自的注入 duplex 和本机 WebSocket。两种协议均从工具提案直接调用 session.tool，断言拒权零执行，授权后实际执行一次，Runner 和 MockGPT 各记录两次生成，并收到最终文本。OpenAI 原生序列在工具结果后发送唯一一次续答 response.create。Gemini 只提交一组 toolResponse。两种协议均只有一条用户输入。日志为 `.tmp/core-realtime-final.log`。
