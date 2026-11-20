/**
 * Text-analysis generators: summary, bullets, keywords, title, reply and extract.
 *
 * They derive their input from the request prompt (or an explicit `source`) and never call a
 * model, so their output is deterministic for a given input and configuration. Analysis is
 * bounded to 30 000 characters: long sources are either truncated from the end or, for
 * summary/bullets, sampled from head, middle and tail, and the choice is reported through
 * `context.report` so a test can tell which path ran.
 */
import type { GenerationContext, Generator, JsonValue } from '../types.js';
import { MockGPTError, chars, integer, breakWhile } from '../shared/utils.js';
import { messageText } from '../runtime/chat-completions.js';

/**
 * Text supplied to a text generator.
 *
 * A function may be async; it receives the per-call context so a source can depend on the prompt
 * or on the call index.
 */
export type TextSource = string | ((context: GenerationContext) => string | Promise<string>);

/** Common options of the text generators. */
export interface TextOptions {
  /** Explicit text or async provider; defaults to the request prompt. */
  source?: TextSource;
  /** Maximum characters in the returned text (1-30 000); generator-specific default. */
  maxChars?: number;
  /** How many items to select (1-100), e.g. bullets, keywords or summary sentences. */
  count?: number;
}
import { words, sentences, sampleText } from './text-analysis.js';
import { summarize } from './summarize.js';
import { charLength } from '../shared/text.js';

/**
 * Resolve and bound the text a generator analyses.
 *
 * @param context Per-call context supplying the default prompt.
 * @param options Generator options; `source` may be a literal string or an async provider.
 * @param wholeText When true, sample head/middle/tail instead of keeping a prefix.
 * @returns At most 30 000 characters of source text.
 * @throws MockGPTError `MOCK_SOURCE` when the provider returns a non-string.
 * @throws The abort reason when the call is cancelled.
 */
async function source(
  context: GenerationContext,
  options: TextOptions,
  wholeText = false,
): Promise<string> {
  const value =
    typeof options.source === 'function'
      ? await options.source(context)
      : (options.source ?? context.prompt);
  context.signal.throwIfAborted();
  breakWhile(
    !(typeof value === 'string'),
    () => new MockGPTError('MOCK_SOURCE', 'Text source must return a string'),
  );
  if (wholeText) {
    const sampled = sampleText(value, 30_000);
    if (sampled.sampled)
      context.report({
        sourceTruncated: true,
        analyzedChars: charLength(sampled.text),
        analysisSampling: 'head-middle-tail',
      });
    return sampled.text;
  }
  if (charLength(value, 30_000) > 30_000)
    context.report({ sourceTruncated: true, analyzedChars: 30_000 });
  return chars(value, 30_000);
}

/**
 * Build a generator around a synchronous transform of the resolved source.
 *
 * Options are copied at construction, so mutating the caller's object afterwards cannot change an
 * already-created generator.
 *
 * @param options Source, count and length options.
 * @param defaultLimit Default `maxChars` when the caller does not set one.
 * @param transform Pure transform producing text or JSON from the source.
 * @param wholeText Whether long sources should be sampled instead of truncated.
 * @returns An async generator that resolves the source, transforms it and enforces `maxChars`.
 * @throws MockGPTError `MOCK_CONFIG` when `maxChars` or `count` is out of range.
 */
function textGenerator(
  options: TextOptions,
  defaultLimit: number,
  transform: (
    text: string,
    context: GenerationContext,
    count: number,
    maxChars: number,
  ) => JsonValue,
  wholeText = false,
): Generator {
  const configuration = { ...options };
  const max = integer(options.maxChars ?? defaultLimit, 'maxChars', 1, 30_000);
  const count = integer(options.count ?? 3, 'count', 1, 100);
  return async (context) => {
    const result = transform(await source(context, configuration, wholeText), context, count, max);
    // JSON results are already bounded by the transform; only text needs a final truncation.
    return typeof result === 'string' ? chars(result, max) : result;
  };
}

/**
 * Summary/bullets shared implementation; both sample the whole document.
 *
 * @param options Source and length options.
 * @param bullets Use bullet formatting and the larger default budget.
 * @returns A generator producing the summary text.
 */
