# Step 7 · Long-text summary & bullets

All previous steps used "fixed question → fixed reply", but customers often send a long list of requirements at once. Use the input-aware text generator `generators.summary()` to compress the text into a single confirmation, then reply "Got it".

`summary` is extractive: it builds a TextRank-style sentence graph, uses MMR-style redundancy control, selects sentences within a length budget and restores the original reading order. The whole process runs locally without calling a real LLM.

```js
import { MockGPT, generators } from '@jangts/mock-gpt';

const summarize = generators.summary({ maxChars: 120 });

const mock = new MockGPT({
  rules: [{
    prompt: /requirements/,
    generator: async context => `Got it, let me confirm: ${await summarize(context)}`,
  }],
});
```

```js
const reply = await mock.generate({
  model: 'demo',
  messages: [{
    role: 'user',
    content: 'We have a team-building afternoon tea request: deliver to the 8th-floor conference room before 3pm next Wednesday for 30 people. We need 10 caffeine-free drinks, 5 oat milk lattes, and the rest can be Americanos. Add 30 croissants and two plates of fruit. Please charge to our corporate account and issue a 13% VAT invoice to "Microcola Information Technology Co., Ltd."',
  }],
});
console.log(reply);
// Got it, let me confirm: … (representative sentences extracted and concatenated in original order)
```

`generators.summary()` returns a generator function, so create it once in the rule and evaluate it with the same `context` on each request. This lets you prepend or append fixed text.

## Summary options `TextOptions`

| Field | Description | Default |
| --- | --- | --- |
| `maxChars` | Maximum output code points | 240 |
| `count` | Number of sentences to consider | 3 |
| `source` | Fixed string or `(context) => string \| Promise<string>`; defaults to the last `user` message text | current prompt |

`source` can be swapped for web page text, chaining "summary + web" together:

```js
import { generators } from '@jangts/mock-gpt';
import { sources } from '@jangts/mock-gpt/web';

const summarize = generators.summary({ source: sources.web() });
```

When used with `sources.web()`, the body is extracted from the page first and then summarized. Full options are in [Web sources](/en/api/sources).

## Other input-aware generators

Besides summary, `generators` includes lightweight input text processors, all without a real LLM:

| Generator | Output |
| --- | --- |
| `generators.bullets()` | Markdown bullets |
| `generators.keywords()` | JSON keyword array |
| `generators.title()` | Single-line title (first sentence) |
| `generators.extract()` | Regex field extraction (emails, dates, amounts, etc.) |
| `generators.reply()` | Template reply with a topic |

They are used the same way as `summary`; details are in [Generators](/en/api/generators).

::: warning Summary quality
Sentence selection is algorithmic and not a capability guarantee. It makes replies vary with input, not something you can assert "contains a specific keyword". If your test needs strict output, go back to strings or value generators.
:::

This concludes the course. Full field constraints are in the [API reference](/en/api/).
