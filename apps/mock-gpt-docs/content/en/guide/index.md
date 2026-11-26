# MockGPT Guide: Build a Microcola Coffee assistant

This course uses a lightweight example—**Microcola Coffee's smart customer service**—to guide you through MockGPT. No real model, API key or server is required: every reply is produced locally by rules and generators, and the same code can be reused in your own customer service, test or demo scenarios.

## Goal

The assistant will be able to:

- Greet users.
- Answer common business questions such as opening hours, address and membership.
- Return a JSON menu for ordering.
- Propose tool calls for reservations.
- Generate random order IDs and recommendations.
- Summarize a long request into a short "Got it" confirmation.
- Stream long replies and wire them to a standard model client or standalone service.

## Steps

| Step | Topic | New capabilities |
| --- | --- | --- |
| [Step 1](/en/guide/step-1) | Installation & minimal reply | `MockGPT`, `generate()` |
| [Step 2](/en/guide/step-2) | Rules & business Q&A | String / RegExp rules, declared order |
| [Step 3](/en/guide/step-3) | Structured data | JSON object replies |
| [Step 4](/en/guide/step-4) | Tool proposals | `generators.toolCall` |
| [Step 5](/en/guide/step-5) | Generators & random data | Value generators, reproducible `seed` |
| [Step 6](/en/guide/step-6) | Streaming & wiring | `stream`, `fetch` adapter, Node server |
| [Step 7](/en/guide/step-7) | Long-text summary & bullets | `generators.summary`, input-aware generators |

Each step builds on the previous rule list and can be run directly in Node >= 22.12.

## Setup

```sh
npm install @jangts/mock-gpt
```

The caller can be a frontend or a server. `generate()` returns data directly without creating request objects or starting a server; use the built-in fetch adapter or Node server only when you need protocol wrapping.

Start with [Step 1 · Minimal reply](/en/guide/step-1).
