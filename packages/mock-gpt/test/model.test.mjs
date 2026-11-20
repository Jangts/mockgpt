/**
 * Core `MockGPT` model behaviour through `fetch`.
 *
 * Covers route freezing, rule ordering and `times` budgets, sequence state shared across calls,
 * request validation, JSON fault vs network rejection, SSE framing/usage, cancellation, metadata
 * bounds and seeded determinism. Runs against the built output in `dist/`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { MockGPT, generators, responses, generatorNames, routes } from '../dist/esm/index.js';
const url = 'https://mock.invalid/v1/chat/completions';
const payload = (content = 'hello', extra = {}) => ({
  model: 'demo',
  messages: [{ role: 'user', content }],
  ...extra,
});
const call = (mock, data = payload(), signal) =>
  mock.fetch(url, { method: 'POST', body: JSON.stringify(data), signal });
const text = async (response) => (await response.json()).choices[0].message.content;

test('exported route entries cannot change routing for any instance', async () => {
  assert.throws(() => {
    routes[0].path = '/changed';
  }, TypeError);
  assert.throws(() => {
    routes[0].method = 'GET';
  }, TypeError);
  for (const mock of [
    new MockGPT({ rules: [{ generator: 'A' }] }),
    new MockGPT({ rules: [{ generator: 'B' }] }),
  ]) {
    assert.equal(
      (
        await mock.fetch('http://mock/chat/completions', {
          method: 'POST',
          body: JSON.stringify(payload()),
        })
      ).status,
      200,
    );
  }
});

test('fixed JSON is content; configs are snapshotted and standard multimodal text projection is ordered', async () => {
  const value = { tool_calls: ['ordinary data'], x: 1 };
  const mock = new MockGPT({ rules: [{ prompt: 'a\nb', generator: value }], clock: () => 1000 });
  value.x = 2;
  const response = await call(
    mock,
    payload([
      { type: 'text', text: 'a' },
      { type: 'image_url', image_url: { url: 'image' } },
      { type: 'text', text: 'b' },
    ]),
  );
  assert.deepEqual(JSON.parse(await text(response)), { tool_calls: ['ordinary data'], x: 1 });
  assert.equal(mock.counts['rule-1'], 1);
  assert.equal(mock.records[0].status, 'completed');
});
test('ordered matching, regex lastIndex isolation and duplicate validation', async () => {
  const mock = new MockGPT({
    rules: [
      { prompt: /hi/g, generator: ({ match }) => match[0], times: 2 },
      { generator: 'fallback' },
    ],
  });
  assert.equal(await text(await call(mock, payload('hi'))), 'hi');
  assert.equal(await text(await call(mock, payload('hi'))), 'hi');
  assert.equal(await text(await call(mock, payload('hi'))), 'fallback');
  assert.throws(
    () =>
      new MockGPT({
        rules: [
          { id: 'x', generator: '' },
          { id: 'x', generator: '' },
        ],
      }),
    { code: 'MOCK_CONFIG' },
  );
});
test('sequence reserves indices before asynchronous completion, reports exhaustion, resets', async () => {
  const mock = new MockGPT({
    rules: [
      {
        generator: generators.sequence([
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return 'first';
          },
          'second',
        ]),
      },
    ],
  });
  const [a, b] = await Promise.all([call(mock), call(mock)]);
  assert.equal(await text(a), 'first');
  assert.equal(await text(b), 'second');
  await assert.rejects(call(mock), { code: 'MOCK_SEQUENCE_EXHAUSTED' });
  assert.equal(mock.counts['rule-1'], 3);
  mock.reset();
  assert.equal(await text(await call(mock)), 'first');
});
test('errors stay errors; JSON rejects undefined, NaN, cycles, sparse arrays and bigint', async () => {
  for (const bad of [{ missing: undefined }, NaN, 1n, Array(2)])
    assert.throws(() => new MockGPT({ rules: [{ generator: bad }] }));
  const cycle = {};
  cycle.a = cycle;
  assert.throws(() => new MockGPT({ rules: [{ generator: cycle }] }));
  await assert.rejects(call(new MockGPT({ rules: [{ generator: () => undefined }] })), {
    code: 'MOCK_GENERATION',
  });
  await assert.rejects(call(new MockGPT({ rules: [] })), { code: 'MOCK_RULE_NOT_FOUND' });
  const bad = new MockGPT({
    rules: [
      {
        generator: () => {
          throw new Error('nope');
        },
      },
    ],
  });
  await assert.rejects(call(bad), /nope/);
  assert.equal(bad.activeRequests, 0);
});
test('HTTP faults and Promise rejection remain distinct', async () => {
  const mock = new MockGPT({
    rules: [
      { prompt: 'http', generator: responses.httpError(429, { error: 'limited' }) },
      { generator: responses.reject('offline') },
    ],
  });
  const failed = await call(mock, payload('http'));
  assert.equal(failed.status, 429);
  assert.deepEqual(await failed.json(), { error: 'limited' });
  await assert.rejects(call(mock), { code: 'MOCK_NETWORK' });
});
test('request protocol validation and body limit are explicit', async () => {
  const mock = new MockGPT({ rules: [] });
  assert.equal((await mock.fetch('https://x/unknown')).status, 404);
  assert.equal((await mock.fetch(url)).status, 405);
  assert.equal((await mock.fetch(url, { method: 'POST', body: '{' })).status, 400);
  for (const change of [{ n: 2 }, { stream: 'yes' }, { messages: [] }, { stream_options: null }])
    assert.equal((await call(mock, payload('hello', change))).status, 400);
  assert.equal((await call(new MockGPT({ rules: [], maxBodyBytes: 10 }))).status, 413);
});
test('SSE tools fragment arguments with shared IDs, usage and a terminal frame', async () => {
  const mock = new MockGPT({
    rules: [
      {
        generator: responses.toolCalls([{ name: 'weather', arguments: { city: '武汉🌦' } }], {
          chunkSize: 2,
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        }),
      },
    ],
  });
  const response = await call(
    mock,
    payload('hello', { stream: true, stream_options: { include_usage: true } }),
  );
  // The call stays active until the SSE body is fully consumed, not just until headers arrive.
  assert.equal(mock.activeRequests, 1);
  assert.throws(() => mock.reset(), { code: 'MOCK_ACTIVE' });
  const wire = await response.text();
  const data = wire
    .trim()
    .split('\n\n')
    .map((line) => line.slice(6));
  assert.equal(data.pop(), '[DONE]');
  const events = data.map(JSON.parse);
  const tools = events.flatMap((item) => item.choices[0]?.delta.tool_calls ?? []);
  assert.equal(tools.map((call) => call.function.name ?? '').join(''), 'weather');
  assert.ok(tools[0].id);
  assert.equal(tools.map((call) => call.function.arguments ?? '').join(''), '{"city":"武汉🌦"}');
  assert.equal(events.at(-1).choices.length, 0);
  assert.equal(events.at(-1).usage.total_tokens, 3);
  assert.equal(mock.activeRequests, 0);
  assert.equal(mock.records[0].status, 'completed');
});
test('pre-cancel consumes nothing; generator cancellation and stream cancellation release state', async () => {
  const stopped = AbortSignal.abort();
  const mock = new MockGPT({ rules: [{ generator: 'hello' }] });
  await assert.rejects(call(mock, payload(), stopped));
  assert.deepEqual(mock.counts, { 'rule-1': 0 });
  const response = await call(mock, payload('hello', { stream: true }));
  await response.body.cancel();
  assert.equal(mock.activeRequests, 0);
  assert.equal(mock.records[0].status, 'cancelled');
  const pending = new MockGPT({ rules: [{ generator: () => new Promise(() => {}) }] });
  const controller = new AbortController();
  const promise = call(pending, payload(), controller.signal);
  await new Promise((resolve) => setTimeout(resolve, 5));
  controller.abort();
  await assert.rejects(promise);
  assert.equal(pending.activeRequests, 0);
});
test('signal abort errors an unconsumed stream; interruption never claims completion', async () => {
  const mock = new MockGPT({ rules: [{ generator: responses.text('hi', { interruptAfter: 1 }) }] });
  const response = await call(mock, payload('', { stream: true }));
  await assert.rejects(response.text());
  assert.equal(mock.records[0].status, 'error');
  const controller = new AbortController();
  const m = new MockGPT({ rules: [{ generator: 'hi' }] });
  const r = await call(m, payload('', { stream: true }), controller.signal);
  controller.abort();
  await assert.rejects(r.text());
  assert.equal(m.activeRequests, 0);
  assert.equal(m.records[0].status, 'cancelled');
});
test('metadata is bounded and does not store auth or contents; returned records cannot mutate state', async () => {
  const mock = new MockGPT({ recordLimit: 1, rules: [{ generator: 'hello' }] });
  await call(mock);
  await call(mock);
  const records = mock.records;
  records[0].model = 'mutated';
  assert.equal(mock.records.length, 1);
  assert.equal(mock.records[0].model, 'demo');
  assert.ok(!JSON.stringify(mock.records).includes('hello'));
});
test('input-aware generators, async sources, length limits and seeded values', async () => {
  assert.ok(generatorNames.includes('summary'));
  const summary = new MockGPT({
    rules: [
      {
        generator: generators.summary({
          source: async () => '咖啡馆提供咖啡。大家可以阅读。',
          maxChars: 8,
        }),
      },
    ],
  });
  assert.ok(Array.from(await text(await call(summary))).length <= 8);
  const keywords = new MockGPT({ rules: [{ generator: generators.keywords() }] });
  const input = '咖啡馆欢迎大家，咖啡馆提供咖啡。';
  const terms = JSON.parse(await text(await call(keywords, payload(input))));
  assert.ok(terms.length > 0);
  assert.ok(terms.every((term) => input.includes(term)));
  const extracted = new MockGPT({ rules: [{ generator: generators.extract() }] });
  assert.equal(
    JSON.parse(await text(await call(extracted, payload('联系 demo@example.com')))).email,
    'demo@example.com',
  );
  for (const factory of [
    () => generators.integer(1, 1000000),
    () => generators.sentence(),
    () => generators.date(),
  ]) {
    const m = new MockGPT({ seed: 42, clock: () => 1000, rules: [{ generator: factory() }] });
    const first = await text(await call(m));
    m.reset();
    assert.equal(await text(await call(m)), first);
  }
});
test('ESM and CommonJS expose the same public API', async () => {
  const esm = await import('../dist/esm/index.js');
  const cjs = createRequire(import.meta.url)('../dist/cjs/index.js');
  assert.deepEqual(Object.keys(esm).sort(), Object.keys(cjs).sort());
});
test('fallback sequence owns its own hit order instead of consuming other rules counts', async () => {
  const mock = new MockGPT({
    rules: [{ prompt: 'fixed', generator: 'fixed' }],
    fallback: generators.sequence(['first fallback', 'second fallback']),
  });
  await call(mock, payload('fixed'));
  assert.equal(await text(await call(mock)), 'first fallback');
  await call(mock, payload('fixed'));
  assert.equal(await text(await call(mock)), 'second fallback');
  mock.reset();
  assert.equal(await text(await call(mock)), 'first fallback');
});
test('wire byte fragmentation can split UTF-8 and SSE boundaries without changing decoded content', async () => {
  const mock = new MockGPT({
    stream: { chunkSize: 1, wireChunkSize: 1 },
    rules: [{ generator: '你好🙂' }],
  });
  const response = await call(mock, payload('hello', { stream: true }));
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let wire = '',
    bytes = 0;
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    assert.equal(item.value.length, 1);
    bytes++;
    wire += decoder.decode(item.value, { stream: true });
  }
  wire += decoder.decode();
  const events = wire
    .trim()
    .split('\n\n')
    .slice(0, -1)
    .map((line) => JSON.parse(line.slice(6)));
  assert.equal(events.map((event) => event.choices[0].delta.content ?? '').join(''), '你好🙂');
  assert.ok(bytes > 100);
  assert.equal(mock.records[0].status, 'completed');
});