function summaryGenerator(options: TextOptions, bullets: boolean): Generator {
  return textGenerator(
    options,
    bullets ? 500 : 240,
    (text, context, count, maxChars) => {
      const result = summarize(text, count, maxChars, bullets);
      // Report the method and selection so tests can assert the algorithm path, not just its text.
      context.report({
        summaryMethod: 'textrank-mmr',
        summaryCandidates: result.candidates,
        summarySelectedIndexes: result.selectedIndexes,
      });
      return result.text;
    },
    true,
  );
}

/**
 * Registry of text generators; merged into `generators` by `./index.ts`.
 *
 * Each member is a factory so configuration and defaults are bound once per rule.
 */
export const textGenerators = {
  /**
   * Extractive summary, one paragraph, at most `maxChars` (default 240) characters.
   *
   * @param options Source, sentence count and length options.
   * @returns A generator producing the summary text.
   */
  summary: (options: TextOptions = {}): Generator => summaryGenerator(options, false),
  /**
   * Same selection as `summary`, rendered as `- ` bullet lines (default budget 500).
   *
   * @param options Source, bullet count and length options.
   * @returns A generator producing the bullet list.
   */
  bullets: (options: TextOptions = {}): Generator => summaryGenerator(options, true),
  /**
   * Most frequent non-stopword terms, most frequent first.
   *
   * @param options Source and `count` (default 3) options; `maxChars` bounds the JSON payload.
   * @returns A generator producing an array of terms.
   */
  keywords: (options: TextOptions = {}): Generator =>
    textGenerator(options, 1000, (text, _, count) => {
      const freq = new Map<string, number>();
      for (const word of words(text)) freq.set(word, (freq.get(word) ?? 0) + 1);
      // Ties keep first-seen order, which keeps the output deterministic.
      return [...freq]
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(([word]) => word);
    }),
  /**
   * First sentence of the source with leading Markdown heading marks removed.
   *
   * @param options Source and length (default 24) options.
   * @returns A generator producing the title text.
   */
  title: (options: TextOptions = {}): Generator =>
    textGenerator(options, 24, (text) => (sentences(text)[0] ?? '').replace(/^#+\s*/, '')),
  /**
   * Short conversational answer that echoes the topic.
   *
   * Continuation prompts ("继续", "换个说法") reuse the previous user message so a demo
   * conversation stays coherent without a model.
   *
   * @param options Source, length (default 500) and optional `template` override.
   * @returns A generator producing the reply text.
   */
  reply: (
    options: TextOptions & {
      template?: (input: { text: string; previous: string }) => string;
    } = {},
  ): Generator => {
    const template = options.template;
    return textGenerator(options, 500, (text, context) => {
      // The last user message is the current turn, so the previous topic is the one before it.
      const previous = messageText(
        context.request.messages.filter((message) => message.role === 'user').at(-2)?.content,
      );
      if (template) return template({ text, previous });
      const topic = /^(继续|换个说法)[。！!\s]*$/.test(text) && previous ? previous : text;
      return topic.trim()
        ? `关于“${chars(topic, 80)}”，可以先明确目标，再分步骤尝试，并根据结果调整。`
        : '你好，可以告诉我你想了解的内容。';
    });
  },
  /**
   * Extract the first match of each configured pattern into a JSON object.
   *
   * A capture group is preferred over the whole match, so `id:(\d+)` yields just the digits. A
   * field with no match is `null` rather than omitted, keeping the output shape stable.
   *
   * @param options Source and `fields` map of name to pattern; unmatched fields yield null.
   * @returns A generator producing an object keyed by field name.
   * @throws MockGPTError `MOCK_CONFIG` when a field value is not a RegExp.
   */
  extract: (options: TextOptions & { fields?: Record<string, RegExp> } = {}): Generator => {
    const fields = Object.entries(
      options.fields ?? {
        email: /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i,
        date: /\d{4}[-年/]\d{1,2}[-月/]\d{1,2}日?/,
        amount: /[¥￥$]\s*\d+(?:\.\d+)?/,
      },
    ).map(([name, pattern]) => {
      breakWhile(
        !(pattern instanceof RegExp),
        () => new MockGPTError('MOCK_CONFIG', 'Extraction fields must be RegExp'),
      );
      // Clone the pattern so a caller-supplied global/sticky flag cannot leak state between calls.
      return [name, new RegExp(pattern.source, pattern.flags)] as const;
    });
    return textGenerator(options, 1000, (text) =>
      Object.fromEntries(
        fields.map(([name, pattern]) => {
          pattern.lastIndex = 0;
          const match = pattern.exec(text);
          return [name, match ? (match[1] ?? match[0]) : null];
        }),
      ),
    );
  },
};
