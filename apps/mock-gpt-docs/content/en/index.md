---
layout: home
hero:
  name: MockGPT
  text: Configurable mock-response SDK
  tagline: No real LLM, API key or fixture needed. Organize replies with rules and generators.
  actions:
    - theme: brand
      text: Start here
      link: /en/guide/
    - theme: alt
      text: Browse API reference
      link: /en/api/
features:
  - title: Declarative rules
    details: Rules execute in declared order; the first match wins. Match with strings, RegExp or request predicates.
    link: /en/guide/step-2
  - title: Structured replies
    details: Plain objects become JSON content. Explicit helpers separate tool calls and failures from normal fields.
    link: /en/api/responses
  - title: Generators
    details: Fixed data, random fields, summaries, keywords and field extraction all vary with the input.
    link: /en/api/generators
  - title: Streaming & wiring
    details: The same rules produce JSON or SSE. Built-in fetch adapter and minimal Node server fit existing model clients.
    link: /en/guide/step-6
---

## Choose a reading path

| You want to | Start here |
| --- | --- |
| Walk through the example step by step | [Guide course](/en/guide/) |
| Learn how rules match | [Rules & business Q&A](/en/guide/step-2) |
| Return tool calls or simulate failures | [Response descriptions](/en/api/responses) |
| Generate random data and summaries | [Generators](/en/api/generators) |
| Run a standalone model API server | [Node server](/en/api/node) |
| Look up error codes and field constraints | [API overview](/en/api/) |
