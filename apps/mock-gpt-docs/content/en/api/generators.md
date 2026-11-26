---
title: "Generators"
outline: [2, 3]
---

# Generators

Central exported generator namespace. `generatorNames` is a frozen array of available names driven by the same registry. Generators split into value generators and input-aware text generators.

## Contents

| Symbol | Kind | Description |
| --- | --- | --- |
| [`generators`](#api-generators) | constant | Namespace merging value generators and input-aware text generators. |
| [`generatorNames`](#api-generatornames) | constant | Frozen array of available generator names. |
| [`TextSource`](#api-textsource) | type alias | Text source: a fixed string or a function returning a string from context. |
| [`TextOptions`](#api-textoptions) | interface | Common options for input-aware text generators. |


## generators {#api-generators}

**Import:** `@jangts/mock-gpt`。

## Definition

**Namespace:** `generators`

## ## Member index

| Member | Purpose |
| --- | --- |
| [`summary`](#member-summary) | Extractive summary: picks representative sentences and concatenates them in original order. |
| [`bullets`](#member-bullets) | Markdown bullets. |
| [`keywords`](#member-keywords) | JSON keyword array. |
| [`title`](#member-title) | Single-line title. |
| [`reply`](#member-reply) | Template reply with a topic. |
| [`extract`](#member-extract) | Extracts by field mapping; returns declared defaults when no match. |
| [`integer`](#member-integer) | Random integer in range. |
| [`float`](#member-float) | Random float in range. |
| [`boolean`](#member-boolean) | Random boolean. |
| [`pick`](#member-pick) | Random pick from an array. |
| [`id`](#member-id) | `prefix-callIndex-random-suffix`. |
| [`date`](#member-date) | ISO time using the instance clock. |
| [`sentence`](#member-sentence) | Random sentence from built-in patterns. |
| [`imageUrl`](#member-imageurl) | Local SVG data-URL placeholder. |
| [`sequence`](#member-sequence) | Returns items by hit index for this rule; throws MOCK_SEQUENCE_EXHAUSTED when exhausted. |
| [`toolCall`](#member-toolcall) | Produces a single tool-call proposal. |

### summary {#member-summary}

Extractive summary, one paragraph, at most `maxChars` (default 240) characters.


```ts
generators.summary(options?: TextOptions): Generator
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `options` | `TextOptions` | Optional | — |

**Returns:** `Generator`


### bullets {#member-bullets}

Same selection as `summary`, rendered as `- ` bullet lines (default budget 500).


```ts
generators.bullets(options?: TextOptions): Generator
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `options` | `TextOptions` | Optional | — |

**Returns:** `Generator`


### keywords {#member-keywords}

Most frequent non-stopword terms, most frequent first.


```ts
generators.keywords(options?: TextOptions): Generator
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `options` | `TextOptions` | Optional | — |

**Returns:** `Generator`


### title {#member-title}

First sentence of the source with leading Markdown heading marks removed.


```ts
generators.title(options?: TextOptions): Generator
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `options` | `TextOptions` | Optional | — |

**Returns:** `Generator`


### reply {#member-reply}

Short conversational answer that echoes the topic.

Continuation prompts ("继续", "换个说法") reuse the previous user message so a demo
conversation stays coherent without a model.


```ts
generators.reply(options?: TextOptions & { template?: (input: { text: string; previous: string; }) => string; }): Generator
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `options` | `TextOptions & { template?: (input: { text: string; previous: string; }) => string; }` | Optional | — |

**Returns:** `Generator`


### extract {#member-extract}

Extract the first match of each configured pattern into a JSON object.

A capture group is preferred over the whole match, so `id:(\d+)` yields just the digits. A
field with no match is `null` rather than omitted, keeping the output shape stable.


```ts
generators.extract(options?: TextOptions & { fields?: Record<string, RegExp>; }): Generator
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `options` | `TextOptions & { fields?: Record<string, RegExp>; }` | Optional | — |

**Returns:** `Generator`


### integer {#member-integer}

Uniform integer in an inclusive range.


```ts
generators.integer(min?: number, max?: number): ValueGenerator<number>
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `min` | `number` | Optional | — |
| `max` | `number` | Optional | — |

**Returns:** `ValueGenerator<number>`


### float {#member-float}

Continuous value in `[min, max)`, or exactly `min` when both bounds are equal.


```ts
generators.float(min?: number, max?: number): ValueGenerator<number>
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `min` | `number` | Optional | — |
| `max` | `number` | Optional | — |

**Returns:** `ValueGenerator<number>`


### boolean {#member-boolean}

Fair coin derived from the call PRNG.


```ts
generators.boolean(): ValueGenerator<boolean>
```


No call parameters.

**Returns:** `ValueGenerator<boolean>`


### pick {#member-pick}

Uniform choice from a fixed pool.

The pool is copied at construction and each result is copied again, so a consumer mutating a
returned object cannot corrupt later selections.


```ts
generators.pick<T extends JsonValue>(items: readonly T[]): ValueGenerator<T>
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `items` | `readonly T[]` | Required | — |

**Returns:** `ValueGenerator<T>`


### id {#member-id}

Identifier that includes the call index plus a random suffix.

The suffix is 32 random bits rendered in hex; it is a fixture value, not a UUID and not
guaranteed unique or unguessable.


```ts
generators.id(prefix?: string): ValueGenerator<string>
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `prefix` | `string` | Optional | — |

**Returns:** `ValueGenerator<string>`


### date {#member-date}

ISO-8601 timestamp read from the injected clock.

With a fixed `clock` option the value is constant, which keeps snapshot-style tests stable.


```ts
generators.date(): ValueGenerator<string>
```


No call parameters.

**Returns:** `ValueGenerator<string>`


### sentence {#member-sentence}

One of three fixed Chinese sample sentences.

The sentences are placeholders that read naturally in demos; selection still consumes the
per-call PRNG so the value changes with the seed.


```ts
generators.sentence(): ValueGenerator<string>
```


No call parameters.

**Returns:** `ValueGenerator<string>`


### imageUrl {#member-imageurl}

Inline SVG data URL, so no network or filesystem access is needed.


```ts
generators.imageUrl({ width, height, }?: { width?: number; height?: number; }): ValueGenerator<string>
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `{     width = 320,     height = 180,   }` | `{ width?: number; height?: number; }` | Optional | — |

**Returns:** `ValueGenerator<string>`


### sequence {#member-sequence}

Play a fixed list one item per accepted call.

Selection is driven by `context.ruleIndex` (1-based), so it advances with the rule's own hit
count and is unaffected by other rules or by concurrent calls.


```ts
generators.sequence(items: readonly Generator[]): Generator
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `items` | `readonly Generator[]` | Required | — |

**Returns:** `Generator`


### toolCall {#member-toolcall}

Shorthand for a reply that only emits one tool call.


```ts
generators.toolCall(name: string, args: JsonValue, options?: OutputOptions): Generator
```


| Field | Type | Passing | Description |
| --- | --- | --- | --- |
| `name` | `string` | Required | — |
| `args` | `JsonValue` | Required | — |
| `options` | `OutputOptions` | Optional | — |

**Returns:** `Generator`


## generatorNames {#api-generatornames}

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
const generatorNames: readonly ("boolean" | "summary" | "bullets" | "keywords" | "title" | "reply" | "extract" | "integer" | "float" | "pick" | "id" | "date" | "sentence" | "imageUrl" | "sequence" | "toolCall")[]
```


## TextSource {#api-textsource}

Text supplied to a text generator.

A function may be async; it receives the per-call context so a source can depend on the prompt
or on the call index.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
type TextSource = string | ((context: GenerationContext) => string | Promise<string>);
```


## TextOptions {#api-textoptions}

Common options of the text generators.

**Import:** `@jangts/mock-gpt`。

## Definition

```ts
interface TextOptions
```

## Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `source` | `TextSource \| undefined` | Optional | Explicit text or async provider; defaults to the request prompt. |
| `maxChars` | `number \| undefined` | Optional | Maximum characters in the returned text (1-30 000); generator-specific default. |
| `count` | `number \| undefined` | Optional | How many items to select (1-100), e.g. bullets, keywords or summary sentences. |

## ## Examples
Value generators must be created inside the rule and evaluated with the same `context` on each request:

```js
import { MockGPT, generators, generatorNames } from '@jangts/mock-gpt';
const orderId = generators.id('order');
const mock = new MockGPT({
  seed: 42,
  rules: [{ prompt: /order/, generator: context => ({ orderId: orderId(context) }) }],
});
console.log(generatorNames);
```

Input-aware text generators are used directly as rule generators. They use no real LLM and work on the instance-projected `prompt` text by default; all accept an optional `source`:

```js
const mock = new MockGPT({
  rules: [
    { prompt: /summarize/, generator: generators.summary({ maxChars: 120 }) },
    { prompt: /bullets/, generator: generators.bullets({ count: 3 }) },
    { prompt: /keywords/, generator: generators.keywords({ count: 5 }) },
    { prompt: /title/, generator: generators.title() },
    { prompt: /extract/, generator: generators.extract({ fields: { email: /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i } }) },
    { prompt: /continue/, generator: generators.reply() },
  ],
});
```

Summary and bullets use a TextRank-style sentence graph and MMR-style redundancy control, select sentences within a length budget and restore the original reading order. Up to 30,000 code points are analyzed.
