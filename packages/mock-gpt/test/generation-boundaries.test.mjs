/**
 * Boundary conditions around generation start and descriptor validation.
 *
 * Covers cancellation before the generator microtask runs, and malformed descriptors reaching both
 * entry points; both must leave no active call and record a terminal status. Runs against the
 * built output in `dist/`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockGPT, ResponseDescription, responses } from '../dist/esm/index.js';

const input = { model: 'demo', messages: [{ role: 'user', content: 'hello' }] };
test('cancellation before the generator microtask prevents its side effects', async () => {
  let executed = false;
  const controller = new AbortController();
  const mock = new MockGPT({
    rules: [
      {
        generator: () => {
          executed = true;
          return 'hello';
        },
      },
    ],
  });
  const pending = mock.generate(input, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(executed, false);
  assert.equal(mock.activeRequests, 0);
  assert.equal(mock.records[0].status, 'cancelled');
  assert.equal(mock.counts['rule-1'], 1);
});
test('all descriptors are validated before either SDK entry point reports success', async () => {
  for (const [kind, value] of [
    ['unknown', {}],
    ['model', 'hello'],
    ['model', null],
    ['model', []],
    ['model', { tools: [null] }],
    ['model', { tools: [{ name: 'weather' }] }],
    ['model', { usage: null }],
    ['http', { status: 200, body: {} }],
    ['http', { status: 429 }],
    ['reject', {}],
  ]) {
    const descriptor = new ResponseDescription(kind, value);
    assert.throws(() => new MockGPT({ rules: [{ generator: descriptor }] }), {
      code: 'MOCK_CONFIG',
    });
    const mock = new MockGPT({ rules: [{ generator: () => descriptor }] });
    await assert.rejects(mock.generate(input), { code: 'MOCK_CONFIG' });
    assert.equal(mock.records[0].status, 'error');
    assert.equal(mock.activeRequests, 0);
    await assert.rejects(
      mock.fetch('http://mock/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
      { code: 'MOCK_CONFIG' },
    );
    assert.equal(mock.records.at(-1).status, 'error');
    assert.equal(mock.activeRequests, 0);
  }
  assert.throws(() => responses.toolCalls([{ name: 'weather' }]), { code: 'MOCK_CONFIG' });
  assert.equal(
    (
      await new MockGPT({
        rules: [{ generator: responses.toolCalls([{ name: 'weather', arguments: null }]) }],
      }).generate(input)
    ).kind,
    'model',
  );
});
