# 第 5 步 · 生成器与随机资料

固定回复适合严格测试，但演示客服最好让下单结果随输入变化。`generators` 里的**值生成器**返回一个接收 `context` 的函数，在每次请求时求值。

```js
import { MockGPT, generators } from '@jangts/mock-gpt';

const orderId = generators.id('order');
const pickupCode = generators.integer(1000, 9999);
const recommend = generators.pick(['海盐焦糖拿铁', '冰滴冷萃', '桂花乌龙奶茶']);

const mock = new MockGPT({
  seed: 42,
  rules: [{
    prompt: /下单/,
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
  messages: [{ role: 'user', content: '下单，一杯海盐焦糖拿铁' }],
});
console.log(reply);
// { orderId: 'order-1-...', pickupCode: 8123, recommendation: '冰滴冷萃' }
```

值生成器在规则里先创建一次，再在每次请求里用同一个 `context` 求值，保证同一请求内字段一致。

## 常用生成器

| 生成器 | 说明 |
| --- | --- |
| `generators.id(prefix?)` | 稳定前缀 + 调用序号 + 随机后缀 |
| `generators.integer(min, max)` / `float(min, max)` | 范围内的随机数 |
| `generators.pick(items)` | 从数组随机选一个 |
| `generators.sequence([...])` | 按本规则命中序号逐项返回，耗尽报错 |
| `generators.date()` | 使用实例 `clock` 的 ISO 时间 |
| `generators.imageUrl({ width, height })` | 本地 SVG data URL 占位图 |
| `generators.summary()` / `bullets()` / `keywords()` / `title()` / `extract()` / `reply()` | 输入相关的轻量文本算法，无真实 LLM |

## 可复现条件

固定 `seed` 只保证「同一输入、同一调用顺序」时结果一致；随机源和 `clock` 都由实例持有，不依赖全局状态，不会因其他测试影响本次结果。

```js
for (let i = 0; i < 3; i++) {
  const a = await mock.generate({ model: 'demo', messages: [{ role: 'user', content: '下单' }] });
  console.log(a.orderId, a.pickupCode);
}
// 同一 seed 下，每次调用会推进随机序列，结果与调用顺序绑定。
```

下一课让长回复逐步流出，并把它接到真实的模型客户端或独立服务上。