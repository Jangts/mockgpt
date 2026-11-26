# Step 2 · Rules & business Q&A

Now let the assistant answer a few common business questions by keyword. `prompt` supports exact string matching and `RegExp` matching, and rules are evaluated in **declared order**, not automatically by "which looks more specific".

```js
import { MockGPT } from '@jangts/mock-gpt';

const mock = new MockGPT({
  rules: [
    { prompt: 'hello', generator: 'Hello, welcome to Microcola Coffee! How can I help you?' },
    { prompt: /opening hours/, generator: 'Microcola Coffee is open daily from 08:00 to 22:00.' },
    { prompt: /address|where/, generator: 'We are at 12 Huayuan Road, first floor. It is about a 3-minute walk from Exit C of Huayuan Station on Metro Line 3.' },
    { prompt: /membership/, generator: 'Members get 10% off regular drinks and a free latte on their birthday.' },
  ],
});
```

```js
console.log(await mock.generate({ model: 'demo', messages: [{ role: 'user', content: 'What are your opening hours?' }] }));
// Microcola Coffee is open daily from 08:00 to 22:00.

console.log(await mock.generate({ model: 'demo', messages: [{ role: 'user', content: 'Where is the shop?' }] }));
// We are at 12 Huayuan Road, first floor. It is about a 3-minute walk from Exit C of Huayuan Station on Metro Line 3.
```

## Rule fields

| Field | Behavior |
| --- | --- |
| `prompt` | Exact string or `RegExp`; by default compares the text blocks of the last `user` message, joined in original order with newlines |
| `model` | Optional exact model name |
| `when(request)` | Optional synchronous request predicate for more complex scenarios such as tool receipts |
| `generator` | String, JSON value or function; required |
| `times` | Optional positive-integer usage limit; `1` means once only |
| `id` | Optional unique identifier; defaults to `rule-1` etc. by position |

## RegExp capture groups

Capture groups are passed to function generators so you can echo content from the input:

```js
const mock = new MockGPT({
  rules: [
    { prompt: /I want a cup of (.+)/, generator: ({ match }) => `Got it, one ${match[1]}, please wait a moment.` },
  ],
});

console.log(await mock.generate({ model: 'demo', messages: [{ role: 'user', content: 'I want a cup of latte' }] }));
// Got it, one latte, please wait a moment.
```

Function generators receive `request`, `prompt`, `match`, `callIndex`, `ruleIndex`, `signal`, `random()`, `clock()` and `report(metadata)`. The request is a frozen snapshot; indexes are assigned at match time.

In the next step, ordering will return a structured JSON menu instead of plain text.
