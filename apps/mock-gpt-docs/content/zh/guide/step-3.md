# 第 3 步 · 结构化资料

点单不该只返回一句文字，而应返回一份结构化菜单。`generator` 传普通对象或数组，就会作为 JSON 内容返回，`generate()` 直接拿到原生 JSON 类型。

```js
import { MockGPT } from '@jangts/mock-gpt';

const mock = new MockGPT({
  rules: [
    { prompt: '你好', generator: '你好，欢迎光临小可乐咖啡，请问有什么可以帮你？' },
    { prompt: /营业时间/, generator: '小可乐咖啡每日 08:00—22:00 营业。' },
    { prompt: /菜单|点单|有什么/, generator: {
      菜单: [
        { name: '美式', price: 18 },
        { name: '拿铁', price: 24 },
        { name: '冷萃', price: 26 },
        { name: '海盐焦糖拿铁', price: 28 },
      ],
      提示: '下单请直接告诉我品名和数量。',
    } },
  ],
});
```

```js
const reply = await mock.generate({
  model: 'demo',
  messages: [{ role: 'user', content: '看看菜单' }],
});
console.log(reply.菜单[0]);
// { name: '美式', price: 18 }
```

## 普通 JSON 与响应描述的区别

普通对象始终作为模型内容，不会因为字段名叫 `tool`、`intent` 或 `status` 就被猜成工具调用或 HTTP 控制项。需要模拟工具调用或故障时，用显式 helper（见第 4 步），不猜测普通 JSON 字段。

## 快照与可复现

配置里的字面量对象在创建时被冻结成快照，之后修改原 `options` 对象不会替换已保存的规则。每次生成都是独立结果，不会因前一次调用改变值。

::: tip 结构化回复在协议适配中的表现
`generate()` 返回的是原生 JSON；只有经过 `mock.fetch(...)` 或 Node 服务时，才会把对象序列化成模型回复的 `content` 文本。两种方式共用同一份规则，不是两套生成逻辑。
:::

下一课给客服加上「预约座位」能力，用工具调用把意图交给调用方去执行。