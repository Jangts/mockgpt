/**
 * Security and resource-limit properties of the shared helpers and runtime.
 *
 * Covers single-read JSON snapshots (no getters/toJSON hooks), prototype-pollution-safe copying,
 * complexity/byte/character limits, ring-buffer ordering under out-of-order completion, and
 * code-point-safe slicing. Runs against the built output in `dist/`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MockGPT, generators, responses, encodeModelResponse } from '../dist/esm/index.js';
import { cloneJson, jsonText } from '../dist/esm/shared/utils.js';
import { chars, charLength, textChunks } from '../dist/esm/shared/text.js';
import { sampleText, words } from '../dist/esm/generators/text-analysis.js';

const input = { model: 'demo', messages: [{ role: 'user', content: 'hello' }], stream: false };
test('JSON snapshots never re-read getters or invoke hidden serialization hooks', async () => {
  for (const encode of [cloneJson, jsonText]) {
    let reads = 0,
      hooks = 0;
    const value = {
      get content() {
        reads++;
        return reads === 1 ? 'validated' : 1n;
      },
    };
    Object.defineProperty(value, 'toJSON', {
      value() {
        hooks++;
        throw new Error('hidden hook');
      },
    });
    const result = encode(value);
    assert.deepEqual(typeof result === 'string' ? JSON.parse(result) : result, {
      content: 'validated',
    });
    assert.equal(reads, 1);
    assert.equal(hooks, 0);
  }
  let reads = 0;
  const mock = new MockGPT({
    rules: [
      {
        generator: () => ({
          get value() {
            return ++reads === 1 ? 7 : undefined;
          },
        }),
      },
    ],
  });
  assert.deepEqual(await mock.generate(input), { value: 7 });
  assert.equal(reads, 1);
});

test('JSON limits reject deep, cyclic, wide and sparse data without polluting prototypes', async () => {
  let deep = {};
  for (let i = 0; i < 65; i++) deep = { nested: deep };
  const cycle = {};
  cycle.self = cycle;
  for (const value of [
    deep,
    cycle,
    Array(100_001).fill(0),
    Array(2),
    { value: NaN },
    new Date(),
    { value: () => {} },
  ]) {
    assert.throws(() => cloneJson(value), { code: 'MOCK_GENERATION' });
    await assert.rejects(new MockGPT({ rules: [{ generator: () => value }] }).generate(input), {
      code: 'MOCK_GENERATION',
    });
  }
  const mock = new MockGPT({ rules: [{ generator: 'ok' }] });
  await assert.rejects(mock.generate({ ...input, deep }), { code: 'MOCK_REQUEST' });
  const response = await mock.fetch('http://mock/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ ...input, deep }),
  });
  assert.equal(response.status, 400);
  assert.equal(mock.activeRequests, 0);
  assert.deepEqual(mock.records, []);
  // Parsed JSON creates an own `__proto__` data property; the copy must keep it as data and must
  // not modify any prototype.
  const data = JSON.parse(
    '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}',
  );
  const copy = cloneJson(data);
  assert.deepEqual(copy, data);
  assert.ok(Object.hasOwn(copy, '__proto__'));
  assert.equal(Object.getPrototypeOf(copy), Object.prototype);
  assert.equal({}.polluted, undefined);
  const alias = { value: 1 };
  assert.deepEqual(cloneJson([alias, alias]), [{ value: 1 }, { value: 1 }]);
  assert.equal(Object.is(cloneJson(-0), 0), true);
});

test('Unicode slicing, counting and deterministic sampling preserve code points at every boundary', () => {
  const strings = ['', 'plain', '中🙂\uD800x\uDC00🚀尾', '🙂中x'.repeat(1000)];
  for (const text of strings) {
    const points = Array.from(text);
    assert.equal(charLength(text), points.length);
    for (const limit of [0, 1, 2, 3, 5, 6, 7, 11, points.length, points.length + 1]) {
      assert.equal(chars(text, limit), points.slice(0, limit).join(''));
      assert.equal(charLength(text, limit), Math.min(points.length, limit + 1));
      const sampled = sampleText(text, limit);
      let expected = text;
      if (points.length > limit) {
        const portion = Math.floor((limit - 2) / 3),
          middle = Math.floor((points.length - portion) / 2);
        expected =
          limit < 6
            ? points.slice(0, limit).join('')
            : [
                points.slice(0, portion),
                points.slice(middle, middle + portion),
                points.slice(-(limit - 2 - portion * 2)),
              ]
                .map((part) => part.join(''))
                .join('\n');
      }
      assert.deepEqual(sampled, {
        text: expected,
        total: points.length,
        sampled: points.length > limit,
      });
    }
    for (const size of [1, 2, 24, 10000]) {
      const chunks = [...textChunks(text, size)];
      assert.equal(chunks.join(''), text);
      assert.ok(chunks.every((chunk) => Array.from(chunk).length <= size));
    }
  }
  assert.deepEqual(words('the CAT and dog'), ['cat', 'dog']);
});

test('record ring retains chronological snapshots when pending calls are overwritten and completed out of order', async () => {
  let release;
  const mock = new MockGPT({
    recordLimit: 2,
    rules: [
      {
        generator: ({ callIndex }) =>
          callIndex === 1
            ? new Promise((resolve) => {
                release = resolve;
              })
            : callIndex,
      },
    ],
  });
  const first = mock.generate(input);
  await Promise.resolve();
  for (let i = 2; i <= 6; i++) await mock.generate(input);
  assert.deepEqual(
    mock.records.map((record) => record.index),
    [5, 6],
  );
  release('late');
  await first;
  assert.deepEqual(
    mock.records.map((record) => record.index),
    [5, 6],
  );
  const records = mock.records;
  records[0].metadata.changed = true;
  assert.deepEqual(mock.records[0].metadata, {});
  mock.reset();
  assert.deepEqual(mock.records, []);
  assert.equal(mock.counts['rule-1'], 0);
});

test('reused global and sticky patterns remain isolated from caller state', async () => {
  for (const pattern of [/hello/g, /hello/y]) {
    pattern.lastIndex = 99;
    const mock = new MockGPT({
      rules: [
        {
          prompt: pattern,
          generator: generators.extract({ source: 'id:42', fields: { id: /id:(\d+)/g } }),
        },
      ],
    });
    for (let i = 0; i < 3; i++) assert.deepEqual(await mock.generate(input), { id: '42' });
    assert.equal(pattern.lastIndex, 99);
  }
});

test('standalone codec validates budgets and identity and snapshots tool arguments', async () => {
  const signal = new AbortController().signal,
    encode = (output, id = 'id', created = 0) =>
      encodeModelResponse(input, output, id, created, signal, () => {});
  for (const output of [
    { chunkSize: 0 },
    { wireChunkSize: 0 },
    { intervalMs: -1 },
    { tools: [{ name: 'x' }] },
  ])
    assert.throws(() => encode(output), { code: 'MOCK_CONFIG' });
  assert.throws(() => encode({}, '', 0), { code: 'MOCK_CONFIG' });
  assert.throws(() => encode({}, 'id', -1), { code: 'MOCK_CONFIG' });
  const output = responses.toolCalls([{ name: 'tool', arguments: { value: 'before' } }]).value;
  const response = encode(output);
  output.tools[0].arguments.value = 'after';
  assert.equal(
    JSON.parse((await response.json()).choices[0].message.tool_calls[0].function.arguments).value,
    'before',
  );
  assert.throws(() => encodeModelResponse(input, {}, 'id', 0, AbortSignal.abort(), () => {}), {
    name: 'AbortError',
  });
});

test('large Unicode output limits apply before a response stream is created', async () => {
  for (const generator of ['🙂'.repeat(2000), responses.text('🙂'.repeat(2000))]) {
    const mock = new MockGPT({ maxOutputChars: 1999, rules: [{ generator }] });
    await assert.rejects(mock.generate(input), { code: 'MOCK_OUTPUT_LIMIT' });
    assert.equal(mock.activeRequests, 0);
  }
  const image = await new MockGPT({ rules: [{ generator: generators.imageUrl() }] }).generate(
    input,
  );
  assert.match(decodeURIComponent(image), /width="320" height="180"/);
});

test('generator primitives and configuration errors exercise their real ESM implementations', async () => {
  const primitive = (context) => ({
    integer: generators.integer(-3, -3)(context),
    float: generators.float(2, 2)(context),
    boolean: generators.boolean()(context),
    pick: generators.pick([{ id: 7 }])(context),
    id: generators.id('user')(context),
  });
  const value = await new MockGPT({ seed: 42, rules: [{ generator: primitive }] }).generate(input);
  assert.equal(value.integer, -3);
  assert.equal(value.float, 2);
  assert.equal(typeof value.boolean, 'boolean');
  assert.deepEqual(value.pick, { id: 7 });
  assert.match(value.id, /^user-1-/);
  for (const factory of [
    () => generators.integer(3, 2),
    () => generators.integer(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    () => generators.float(Infinity),
    () => generators.float(2, 1),
    () => generators.pick([]),
    () => generators.sequence([]),
    () => generators.imageUrl({ width: 0 }),
  ])
    assert.throws(factory, { code: 'MOCK_CONFIG' });
  for (const rule of [{ id: '' }, { prompt: 1 }, { model: 1 }, { when: false }, { times: 0 }])
    assert.throws(() => new MockGPT({ rules: [{ generator: 'hello', ...rule }] }), {
      code: 'MOCK_CONFIG',
    });
  for (const output of [
    { finishReason: 'invalid' },
    { tools: {} },
    { usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 4 } },
  ])
    assert.throws(() => responses.text('hello', output), { code: 'MOCK_CONFIG' });
  assert.throws(
    () =>
      encodeModelResponse(input, { content: 7 }, 'id', 0, new AbortController().signal, () => {}),
    { code: 'MOCK_CONFIG' },
  );
  assert.equal(
    (
      await new MockGPT({
        rules: [{ generator: generators.toolCall('read', { id: 1 }) }],
      }).generate(input)
    ).kind,
    'model',
  );
  assert.equal(
    typeof (await new MockGPT({
      rules: [{ generator: generators.bullets({ source: '第一个句子。第二个句子。' }) }],
    }).generate(input)),
    'string',
  );
  await assert.rejects(
    new MockGPT({ clock: () => NaN, rules: [{ generator: generators.date() }] }).generate(input),
    { code: 'MOCK_CONFIG' },
  );
  await assert.rejects(
    new MockGPT({
      rules: [
        {
          generator: (context) => {
            context.report({ oversized: 'x'.repeat(8193) });
            return 'bad';
          },
        },
      ],
    }).generate(input),
    { code: 'MOCK_METADATA_LIMIT' },
  );
});
