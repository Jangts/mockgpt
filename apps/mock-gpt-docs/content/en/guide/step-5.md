# Step 5 · Generators & random data

Fixed replies are great for strict tests, but a demo assistant is more convincing when order results vary with the input. **Value generators** in `generators` return a function that is evaluated on each request.

```js
import { MockGPT, generators } from '@jangts/mock-gpt';

const orderId = generators.id('order');
const pickupCode = generators.integer(1000, 9999);
const recommend = generators.pick(['Sea-salt Caramel Latte', 'Cold Brew', 'Osmanthus Oolong Milk Tea']);

const mock = new MockGPT({
  seed: 42,
  rules: [{
    prompt: /order/,
    generator: context => ({
      orderId: orderId(context),
      pickupCode: pickupCode(context),
      recommendation: recommend(context),
    }),
  }],
});
```

```js
const reply = await mock.generate({
  model: 'demo',
  messages: [{ role: 'user', content: 'Order one sea-salt caramel latte' }],
});
console.log(reply);
// { orderId: 'order-1-...', pickupCode: 8123, recommendation: 'Cold Brew' }
```

Value generators are created once inside the rule and evaluated with the same `context` on every request, so fields within one request stay consistent.

## Common generators

| Generator | Description |
| --- | --- |
| `generators.id(prefix?)` | Stable prefix + call index + random suffix |
| `generators.integer(min, max)` / `float(min, max)` | Random number in range |
| `generators.pick(items)` | Random pick from an array |
| `generators.sequence([...])` | Return items by hit index for this rule; throws when exhausted |
| `generators.date()` | ISO time using the instance `clock` |
| `generators.imageUrl({ width, height })` | Local SVG data-URL placeholder |
| `generators.summary()` / `bullets()` / `keywords()` / `title()` / `extract()` / `reply()` | Input-aware lightweight text algorithms, no real LLM |

## Reproducibility

Fixing `seed` only guarantees the same result for the same input and call order. The random source and `clock` are held by the instance, independent of global state, so other tests cannot affect this one.

```js
for (let i = 0; i < 3; i++) {
  const a = await mock.generate({ model: 'demo', messages: [{ role: 'user', content: 'order' }] });
  console.log(a.orderId, a.pickupCode);
}
// Under the same seed, each call advances the random sequence, so results are bound to call order.
```

Next we stream long replies and wire them to a real model client or standalone service.
