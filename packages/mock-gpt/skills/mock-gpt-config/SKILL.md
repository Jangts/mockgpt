---
name: mock-gpt-config
description: Create MockGPT preview, development or regression configurations from requirements, design documents or an existing Agent. Use for offline GPT simulation and early chat previews, not to evaluate real LLM reasoning.
---

# MockGPT configuration

Read the installed package's [usage and API](../../README.md) before generating code. Use only exports present in that version. MockGPT simulates configured native model protocols; it does not run a real LLM or execute tools. Read [multi-protocol usage](../../docs/multi-protocol.md) for protocol paths, ordered scenarios and optional lifecycles.

Accept whichever evidence exists: requirements, user stories, design/interface documents, Agent source, tests or representative model requests. Code, recordings and a fixture collection are not prerequisites.

For each chosen scenario identify the user goal, expected visible reply, clarification/failure paths and source location. Distinguish required behavior, design choices, current implementation and assumptions. Report conflicts; ask only when a missing decision materially changes the interaction or acceptance criteria.

- Without an Agent: generate `mock.config.mjs`, a few sample questions and expected preview behavior. Use standard messages and `mock-gpt serve --config ./mock.config.mjs`; do not invent application-specific request wrappers. This previews agreed behavior, not an unimplemented application's correctness.
- With an Agent: inspect how it constructs messages, schemas and tool results; adapt `selectPrompt`, `when` and generators to those actual requests. Keep mock configuration in the consumer's development/test area. Do not alter production credentials or model routing without authorization.
- For dynamic previews: prefer `generators.summary`, `bullets`, `title`, `keywords`, `extract` and `reply` over enumerating a fixed result for every input. `source` can select captured text or return asynchronous text. Web sources are explicit real network access and are unnecessary for offline tests.
- Web previews use ordinary Node HTTP requests, without a browser, login or Cookie import. For an unsupported reply on retrieval failure, configure `sources.web({ fallback: '我目前不支持访问实时网页。' })`; fetched text is summarized when available. Omit fallback for strict failure tests. Do not claim a failed page was read; retain source diagnostics and cancellation. Text already obtained by an Agent tool can be passed directly as `source`.
- For regression: prefer exact outputs, explicit predicates and isolated instances. Fix seed and clock if relevant; only use `sequence` when order is part of the contract. No silent fallback to a real model or fake success. Check unused/exhausted sequence responses and relevant call counts, tool arguments and final behavior.

Ordinary objects/arrays generate JSON content. Use `generators.toolCall` or `responses.toolCalls` for tool proposals; do not assume any special JSON field executes a tool. A typical closed loop matches a tool-result message with `when` before a broader initial prompt rule, because matching is first eligible rule in declaration order. The consumer owns tool authorization and execution.

Use `responses.httpError`, `responses.reject`, and explicit output options for negative scenarios; distinguish malformed content from a transport failure. Do not change expectations merely to match the implementation under test. Expected behavior comes from the user's requirements, confirmed contracts or the external protocol.

Keep JSON within 64 nesting levels and 100,000 value nodes. Include complexity, output/body budget, prototype-named fields and cancellation cases when those boundaries matter. Custom transport adapters can use `encodeModelResponse` to share the SDK's validated JSON/SSE codec; the caller still owns request reads, pre-response delay, IDs and stream lifetime. Do not copy a second encoder into a consumer.

Use the consumer's existing test framework when requested and available. If none exists, provide preview steps or lightweight acceptance cases; do not create an application or impose a test framework merely to run a preview. Execute only checks permitted in that workspace and clearly state what ran.

Keep default deliverables small: a readable configuration plus connection/preview instructions, with tests only when needed. Preserve privacy: do not copy full private conversations, keys or arbitrary production uploads into the published package. Real recordings are optional; sanitized minimal samples are enough for protocol regression.

Describe covered scenarios, assumptions and omissions. Mock success proves configured program paths, not real-model understanding, summary quality or exhaustive natural-language coverage.

For multiple protocols, reuse one rule/scenario and change native client configuration. Use `responses.scenario({items})` for ordered text/function-call/thinking/media/search/refusal items; check codec capabilities before choosing items. Never combine scenario items with legacy content/tools. Preserve signatures outside prompt text and keep provider search distinct from locally authorized tool execution. Do not infer protocol from model names.

Enable `lifecycle` only for background/Batch/files. Fix clock and synthetic scope for deterministic tests; query/download/cancel must not consume new generations. Model accepted-but-lost confirmation explicitly, never retry it as if nothing was submitted. Realtime uses `createMockDuplex` or the Node WebSocket entry; close connections and independently cancel remote tasks. JSON/datachannel frames do not prove SDP, device, codec or real media support. Keep wire, injected-fetch, actual HTTP/WS and real-media evidence separate.
