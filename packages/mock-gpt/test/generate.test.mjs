/**
 * Behaviour of the `MockGPT.generate` entry point.
 *
 * `generate` returns plain data and must not construct Requests, Responses, delays or streams, and
 * must share rule counts, sequence positions and records with `fetch`. Runs against the built
 * output in `dist/`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockGPT, generators, responses, ResponseDescription } from '../dist/esm/index.js';

const input = (content) => ({ model: 'demo', messages: [{ role: 'user', content }] });

test('SDK omits optional undefined object fields without weakening output validation', async () => {
  const request = {
    ...input('hello'),
    tools: undefined,
    stream_options: { include_usage: undefined },
    messages: [{ role: 'user', content: 'hello', name: undefined }],
  };
  const mock = new MockGPT({
    rules: [
      {
        generator: ({ request }) => {
          assert.equal(Object.hasOwn(request, 'tools'), false);
          assert.equal(Object.hasOwn(request.messages[0], 'name'), false);
          assert.deepEqual(request.stream_options, {});
          assert.ok(Object.isFrozen(request.messages[0]));
          return 'hello';
        },
      },
    ],
  });
  assert.equal(await mock.generate(request), 'hello');
  assert.ok(Object.hasOwn(request, 'tools'), 'input is not mutated');
  for (const extra of [{ x: 1n }, { x: NaN }, { x: [undefined] }])
    await assert.rejects(mock.generate({ ...input('hello'), ...extra }), {
      code: 'MOCK_REQUEST',
      status: 400,
    });
  await assert.rejects(
    new MockGPT({ rules: [{ generator: () => ({ x: undefined }) }] }).generate(input('hello')),
    { code: 'MOCK_GENERATION' },
  );
});

test('SDK generates plain data without Request or Response and snapshots returned values', async (t) => {
  const saved = { Request: globalThis.Request, Response: globalThis.Response };
  t.after(() => Object.assign(globalThis, saved));
  // Poison the transport globals: generate must never construct Request or Response.
  globalThis.Request = globalThis.Response = class {
    constructor() {
      throw new Error('transport must not run');
    }
  };
  const original = { count: 2 };
  const mock = new MockGPT({ rules: [{ prompt: 'data', generator: () => original }] });
  const value = await mock.generate(input('data'));
  original.count = 9;
  assert.deepEqual(value, { count: 2 });
  assert.equal(mock.records[0].status, 'completed');
  assert.equal(mock.records[0].path, undefined);
  assert.equal(mock.activeRequests, 0);
});

test('SDK returns response descriptions as inert data without delay, HTTP or stream processing', async () => {
  const descriptions = [
    responses.text('hello', { delayMs: 60_000, intervalMs: 60_000, interruptAfter: 0 }),
    responses.httpError(429),
    responses.reject('offline'),
  ];
  const mock = new MockGPT({ rules: [{ generator: generators.sequence(descriptions) }] });
  for (const expected of descriptions) {
    const value = await mock.generate(input('hello'));
    assert.ok(value instanceof ResponseDescription);
    assert.deepEqual(value, expected);
    assert.equal(mock.records.at(-1).status, 'completed');
  }
});

test('SDK and optional fetch adapter share rule counts and sequence state', async () => {
  const mock = new MockGPT({
    rules: [{ generator: generators.sequence(['first', 'second', 'third']) }],
  });
  assert.equal(await mock.generate(input('hello')), 'first');
  const response = await mock.fetch('https://mock.invalid/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify(input('hello')),
  });
  assert.equal((await response.json()).choices[0].message.content, 'second');
  assert.equal(await mock.generate(input('hello')), 'third');
  await assert.rejects(mock.generate(input('hello')), { code: 'MOCK_SEQUENCE_EXHAUSTED' });
  mock.reset();
  assert.equal(await mock.generate(input('hello')), 'first');
});

test('SDK cancellation consumes no pre-cancelled rule and releases pending generation', async () => {
  const controller = new AbortController();
  let began;
  const started = new Promise((resolve) => {
    began = resolve;
  });
  const mock = new MockGPT({
    rules: [
      {
        generator: () => {
          began();
          return new Promise(() => {});
        },
      },
    ],
  });
  await assert.rejects(mock.generate(input('hello'), { signal: AbortSignal.abort() }));
  assert.equal(mock.counts['rule-1'], 0);
  const pending = mock.generate(input('hello'), { signal: controller.signal });
  await started;
  assert.throws(() => mock.reset(), { code: 'MOCK_ACTIVE' });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(mock.activeRequests, 0);
  assert.equal(mock.records[0].status, 'cancelled');
});

test('SDK validates inputs, generator output and output budgets', async () => {
  await assert.rejects(new MockGPT({ rules: [] }).generate({ model: 'demo', messages: [] }), {
    code: 'MOCK_REQUEST',
  });
  await assert.rejects(
    new MockGPT({ rules: [{ generator: () => undefined }] }).generate(input('hello')),
    { code: 'MOCK_GENERATION' },
  );
  const mock = new MockGPT({ maxOutputChars: 2, rules: [{ generator: 'long' }] });
  await assert.rejects(mock.generate(input('hello')), { code: 'MOCK_OUTPUT_LIMIT' });
  assert.equal(mock.activeRequests, 0);
});
