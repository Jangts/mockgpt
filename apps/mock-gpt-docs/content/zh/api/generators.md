---
title: "生成器 generators"
outline: [2, 3]
---

# 生成器 generators

集中导出的生成器命名空间；`generatorNames` 是可用名称的冻结数组，由同一份登记直接驱动。生成器分两类：值生成器与输入相关文本生成器。

## Contents

| 符号 | 类别 | 说明 |
| --- | --- | --- |
| [`generators`](#api-generators) | 常量 | Namespace merging value generators and input-aware text generators. |
| [`generatorNames`](#api-generatornames) | 常量 | Frozen array of available generator names. |
| [`TextSource`](#api-textsource) | 类型别名 | Text source: a fixed string or a function returning a string from context. |
| [`TextOptions`](#api-textoptions) | 接口 | Common options for input-aware text generators. |


## generators {#api-generators}

**导入：** `@jangts/mock-gpt`。

## 定义

**Namespace:** `generators`

## ## 成员目录

| 成员 | 用途 |
| --- | --- |
| [`summary`](#member-summary) | 抽取式摘要，选代表句后按原文顺序拼接。 |
| [`bullets`](#member-bullets) | Markdown 要点。 |
| [`keywords`](#member-keywords) | JSON 关键词数组。 |
| [`title`](#member-title) | 单行标题。 |
| [`reply`](#member-reply) | 带主题的模板回答。 |
| [`extract`](#member-extract) | 按字段映射提取，未命中按声明返回。 |
| [`integer`](#member-integer) | 范围内随机整数。 |
| [`float`](#member-float) | 范围内随机浮点。 |
| [`boolean`](#member-boolean) | 随机布尔值。 |
| [`pick`](#member-pick) | 从数组随机选一个。 |
| [`id`](#member-id) | `prefix-callIndex-随机后缀`。 |
| [`date`](#member-date) | 使用实例 clock 的 ISO 时间。 |
| [`sentence`](#member-sentence) | 从内置句式随机选一句。 |
| [`imageUrl`](#member-imageurl) | 本地 SVG data URL 占位图。 |
| [`sequence`](#member-sequence) | 按本规则命中序号逐项返回，耗尽报 MOCK_SEQUENCE_EXHAUSTED。 |
| [`toolCall`](#member-toolcall) | 产生单个工具调用提议。 |

### summary {#member-summary}

Extractive summary, one paragraph, at most `maxChars` (default 240) characters.


```ts
generators.summary(options?: TextOptions): Generator
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `options` | `TextOptions` | 可省略 | — |

**返回：** `Generator`


### bullets {#member-bullets}

Same selection as `summary`, rendered as `- ` bullet lines (default budget 500).


```ts
generators.bullets(options?: TextOptions): Generator
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `options` | `TextOptions` | 可省略 | — |

**返回：** `Generator`


### keywords {#member-keywords}

Most frequent non-stopword terms, most frequent first.


```ts
generators.keywords(options?: TextOptions): Generator
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `options` | `TextOptions` | 可省略 | — |

**返回：** `Generator`


### title {#member-title}

First sentence of the source with leading Markdown heading marks removed.


```ts
generators.title(options?: TextOptions): Generator
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `options` | `TextOptions` | 可省略 | — |

**返回：** `Generator`


### reply {#member-reply}

Short conversational answer that echoes the topic.

Continuation prompts ("继续", "换个说法") reuse the previous user message so a demo
conversation stays coherent without a model.


```ts
generators.reply(options?: TextOptions & { template?: (input: { text: string; previous: string; }) => string; }): Generator
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `options` | `TextOptions & { template?: (input: { text: string; previous: string; }) => string; }` | 可省略 | — |

**返回：** `Generator`


### extract {#member-extract}

Extract the first match of each configured pattern into a JSON object.

A capture group is preferred over the whole match, so `id:(\d+)` yields just the digits. A
field with no match is `null` rather than omitted, keeping the output shape stable.


```ts
generators.extract(options?: TextOptions & { fields?: Record<string, RegExp>; }): Generator
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `options` | `TextOptions & { fields?: Record<string, RegExp>; }` | 可省略 | — |

**返回：** `Generator`


### integer {#member-integer}

Uniform integer in an inclusive range.


```ts
generators.integer(min?: number, max?: number): ValueGenerator<number>
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `min` | `number` | 可省略 | — |
| `max` | `number` | 可省略 | — |

**返回：** `ValueGenerator<number>`


### float {#member-float}

Continuous value in `[min, max)`, or exactly `min` when both bounds are equal.


```ts
generators.float(min?: number, max?: number): ValueGenerator<number>
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `min` | `number` | 可省略 | — |
| `max` | `number` | 可省略 | — |

**返回：** `ValueGenerator<number>`


### boolean {#member-boolean}

Fair coin derived from the call PRNG.


```ts
generators.boolean(): ValueGenerator<boolean>
```


无调用参数。

**返回：** `ValueGenerator<boolean>`


### pick {#member-pick}

Uniform choice from a fixed pool.

The pool is copied at construction and each result is copied again, so a consumer mutating a
returned object cannot corrupt later selections.


```ts
generators.pick<T extends JsonValue>(items: readonly T[]): ValueGenerator<T>
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `items` | `readonly T[]` | 必需 | — |

**返回：** `ValueGenerator<T>`


### id {#member-id}

Identifier that includes the call index plus a random suffix.

The suffix is 32 random bits rendered in hex; it is a fixture value, not a UUID and not
guaranteed unique or unguessable.


```ts
generators.id(prefix?: string): ValueGenerator<string>
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `prefix` | `string` | 可省略 | — |

**返回：** `ValueGenerator<string>`


### date {#member-date}

ISO-8601 timestamp read from the injected clock.

With a fixed `clock` option the value is constant, which keeps snapshot-style tests stable.


```ts
generators.date(): ValueGenerator<string>
```


无调用参数。

**返回：** `ValueGenerator<string>`


### sentence {#member-sentence}

One of three fixed Chinese sample sentences.

The sentences are placeholders that read naturally in demos; selection still consumes the
per-call PRNG so the value changes with the seed.


```ts
generators.sentence(): ValueGenerator<string>
```


无调用参数。

**返回：** `ValueGenerator<string>`


### imageUrl {#member-imageurl}

Inline SVG data URL, so no network or filesystem access is needed.


```ts
generators.imageUrl({ width, height, }?: { width?: number; height?: number; }): ValueGenerator<string>
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `{     width = 320,     height = 180,   }` | `{ width?: number; height?: number; }` | 可省略 | — |

**返回：** `ValueGenerator<string>`


### sequence {#member-sequence}

Play a fixed list one item per accepted call.

Selection is driven by `context.ruleIndex` (1-based), so it advances with the rule's own hit
count and is unaffected by other rules or by concurrent calls.


```ts
generators.sequence(items: readonly Generator[]): Generator
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `items` | `readonly Generator[]` | 必需 | — |

**返回：** `Generator`


### toolCall {#member-toolcall}

Shorthand for a reply that only emits one tool call.


```ts
generators.toolCall(name: string, args: JsonValue, options?: OutputOptions): Generator
```


| 字段 | 类型 | Passing | 说明 |
| --- | --- | --- | --- |
| `name` | `string` | 必需 | — |
| `args` | `JsonValue` | 必需 | — |
| `options` | `OutputOptions` | 可省略 | — |

**返回：** `Generator`


## generatorNames {#api-generatornames}

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
const generatorNames: readonly ("boolean" | "summary" | "bullets" | "keywords" | "title" | "reply" | "extract" | "integer" | "float" | "pick" | "id" | "date" | "sentence" | "imageUrl" | "sequence" | "toolCall")[]
```


## TextSource {#api-textsource}

Text supplied to a text generator.

A function may be async; it receives the per-call context so a source can depend on the prompt
or on the call index.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
type TextSource = string | ((context: GenerationContext) => string | Promise<string>);
```


## TextOptions {#api-textoptions}

Common options of the text generators.

**导入：** `@jangts/mock-gpt`。

## 定义

```ts
interface TextOptions
```

## Fields

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `source` | `TextSource \| undefined` | 可省略 | Explicit text or async provider; defaults to the request prompt. |
| `maxChars` | `number \| undefined` | 可省略 | Maximum characters in the returned text (1-30 000); generator-specific default. |
| `count` | `number \| undefined` | 可省略 | How many items to select (1-100), e.g. bullets, keywords or summary sentences. |

## ## 使用示例
值生成器需在规则里先创建，再在每次请求用同一个 `context` 求值：

```js
import { MockGPT, generators, generatorNames } from '@jangts/mock-gpt';
const orderId = generators.id('order');
const mock = new MockGPT({
  seed: 42,
  rules: [{ prompt: /下单/, generator: context => ({ orderId: orderId(context) }) }],
});
console.log(generatorNames);
```

输入相关文本生成器直接作为规则 generator，无真实 LLM，默认处理实例已投影的 `prompt` 文本，统一接受可选 `source`：

```js
const mock = new MockGPT({
  rules: [
    { prompt: /总结/, generator: generators.summary({ maxChars: 120 }) },
    { prompt: /要点/, generator: generators.bullets({ count: 3 }) },
    { prompt: /关键词/, generator: generators.keywords({ count: 5 }) },
    { prompt: /标题/, generator: generators.title() },
    { prompt: /提取/, generator: generators.extract({ fields: { email: /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i } }) },
    { prompt: /继续/, generator: generators.reply() },
  ],
});
```

摘要与要点采用 TextRank 风格的句子图排序、MMR 风格的重复控制，在长度预算内选定句子后恢复阅读顺序；最多分析 30,000 码点。
