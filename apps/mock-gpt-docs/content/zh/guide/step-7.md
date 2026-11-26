# 第 7 步 · 长文本摘要与要点

前面几步都是「固定问题 → 固定回复」，但顾客也常常一口气说一大段需求。用输入相关文本生成器 `generators.summary()` 把长文本压成一句确认，客服再回「好的」。

`summary` 是抽取式摘要：对最后一条 `user` 消息的文本做 TextRank 风格的句子图排序，再用 MMR 控制重复，在长度预算内选定句子后恢复原文阅读顺序。全程本地完成，不调用真实 LLM。

```js
import { MockGPT, generators } from '@jangts/mock-gpt';

const summarize = generators.summary({ maxChars: 120 });

const mock = new MockGPT({
  rules: [{
    prompt: /需求/,
    generator: async context => `好的，我先帮您确认一下：${await summarize(context)}`,
  }],
});
```

```js
const reply = await mock.generate({
  model: 'demo',
  messages: [{
    role: 'user',
    content: '我们有个团建下午茶的需求：下周三下午三点前送到 8 楼会议室，30 人份。饮品要 10 杯无咖啡因、5 杯燕麦奶拿铁，其余美式就好；再配 30 份可颂和两盘水果。麻烦走对公账户，并开 13% 的增值税发票，抬头是「小可乐信息技术有限公司」。',
  }],
});
console.log(reply);
// 好的，我先帮您确认一下：……（抽取出的代表句，按原文顺序拼接）
```

`generators.summary()` 返回一个生成器函数，所以在规则里先创建、再在每次请求用同一个 `context` 求值；这样可以在前面或后面加固定文案。

## 摘要选项 `TextOptions`

| 字段 | 说明 | 默认 |
| --- | --- | --- |
| `maxChars` | 摘要最多输出码点数 | 240 |
| `count` | 参与选择的句子数 | 3 |
| `source` | 固定字符串或 `(context) => string \| Promise<string>`；默认取最后一条 `user` 消息文本 | 当前 prompt |

`source` 可以换成网页正文，把「摘要 + 网页」串在一起：

```js
import { generators } from '@jangts/mock-gpt';
import { sources } from '@jangts/mock-gpt/web';

const summarize = generators.summary({ source: sources.web() });
```

与 `sources.web()` 配合时，正文经过网页抽取后再交给摘要，完整选项见 [网页来源 sources](/zh/api/sources)。

## 同类输入生成器

除摘要外，`generators` 还有一组对输入文本做轻量处理的生成器，都无真实 LLM：

| 生成器 | 输出 |
| --- | --- |
| `generators.bullets()` | Markdown 要点 |
| `generators.keywords()` | JSON 关键词数组 |
| `generators.title()` | 单行标题（首句） |
| `generators.extract()` | 按字段正则抽取（邮箱、日期、金额等） |
| `generators.reply()` | 带主题的模板回答 |

用法与 `summary` 相同，说明见 [生成器 generators](/zh/api/generators)。

::: warning 摘要质量
摘要选句由算法决定，不属于能力保证；它让回复随输入变化，而不是让你断言「关键词一定准确」。测试里如果需要严格固定，请回到字符串或值生成器。
:::

至此，课程已覆盖固定应答、业务问答、结构化资料、工具提议、随机资料、流式接线与长文本摘要。完整字段约束见 [API 参考](/zh/api/)。