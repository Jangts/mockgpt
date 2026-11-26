# 第 4 步 · 工具提议

预约座位这类动作需要明确的**工具调用**，而不是一段文字。用 `generators.toolCall(name, arguments)` 产生一个工具提议；它只表示「模型希望调用这个工具」，真实执行仍由调用方负责。

```js
import { MockGPT, generators } from '@jangts/mock-gpt';

const mock = new MockGPT({
  rules: [
    { prompt: /预约|订位/, generator: generators.toolCall('reserve', {
      seats: 2,
      date: '2026-11-06',
      time: '19:00',
    }) },
  ],
});

const reply = await mock.generate({
  model: 'demo',
  messages: [{ role: 'user', content: '帮我订两个位子，明晚七点' }],
});
console.log(reply);
// ResponseDescription { kind: 'model', value: { tools: [...], content: null } }
```

工具参数会被 JSON 序列化一次；调用 ID 默认按顺序稳定生成，便于调用方关联回执。

## 多个工具提议

需要一次返回多个调用时，用 `responses.toolCalls`：

```js
import { MockGPT, responses } from '@jangts/mock-gpt';

const mock = new MockGPT({
  rules: [{
    prompt: /查订单和会员/,
    generator: responses.toolCalls([
      { name: 'query_order', arguments: { orderId: 'order-1' } },
      { name: 'query_member', arguments: { phone: '138****0000' } },
    ]),
  }],
});
```

## 工具提议 ≠ 执行

MockGPT 不会真的执行工具，也不会把外部工具调用说成已经完成。完整链路通常是：Mock 返回工具提议 → 你的模型客户端或服务端收到 `tool_calls` → 你校验并执行 → 再以工具回执作为输入发起下一轮请求。

工具回执本身也能回到规则匹配里，借助 `when(request)` 谓词判断：

```js
const mock = new MockGPT({
  rules: [{
    when: request => request.messages.some(message => message.role === 'tool'),
    generator: '已根据预订结果为您安排好座位。',
  }],
});
```

下一课用生成器给下单生成随机订单号、取餐码和当日推荐。