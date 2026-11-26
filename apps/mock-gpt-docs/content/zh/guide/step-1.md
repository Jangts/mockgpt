# 第 1 步 · 最小应答

先让客服能对「你好」回一句欢迎语，理解 `MockGPT` 的两个基本概念：**规则**和**生成器**。

规则声明「什么输入匹配」，生成器决定「匹配后返回什么」。固定字符串是最简单的一种生成器。

```js
import { MockGPT } from '@jangts/mock-gpt';

const mock = new MockGPT({
  rules: [
    { prompt: '你好', generator: '你好，欢迎光临小可乐咖啡，请问有什么可以帮你？' },
  ],
});

const reply = await mock.generate({
  model: 'demo',
  messages: [{ role: 'user', content: '你好' }],
});
console.log(reply);
// 你好，欢迎光临小可乐咖啡，请问有什么可以帮你？
```

## 发生了什么

1. `new MockGPT(options)` 校验并冻结规则，把配置保存成快照；
2. `generate(input)` 读取最后一条 `user` 消息的文本，得到要匹配的 `prompt`；
3. 规则按声明顺序匹配：`prompt: '你好'` 是字符串精确匹配；
4. 命中后执行 `generator`，固定字符串原样作为回复内容返回。

`generate()` 返回字符串、原生 JSON 值，或显式的响应描述，不执行延迟、切片或 HTTP 错误。返回值是独立冻结快照。

## 一次未命中的请求

如果没有规则匹配，`generate()` 会抛出 `MockGPTError`，错误码为 `MOCK_RULE_NOT_FOUND`，而不是去连接真实模型：

```js
await mock.generate({ model: 'demo', messages: [{ role: 'user', content: '请问营业时间？' }] });
// Uncaught MockGPTError: No MockGPT rule matched this request (code: MOCK_RULE_NOT_FOUND)
```

下一课我们给客服加上业务问答规则，让它能回答营业时间、地址等常见问题。

::: tip 提示
输入里的 `model` 与 `messages` 是标准模型请求字段，规则匹配时也会读取 `model`；附加条件字段可随请求传入，供更复杂的谓词使用。
:::