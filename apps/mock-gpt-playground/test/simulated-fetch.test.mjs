/**
 * 校验应用侧模拟 fetch 的传输合同：默认值校验与快照、4xx 预检、请求体上限、
 * SSE 字节分片、取消时清理定时器，以及复用 SDK 的协议合同套件。
 * 不经过真实网络，所有生成都由 MockGPT 产出后按分片写出。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { MockGPT, responses } from '@jangts/mock-gpt';
import { createPlaygroundFetch } from '../src/simulated-fetch.ts';
import { protocolContract } from '../../../packages/mock-gpt/test/protocol-contract.fixture.mjs';

// 复用 SDK 的协议合同套件，保证适配层与上游编码规则一致。
protocolContract('Playground fetch', (output) =>
  createPlaygroundFetch(
    new MockGPT({ rules: [{ generator: responses.text(output.content, output) }] }),
    { chunkSize: 1, wireChunkSize: 1, intervalMs: 0 },
  ),
);

test('transport defaults are validated and snapshotted before creating any response stream', async () => {
  const mock = new MockGPT({ rules: [{ generator: 'hello' }] });
  // 非法分片参数必须在创建响应流之前失败。
  for (const defaults of [{ wireChunkSize: 0 }, { chunkSize: 0 }, { intervalMs: -1 }])
    assert.throws(() => createPlaygroundFetch(mock, defaults), { code: 'MOCK_CONFIG' });
  const defaults = { chunkSize: 1, wireChunkSize: 1, intervalMs: undefined };
  const fetch = createPlaygroundFetch(mock, defaults);
  // 调用方之后改动 options 不能影响已创建的适配器。
  defaults.wireChunkSize = 0;
  const response = await request(fetch);
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.equal(first.value.length, 1);
  await reader.cancel();
  reader.releaseLock();
});

test('invalid JSON, invalid requests and oversized bodies return 4xx before generating', async () => {
  const mock = new MockGPT({ rules: [{ generator: 'hello' }] }),
    fetch = createPlaygroundFetch(mock);
  for (const [body, status] of [
    ['{', 400],
    ['{}', 400],
    [' '.repeat(1_048_577), 413],
  ]) {
    const response = await fetch('http://mock/chat/completions', { method: 'POST', body });
    assert.equal(response.status, status);
    assert.ok((await response.json()).error.code);
  }
  assert.deepEqual(mock.records, []);
});
test(
  'cancelling a stalled body does not wait for uncooperative stream cleanup',
  { timeout: 2000 },
  async () => {
    // 不可合作的流清理函数故意挂起，取消路径不能等待它。
    let began;
    const started = new Promise((resolve) => {
      began = resolve;
    });
    let cancelled = false;
    const body = new ReadableStream({
      pull() {
        began();
      },
      cancel() {
        cancelled = true;
        return new Promise(() => {});
      },
    });
    const controller = new AbortController(),
      mock = new MockGPT({ rules: [{ generator: 'hello' }] });
    const request = new Request('http://mock/chat/completions', {
      method: 'POST',
      body,
      duplex: 'half',
      signal: controller.signal,
    });
    const pending = createPlaygroundFetch(mock)(request);
    await started;
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(cancelled, true);
    assert.deepEqual(mock.records, []);
  },
);

const request = (fetch, signal) =>
  fetch('https://mockgpt.local/v1/chat/completions', {
    method: 'POST',
    signal,
    body: JSON.stringify({
      model: 'demo',
      messages: [{ role: 'user', content: 'hello' }],
      stream: true,
    }),
  });

test('app generates SSE byte fragments without network and leaves SDK generation completed', async () => {
  const mock = new MockGPT({ rules: [{ generator: '你好🙂' }] });
  const fetch = createPlaygroundFetch(mock, { chunkSize: 1, wireChunkSize: 1, intervalMs: 0 });
  const response = await request(fetch);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  assert.equal(mock.activeRequests, 0);
  assert.equal(mock.records[0].status, 'completed');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let wire = '';
  // 单字节分片用于验证跨 UTF-8 边界解码仍得到完整文本。
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    assert.equal(item.value.length, 1);
    wire += decoder.decode(item.value, { stream: true });
  }
  wire += decoder.decode();
  reader.releaseLock();
  const frames = wire
    .trim()
    .split('\n\n')
    .map((frame) => frame.slice(6));
  assert.equal(frames.pop(), '[DONE]');
  assert.equal(
    frames
      .map(JSON.parse)
      .map((item) => item.choices[0].delta.content ?? '')
      .join(''),
    '你好🙂',
  );
});

test('app cancellation clears a pending interval without changing SDK generation status', async () => {
  const mock = new MockGPT({
    rules: [{ generator: responses.text('hello', { intervalMs: 60_000 }) }],
  });
  const controller = new AbortController();
  const response = await request(createPlaygroundFetch(mock), controller.signal);
  const reader = response.body.getReader();
  const pending = reader.read();
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await nextTurn();
  controller.abort();
  await rejected;
  reader.releaseLock();
  assert.equal(mock.records[0].status, 'completed');
  mock.reset();
});
