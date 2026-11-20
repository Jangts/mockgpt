/**
 * Call lifecycle: cancellation, timer cleanup and terminal record states.
 *
 * Uses `process.getActiveResourcesInfo()` to prove that cancelling a reader clears the pending
 * frame timer, and covers falsy generator throws, clock/selector/predicate failures and
 * cancellation of body reads. Runs against the built output in `dist/`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { MockGPT, generators, responses } from '../dist/esm/index.js';
import { abortable, readBytes } from '../dist/esm/shared/utils.js';

const call = (mock, signal, stream = false) =>
  mock.fetch('https://mock.invalid/v1/chat/completions', {
    method: 'POST',
    signal,
    body: JSON.stringify({ model: 'demo', messages: [{ role: 'user', content: 'hello' }], stream }),
  });

test('cancelling a reader clears an in-flight frame timer and permits reset', async () => {
  const controller = new AbortController();
  const mock = new MockGPT({
    rules: [{ generator: responses.text('hello', { intervalMs: 60_000 }) }],
  });
  const response = await call(mock, controller.signal, true);
  const reader = response.body.getReader();
  // Counts live timers so a leaked frame interval is visible even without visible symptoms.
  const timers = () => process.getActiveResourcesInfo().filter((name) => name === 'Timeout').length;
  const before = timers();
  try {
    const pending = reader.read();
    await nextTurn();
    assert.equal(timers(), before + 1, 'the frame interval is pending');
    await reader.cancel(false);
    assert.equal((await pending).done, true);
    assert.equal(timers(), before, 'reader cancellation must clear the frame interval');
    assert.equal(mock.activeRequests, 0);
    assert.equal(mock.records[0].status, 'cancelled');
    assert.equal(mock.records[0].errorCode, 'MOCK_CANCELLED');
    mock.reset();
  } finally {
    controller.abort();
    reader.releaseLock();
  }
});

test('falsy generator failures never become successful call records', async () => {
  for (const reason of [undefined, null, false, 0, '']) {
    const mock = new MockGPT({
      rules: [
        {
          generator: () => {
            throw reason;
          },
        },
      ],
    });
    await call(mock).then(
      () => assert.fail('generation must reject'),
      (error) => assert.equal(error, reason),
    );
    assert.equal(mock.records[0].status, 'error');
    assert.equal(mock.records[0].errorCode, 'MOCK_GENERATION');
    assert.equal(mock.activeRequests, 0);
  }
});

test('cancellation at the clock boundary cannot return a successful response', async () => {
  for (const stream of [false, true]) {
    const controller = new AbortController();
    const mock = new MockGPT({
      rules: [{ generator: 'hello' }],
      clock: () => {
        controller.abort();
        return 1000;
      },
    });
    await assert.rejects(call(mock, controller.signal, stream), { name: 'AbortError' });
    assert.equal(mock.records[0].status, 'cancelled');
    assert.equal(mock.activeRequests, 0);
  }
});

test('invalid asynchronous selectors and predicates reject without an unhandled rejection', async () => {
  for (const options of [
    {
      selectPrompt: async () => {
        throw new Error('selector rejected');
      },
    },
    {
      when: async () => {
        throw new Error('predicate rejected');
      },
    },
  ]) {
    const mock = new MockGPT({
      rules: [{ generator: 'hello', ...(options.when ? { when: options.when } : {}) }],
      ...(options.selectPrompt ? { selectPrompt: options.selectPrompt } : {}),
    });
    await assert.rejects(call(mock), { code: 'MOCK_CONFIG' });
    await nextTurn();
    assert.equal(mock.activeRequests, 0);
    assert.equal(mock.counts['rule-1'], 0);
  }
});

test('asynchronous clocks fail safely both during generation and response encoding', async () => {
  for (const generator of ['hello', generators.date()]) {
    const mock = new MockGPT({
      rules: [{ generator }],
      clock: async () => {
        throw new Error('clock rejected');
      },
    });
    await assert.rejects(call(mock), { code: 'MOCK_CONFIG' });
    await nextTurn();
    assert.equal(mock.records[0].status, 'error');
    assert.equal(mock.activeRequests, 0);
  }
});

test('pre-cancelled waits still observe the supplied work rejection', async () => {
  await assert.rejects(abortable(Promise.reject(new Error('late failure')), AbortSignal.abort()), {
    name: 'AbortError',
  });
  await nextTurn();
});

test('cancellation preserves an explicitly null abort reason', async () => {
  const controller = new AbortController();
  const pending = abortable(new Promise(() => {}), controller.signal);
  const rejected = pending.then(
    () => assert.fail('wait must reject'),
    (reason) => assert.equal(reason, null),
  );
  controller.abort(null);
  await rejected;
});

test('body cancellation does not wait for an uncooperative source cleanup', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const body = new ReadableStream({
    cancel() {
      cancelled = true;
      return new Promise(() => {});
    },
  });
  const reading = readBytes(body, 1024, controller.signal);
  const rejected = assert.rejects(reading, { name: 'AbortError' });
  controller.abort();
  const result = await Promise.race([
    rejected.then(() => 'aborted'),
    nextTurn().then(() => 'still pending'),
  ]);
  assert.equal(result, 'aborted');
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});
