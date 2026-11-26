# 第 2 步 · 规则与业务问答

现在让客服能按关键词回答几类常见业务问题。`prompt` 支持字符串精确匹配和 `RegExp` 模式匹配，规则按**声明顺序**执行，不按「看起来更具体」自动排序。

```js
import { MockGPT } from '@jangts/mock-gpt';

const mock = new MockGPT({
  rules: [
    { prompt: '你好', generator: '你好，欢迎光临小可乐咖啡，请问有什么可以帮你？' },
    { prompt: /营业时间/, generator: '小可乐咖啡每日 08:00—22:00 营业。' },
    { prompt: /地址|在哪里/, generator: '我们在花园路 12 号一层，地铁 3 号线花园站 C 口步行约 3 分钟。' },
    { prompt: /会员/, generator: '会员正价饮品 9 折，生日当天赠一杯拿铁。' },
  ],
});
```

```js
console.log(await mock.generate({ model: 'demo', messages: [{ role: 'user', content: '你们的营业时间是几点？' }] }));
// 小可乐咖啡每日 08:00—22:00 营业。

console.log(await mock.generate({ model: 'demo', messages: [{ role: 'user', content: '店在哪里' }] }));
// 我们在花园路 12 号一层，地铁 3 号线花园站 C 口步行约 3 分钟。
```

## 规则字段

| 字段 | 行为 |
| --- | --- |
| `prompt` | 字符串精确匹配或 `RegExp`；默认比较最后一条 `user` 消息的文本块，按原顺序换行拼接 |
| `model` | 可选模型名，精确匹配 |
| `when(request)` | 可选同步请求谓词，可匹配工具回执等更复杂场景 |
| `generator` | 字符串、JSON 值或函数，必需 |
| `times` | 可选正整数使用次数；`1` 表示只命中一次 |
| `id` | 可选唯一标识，省略时按位置生成 `rule-1` 等 |

## 正则捕获组

正则的捕获组会传给函数生成器，用于把输入里的内容回填进回复：

```js
const mock = new MockGPT({
  rules: [
    { prompt: /我要一杯(.+)/, generator: ({ match }) => `好的，一杯${match[1]}，请稍候。` },
  ],
});

console.log(await mock.generate({ model: 'demo', messages: [{ role: 'user', content: '我要一杯拿铁' }] }));
// 好的，一杯拿铁，请稍候。
```

函数生成器收到 `request`、`prompt`、`match`、`callIndex`、`ruleIndex`、`signal`、`random()`、`clock()` 与 `report(metadata)`；请求是冻结快照，序号在匹配时分配。

下一课让点单返回结构化的 JSON 菜单，而不是一段纯文本。