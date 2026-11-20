/**
 * 生成器示例注册表：把 SDK 文本工厂、组合生成器、responses 工厂与字面量统一
 * 包装成示例条目，并给出可复制表达式，供场景清单与代码面板共用。
 */
import {
  generators,
  responses,
  type Generator,
  type JsonValue,
  type TextOptions,
} from '@jangts/mock-gpt';
import { browserWebSource } from './browser-web-source.ts';
import {
  userProfiles,
  orders,
  recommendation,
  taskList,
  shortStory,
  chatReply,
  fallbackReply,
  weatherTool,
  pairedTools,
} from './composed-generators.ts';
import { imageMarkdown, tableMarkdown } from './markdown-generators.ts';

/** 示例依赖的本地源码模块名，用于把片段拼成可独立运行的示例。 */
export type ExampleModule = 'composed' | 'markdown' | 'web';
/** 一条示例：实际执行的生成器 + 代码面板展示所需信息。 */
export interface GeneratorExample {
  /** 注册进场景规则、真正参与生成的生成器（函数或字面量）。 */
  generator: Generator;
  /** 代码面板展示的表达式；函数形式在复制时按当前注册表重新求值。 */
  generatorCode: string | (() => string);
  /** 该示例引用的本地源码模块，缺省表示只依赖 SDK。 */
  modules?: readonly ExampleModule[];
  /** 需要从 @jangts/mock-gpt 额外导入的注册表名称。 */
  imports?: readonly ('generators' | 'responses')[];
}
/** 组合生成器注册表：示例名到生成器、示例源码模块的映射。 */
const handlers = {
  userProfiles: { generator: userProfiles, modules: ['composed'] },
  orders: { generator: orders, modules: ['composed'] },
  recommendation: { generator: recommendation, modules: ['composed'] },
  taskList: { generator: taskList, modules: ['composed'] },
  shortStory: { generator: shortStory, modules: ['composed'] },
  chatReply: { generator: chatReply, modules: ['composed'] },
  fallbackReply: { generator: fallbackReply, modules: ['composed'] },
  weatherTool: { generator: weatherTool, modules: ['composed'] },
  pairedTools: { generator: pairedTools, modules: ['composed'] },
  imageMarkdown: { generator: imageMarkdown, modules: ['composed', 'markdown'] },
  tableMarkdown: { generator: tableMarkdown, modules: ['composed', 'markdown'] },
} satisfies Record<string, { generator: Generator; modules: ExampleModule[] }>;
/** 异步来源示例使用的固定正文，复制代码时以字符串字面量写入。 */
const asyncArticle =
  '阅读区计划增加二十个座位。首轮先整理书架和照明。周末举行读书会，并根据反馈调整。';
/** 文本来源注册表：每个条目同时提供运行函数、可复制代码和依赖模块。 */
const textSources = {
  body: {
    read: ({ match, prompt }: Parameters<Exclude<TextOptions['source'], string | undefined>>[0]) =>
      match?.[1] ?? prompt,
    code: '({ match, prompt }) => match?.[1] ?? prompt',
    modules: [],
  },
  web: { read: browserWebSource, code: 'browserWebSource', modules: ['web'] },
  async: {
    read: async () => asyncArticle,
    code: `async () => ${JSON.stringify(asyncArticle)}`,
    modules: [],
  },
} satisfies Record<
  string,
  {
    read: Exclude<TextOptions['source'], string | undefined>;
    code: string;
    modules: ExampleModule[];
  }
>;
/** 文本工厂注册表：只收录会在示例中出现的 generators 文本能力。 */
const textFactories = {
  summary: generators.summary,
  bullets: generators.bullets,
  keywords: generators.keywords,
  title: generators.title,
  extract: generators.extract,
};

/** 工厂参数同时驱动执行与可复制表达式；不序列化任何闭包。 */
export function textExample(
  name: keyof typeof textFactories,
  options: Omit<TextOptions, 'source'> = {},
  source?: keyof typeof textSources,
): GeneratorExample {
  const selected = source ? textSources[source] : undefined;
  const fields = Object.entries(options).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  if (selected) fields.push(`source: ${selected.code}`);
  return {
    generator: textFactories[name]({ ...options, ...(selected ? { source: selected.read } : {}) }),
    generatorCode: `generators.${name}({ ${fields.join(', ')} })`,
    modules: selected?.modules,
    imports: ['generators'],
  };
}
/**
 * 取用组合生成器注册表中的示例，代码面板直接展示其注册名。
 * @param name 组合生成器在 handlers 注册表中的键。
 * @returns 生成器本体、模块依赖与源码名。
 */
export function handlerExample(name: keyof typeof handlers): GeneratorExample {
  return { ...handlers[name], generatorCode: name };
}
/**
 * 用 responses 工厂构造示例；同名参数会序列化进可复制代码。
 * @param name responses 中的工厂名。
 * @param args 传给该工厂的实参，顺序与工厂签名一致。
 * @returns 已绑定的生成器、调用表达式与所需导入。
 */
export function responseExample<K extends keyof typeof responses>(
  name: K,
  ...args: Parameters<(typeof responses)[K]>
): GeneratorExample {
  const factory = responses[name] as (...values: Parameters<(typeof responses)[K]>) => Generator;
  return {
    generator: factory(...args),
    generatorCode: `responses.${name}(${args.map((value) => JSON.stringify(value, null, 2)).join(', ')})`,
    imports: ['responses'],
  };
}
/**
 * 按固定顺序逐次输出给定文本，用于演示序列命中。
 * @param items 待输出的文本列表，顺序即命中顺序。
 * @returns 序列生成器及其调用表达式。
 */
export function sequenceExample(items: readonly string[]): GeneratorExample {
  return {
    generator: generators.sequence(items),
    generatorCode: `generators.sequence(${JSON.stringify(items, null, 2)})`,
    imports: ['generators'],
  };
}
/**
 * 包一层固定字面量，用于演示只按 `times` 等规则字段生效的场景。
 * @param value 任意可 JSON 序列化的输出值。
 * @returns 以该值作为生成器的示例。
 */
export function literalExample(value: JsonValue): GeneratorExample {
  return { generator: value, generatorCode: JSON.stringify(value) };
}
/**
 * 用固定分片参数一次性输出帮助文本；内容在复制代码时才读取，避免清单自引用。
 * @param read 返回帮助正文的函数，通常遍历场景清单。
 * @returns 文本响应的生成器与可复制表达式。
 */
export function helpExample(read: () => string): GeneratorExample {
  const options = { chunkSize: 300, intervalMs: 0 };
  return {
    generator: () => responses.text(read(), options),
    generatorCode: () => `responses.text(${JSON.stringify(read())}, ${JSON.stringify(options)})`,
    imports: ['responses'],
  };
}
