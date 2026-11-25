# Wire 验收子表

日期2026-11-25。最终有限合同验收完成；逐格证据见下节。每个http/sse子ID独立记录结果；方法路径是实施目标，不是已支持声明。独立原生断言落点统一为 packages/mock-gpt/test/multi-protocol-wire.test.mjs，消费者另列，不互相替代。

| 子ID | 方法与路径/动作 | 官方来源 | 采用版本/关键断言 |
| --- | --- | --- | --- |
| G1-http / G1-sse | POST /v1/chat/completions、/chat/completions | https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create | v1；choices/delta/finish_reason/[DONE] |
| G2-http / G2-sse | POST /v1/responses、/responses | https://developers.openai.com/api/docs/guides/migrate-to-responses | v1；output项、call_id、response.completed |
| G3-http / G3-sse | POST /v1/messages、/messages | https://platform.claude.com/docs/en/api/messages | anthropic-version 2023-06-01；content_block_start/delta/stop、message_stop；不声称2026-10-21格式 |
| G4-http / G4-sse | POST /v1beta/models/{model}:generateContent / :streamGenerateContent?alt=sse | https://ai.google.dev/api/generate-content | v1beta；candidates/parts/finishReason/usageMetadata |
| G5-http / G5-sse | POST /v1beta/interactions | https://aistudio.google.com/docs/streaming | v1beta；steps、step.start/delta/stop、interaction.completed |
| H1 | G2 web_search 配置/输出 | https://developers.openai.com/api/docs/guides/tools-web-search | web_search_call、annotations/sources |
| H2 | G3 web_search_20250305 | https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool | server_tool_use/web_search_tool_result/citations |
| H3 | G5 google_search | https://aistudio.google.com/docs/google-search | google_search_call/result |
| O1-submit/query/read/cancel | POST /v1/responses background:true；GET /v1/responses/{id}；POST /v1/responses/{id}/cancel | https://developers.openai.com/api/docs/guides/background | queued/in_progress/completed/cancelled；read为GET同资源 |
| O2-submit/query/read/cancel | POST /v1beta/interactions background:true；GET /v1beta/interactions/{id}；POST /v1beta/interactions/{id}/cancel | https://ai.google.dev/gemini-api/docs/interactions | status/steps；read为GET同资源 |
| B1-create/query/cancel/results | POST /v1/batches；GET /v1/batches/{id}；POST /v1/batches/{id}/cancel；GET /v1/files/{id}/content | https://developers.openai.com/api/docs/guides/batch | custom_id、output_file_id/error_file_id |
| B1-file | POST /v1/files multipart；GET/DELETE /v1/files/{id} | https://developers.openai.com/api/reference/resources/files | JSONL purpose=batch |
| B2-create/query/cancel/results | POST /v1/messages/batches；GET /v1/messages/batches/{id}；POST .../{id}/cancel；GET .../{id}/results | https://platform.claude.com/docs/en/api/messages/batches | requests/custom_id、JSONL result |
| B2-file | POST /v1/files multipart；GET/DELETE /v1/files/{id}；GET .../{id}/content | https://platform.claude.com/docs/en/api/files | 独立文件资源；Batch输入requests非虚构input_file_id |
| B3-create/query/cancel/results | POST /v1beta/models/{model}:batchGenerateContent；GET /v1beta/{batchName}；POST /v1beta/{batchName}:cancel | https://ai.google.dev/gemini-api/docs/batch-api | requests/key、inlinedResponses/responsesFile |
| B3-file | POST /upload/v1beta/files；GET/DELETE /v1beta/files/{id}；GET /download/v1beta/{file}:download?alt=media | https://ai.google.dev/gemini-api/docs/files | 上传session及产物下载分别验证 |
| R1-duplex / R1-ws | WS /v1/realtime | https://developers.openai.com/api/docs/guides/realtime | session.update/response.create/response.cancel、response ID |
| R2-duplex / R2-ws | WS /ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent | https://ai.google.dev/gemini-api/docs/live-guide | setup/clientContent/toolResponse/serverContent、interrupted |

上述来源均由相应实施者在2026-11-25独立核对采用字段；测试先按官方实例建立独立期望，随后另做Core联调。采用范围与能力差异见下节，不宣称实现完整厂商API。


## 官方能力差异复核

2026-11-25 独立读取 Interactions reference：status 仅 in_progress/requires_action/completed/failed/cancelled/incomplete/requires_continuation，Content 无 refusal，未定义 content_filter。G5拒答格为上游无可区分合同，以MOCK_CAPABILITY明确拒绝，不使用通用failed冒充拒答，亦不把拒绝本身计作成功拒答模拟。Messages stop_reason 支持refusal，content_filter场景按该值映射；Gemini采用SAFETY，Responses采用incomplete_details.reason=content_filter。


## 最终逐格证据（2026-11-25）

- G1/G2/G3/G4/G5的http与sse子ID分别通过：独立wire24项与Core消费者53项。包含文本、工具、结构化、终态、签名/引用（适用协议）、字节流及取消反例；G5拒答格按上述官方能力差异处理，不作为正常成功。
- H1/H2/H3分别通过完整/SSE原生事件及Core消费者：显式配置、逐次授权、拒权零请求、远端私有观察、本地零执行与记录隐私。
- O1/O2及B1/B2/B3各动作和文件子格：生命周期44项通过，包含实际mock.fetch、loopback HTTP及6项公开Core消费者；Gemini仅start+单finalize。
- R1/R2的duplex/ws子ID：实时12项与Core53项中的6项实时消费者通过；R3传输限制、慢消费溢出与关闭在12项内；R4仅datachannel帧合同fixture通过。
- 最终包回归251/251，0skip；打包后仓外实际安装、ESM/CJS/Node/types及公开示例通过。精确指纹和修改文件见实施记录。

测试路径：`packages/mock-gpt/test/multi-protocol-wire.test.mjs`、`multi-protocol-lifecycle.test.mjs`、`multi-protocol-realtime.test.mjs`、`multi-protocol-agent-core.test.mjs`。上述汇总不能把同一测试在定向与全包运行中重复计数。
