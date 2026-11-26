# Step 4 · Tool proposals

Actions like reserving a seat need an explicit **tool call**, not a block of text. Use `generators.toolCall(name, arguments)` to produce a tool proposal. It only says "the model wants to call this tool"; the real execution is still the caller's responsibility.

```js
import { MockGPT, generators } from '@jangts/mock-gpt';

const mock = new MockGPT({
  rules: [
    { prompt: /reserve|book a table/, generator: generators.toolCall('reserve', {
      seats: 2,
      date: '2026-11-06',
      time: '19:00',
    }) },
  ],
});

const reply = await mock.generate({
  model: 'demo',
  messages: [{ role: 'user', content: 'Book two seats for tomorrow at 7pm' }],
});
console.log(reply);
// ResponseDescription { kind: 'model', value: { tools: [...], content: null } }
```

Tool arguments are JSON-serialized once. Call IDs are generated in stable order so the caller can correlate receipts.

## Multiple tool proposals

Return several calls at once with `responses.toolCalls`:

```js
import { MockGPT, responses } from '@jangts/mock-gpt';

const mock = new MockGPT({
  rules: [{
    prompt: /check order and membership/,
    generator: responses.toolCalls([
      { name: 'query_order', arguments: { orderId: 'order-1' } },
      { name: 'query_member', arguments: { phone: '138****0000' } },
    ]),
  }],
});
```

## Tool proposals are not execution

MockGPT does not actually execute tools, and it does not claim that external tool calls are completed. The full flow is usually: Mock returns a tool proposal → your model client or server receives `tool_calls` → you validate and execute → you start the next round with a tool receipt as input.

Tool receipts can also feed back into rule matching using the `when(request)` predicate:

```js
const mock = new MockGPT({
  rules: [{
    when: request => request.messages.some(message => message.role === 'tool'),
    generator: 'Your seats have been arranged according to the reservation result.',
  }],
});
```

Next we use generators to produce random order IDs, pickup codes and daily recommendations.
