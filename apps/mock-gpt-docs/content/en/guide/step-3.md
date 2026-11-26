# Step 3 · Structured data

An order should return structured data rather than a sentence. Pass a plain object or array as `generator` and it is returned as JSON content; `generate()` gives you the native JSON value directly.

```js
import { MockGPT } from '@jangts/mock-gpt';

const mock = new MockGPT({
  rules: [
    { prompt: 'hello', generator: 'Hello, welcome to Microcola Coffee! How can I help you?' },
    { prompt: /opening hours/, generator: 'Microcola Coffee is open daily from 08:00 to 22:00.' },
    { prompt: /menu|order|what do you have/, generator: {
      menu: [
        { name: 'Americano', price: 18 },
        { name: 'Latte', price: 24 },
        { name: 'Cold Brew', price: 26 },
        { name: 'Sea-salt Caramel Latte', price: 28 },
      ],
      note: 'To order, just tell me the item name and quantity.',
    } },
  ],
});
```

```js
const reply = await mock.generate({
  model: 'demo',
  messages: [{ role: 'user', content: 'Show me the menu' }],
});
console.log(reply.menu[0]);
// { name: 'Americano', price: 18 }
```

## Plain JSON vs. response descriptions

Plain objects are always treated as model content. Fields named `tool`, `intent` or `status` are not guessed to be tool calls or HTTP controls. Use explicit helpers when you need to simulate tool calls or failures (see Step 4).

## Snapshot and reproducibility

Literal objects in the configuration are frozen into a snapshot at creation time. Later changes to the original `options` object do not replace the saved rules. Each generation is independent and is not affected by previous calls.

::: tip How structured replies appear through protocol adapters
`generate()` returns native JSON. Only when going through `mock.fetch(...)` or the Node server is the object serialized into the `content` text of a model reply. Both paths share the same rules, not two separate implementations.
:::

Next we add a "reserve seats" capability using tool calls that hand the intent back to the caller.
