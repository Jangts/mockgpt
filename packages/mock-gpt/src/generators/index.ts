/**
 * Deterministic value generators.
 *
 * Every entry returns a `Generator` closure that reads only the per-call `GenerationContext`, so
 * the same seed and the same accepted-call order always produce the same values. `generators` is
 * the single executable registry behind both the public export and `generatorNames`; the
 * text-analysis family is merged in from `./text.ts` so the capability inventory cannot drift
 * from the implementation.
 */
import type { GenerationContext, Generator, JsonValue, OutputOptions } from '../types.js';
import { ResponseDescription } from '../types.js';
import { MockGPTError, chars, cloneJson, integer, breakWhile } from '../shared/utils.js';
import { responses } from '../runtime/responses.js';
import { textGenerators } from './text.js';

/** A generator that produces a JSON value from the per-call context. */
type ValueGenerator<T extends JsonValue> = (context: GenerationContext) => T;

const base = {
  /**
   * Uniform integer in an inclusive range.
   *
   * @param min Inclusive lower bound; default 0.
   * @param max Inclusive upper bound; default 100.
   * @returns Generator producing an integer in `[min, max]`.
   * @throws MockGPTError `MOCK_CONFIG` when `max < min` or the span is not smaller than
   * `Number.MAX_SAFE_INTEGER`.
   */
  integer: (min = 0, max = 100): ValueGenerator<number> => {
    integer(min, 'min', -Number.MAX_SAFE_INTEGER);
    integer(max, 'max', min);
    breakWhile(
      !(max - min < Number.MAX_SAFE_INTEGER),
      () => new MockGPTError('MOCK_CONFIG', 'Integer range too wide'),
    );
    return (context) => Math.floor(context.random() * (max - min + 1)) + min;
  },
  /**
   * Continuous value in `[min, max)`, or exactly `min` when both bounds are equal.
   *
   * @param min Lower bound; default 0.
   * @param max Upper bound; default 1.
   * @returns Generator producing a float.
   * @throws MockGPTError `MOCK_CONFIG` when a bound is not finite or `max < min`.
   */
  float: (min = 0, max = 1): ValueGenerator<number> => {
    breakWhile(
      !(Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(max - min) && max >= min),
      () => new MockGPTError('MOCK_CONFIG', 'Invalid float range'),
    );
    return (context) => context.random() * (max - min) + min;
  },
  /**
   * Fair coin derived from the call PRNG.
   *
   * @returns Generator producing `true` or `false`.
   */
  boolean: (): ValueGenerator<boolean> => (context) => context.random() >= 0.5,
  /**
   * Uniform choice from a fixed pool.
   *
   * The pool is copied at construction and each result is copied again, so a consumer mutating a
   * returned object cannot corrupt later selections.
   *
   * @param items Non-empty pool of JSON values.
   * @returns Generator producing one element of the pool.
   * @throws MockGPTError `MOCK_CONFIG` when the pool is empty.
   */
  pick: <T extends JsonValue>(items: readonly T[]): ValueGenerator<T> => {
    breakWhile(!items.length, () => new MockGPTError('MOCK_CONFIG', 'pick requires values'));
    const values = cloneJson(items);
    return (context) => cloneJson(values[Math.floor(context.random() * values.length)]);
  },
  /**
   * Identifier that includes the call index plus a random suffix.
   *
   * The suffix is 32 random bits rendered in hex; it is a fixture value, not a UUID and not
   * guaranteed unique or unguessable.
   *
   * @param prefix Literal prefix; default `mock`.
   * @returns Generator producing `<prefix>-<callIndex>-<hex>`.
   */
  id:
    (prefix = 'mock'): ValueGenerator<string> =>
    (context) =>
      `${prefix}-${context.callIndex}-${Math.floor(context.random() * 0xffffffff).toString(16)}`,
  /**
   * ISO-8601 timestamp read from the injected clock.
   *
   * With a fixed `clock` option the value is constant, which keeps snapshot-style tests stable.
   *
   * @returns Generator producing the current clock time as an ISO string.
   */
  date: (): ValueGenerator<string> => (context) => new Date(context.clock()).toISOString(),
  /**
   * One of three fixed Chinese sample sentences.
   *
   * The sentences are placeholders that read naturally in demos; selection still consumes the
   * per-call PRNG so the value changes with the seed.
   *
   * @returns Generator producing a sample sentence.
   */
  sentence: (): ValueGenerator<string> => (context) =>
    [
      '今天适合探索一个新的想法。',
      '把复杂的问题拆成几个清晰的步骤。',
      '先做一个简单的尝试，再观察结果。',
    ][Math.floor(context.random() * 3)],
  /**
   * Inline SVG data URL, so no network or filesystem access is needed.
   *
   * @param size.width Canvas width in pixels, 1-4096; default 320.
   * @param size.height Canvas height in pixels, 1-4096; default 180.
   * @returns Generator producing a `data:image/svg+xml` URL with a gray placeholder.
   * @throws MockGPTError `MOCK_CONFIG` when a dimension is out of range.
   */
  imageUrl: ({
    width = 320,
    height = 180,
  }: { width?: number; height?: number } = {}): ValueGenerator<string> => {
    integer(width, 'width', 1, 4096);
    integer(height, 'height', 1, 4096);
    return () =>
      'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ddd"/><text x="20" y="40">MockGPT ${width} x ${height}</text></svg>`,
      );
  },
  /**
   * Play a fixed list one item per accepted call.
   *
   * Selection is driven by `context.ruleIndex` (1-based), so it advances with the rule's own hit
   * count and is unaffected by other rules or by concurrent calls.
   *
   * @param items Non-empty list of values, descriptors or generators.
   * @returns Generator returning the next item, evaluating it when it is a function.
   * @throws MockGPTError `MOCK_CONFIG` when the list is empty.
   * @throws MockGPTError `MOCK_SEQUENCE_EXHAUSTED` when the list runs out.
   */
  sequence: (items: readonly Generator[]): Generator => {
    breakWhile(!items.length, () => new MockGPTError('MOCK_CONFIG', 'sequence requires values'));
    const values = items.map((item) =>
      typeof item === 'function'
        ? item
        : item instanceof ResponseDescription
          ? new ResponseDescription(item.kind, cloneJson(item.value))
          : cloneJson(item),
    );
    return (context) => {
      breakWhile(
        !(context.ruleIndex <= values.length),
        () => new MockGPTError('MOCK_SEQUENCE_EXHAUSTED', 'Mock sequence exhausted'),
      );
      const item = values[context.ruleIndex - 1];
      return typeof item === 'function' ? item(context) : item;
    };
  },
  /**
   * Shorthand for a reply that only emits one tool call.
   *
   * @param name Function name to call.
   * @param args Arguments object serialized into the tool call.
   * @param options Framing and timing overrides for the reply.
   * @returns A `model` descriptor with `finishReason` defaulting to `tool_calls`.
   */
  toolCall: (name: string, args: JsonValue, options: OutputOptions = {}): Generator =>
    responses.toolCalls([{ name, arguments: args }], options),
};

/** One executable registry drives exports and the public capability inventory. */
export const generators = Object.freeze({ ...base, ...textGenerators });

/** Names of every registry entry, in registration order. */
export const generatorNames = Object.freeze(Object.keys(generators) as (keyof typeof generators)[]);
