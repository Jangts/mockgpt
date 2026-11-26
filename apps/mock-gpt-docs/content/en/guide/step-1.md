# Step 1 · Minimal reply

First let the assistant reply to "hello" with a welcome message. This introduces MockGPT's two core ideas: **rules** and **generators**.

A rule declares "what input matches". A generator decides "what to return when matched". A fixed string is the simplest generator.

```js
import { MockGPT } from '@jangts/mock-gpt';

const mock = new MockGPT({
  rules: [
    { prompt: 'hello', generator: 'Hello, welcome to Microcola Coffee! How can I help you?' },
  ],
});

const reply = await mock.generate({
  model: 'demo',
  messages: [{ role: 'user', content: 'hello' }],
});
console.log(reply);
// Hello, welcome to Microcola Coffee! How can I help you?
```

## What happens

1. `new MockGPT(options)` validates and freezes the rules into a snapshot.
2. `generate(input)` reads the text of the last `user` message to obtain the `prompt` to match.
3. Rules are evaluated in declared order; `prompt: 'hello'` is an exact string match.
4. The matched `generator` runs and the fixed string is returned as the reply content.

`generate()` returns a string, a native JSON value or an explicit response description. It does not add latency, chunking, HTTP errors or SSE. The return value is an independent frozen snapshot.

## A request that does not match

If no rule matches, `generate()` throws a `MockGPTError` with code `MOCK_RULE_NOT_FOUND` instead of connecting to a real model:

```js
await mock.generate({ model: 'demo', messages: [{ role: 'user', content: 'What are your opening hours?' }] });
// Uncaught MockGPTError: No MockGPT rule matched this request (code: MOCK_RULE_NOT_FOUND)
```

In the next step we add business Q&A rules so it can answer opening hours, address and other common questions.

::: tip
`model` and `messages` are standard model-request fields. Rule matching also reads `model`; additional condition fields can be passed in for more complex predicates.
:::
