/**
 * 校验 browserWebSource 在浏览器/Node 共用 fetch 下的行为：拒绝非文本响应、
 * 截断过长的 URL 诊断、省略凭据，以及区分“读取失败回退”和“用户取消”。
 * 通过替换 globalThis.fetch 模拟外部站点，不访问真实网络。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockGPT, generators } from '@jangts/mock-gpt';
import { browserWebSource } from '../src/scenarios/browser-web-source.ts';

const input = {
  model: 'demo',
  messages: [{ role: 'user', content: '网页总结 https://example.com/article' }],
};
const create = () =>
  new MockGPT({ rules: [{ generator: generators.summary({ source: browserWebSource }) }] });

test(
  'refused or unsupported responses cancel their bodies without awaiting cleanup',
  { timeout: 2000 },
  async (t) => {
    const saved = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = saved;
    });
    for (const [status, type] of [
      [404, 'text/plain'],
      [200, 'application/pdf'],
    ]) {
      // 404 与不支持的类型都应取消响应体；cancel 故意不 resolve，验证不等待清理。
      let cancelled = false;
      globalThis.fetch = async () =>
        new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
              return new Promise(() => {});
            },
          }),
          { status, headers: { 'content-type': type } },
        );
      const mock = create();
      assert.match(await mock.generate(input), /不支持访问实时网页/);
      assert.equal(cancelled, true);
      assert.equal(
        mock.records[0].metadata.sourceError,
        status === 404 ? 'MOCK_WEB_HTTP' : 'MOCK_WEB_TYPE',
      );
    }
  },
);
test('browser URL diagnostics are bounded without changing the actual request', async (t) => {
  const saved = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = saved;
  });
  // 超长查询串用于触发诊断字段的长度上限，同时实际请求仍使用完整 URL。
  const url = 'https://example.com/article?q=' + 'x'.repeat(5000);
  globalThis.fetch = async (target) => {
    assert.equal(target.href, url);
    return new Response('Readable article.', { headers: { 'content-type': 'text/plain' } });
  };
  const mock = create();
  assert.match(
    await mock.generate({
      model: 'demo',
      messages: [{ role: 'user', content: `网页总结 ${url}` }],
    }),
    /Readable/,
  );
  assert.equal(mock.records[0].metadata.urlTruncated, true);
  assert.ok(mock.records[0].metadata.requestedUrl.length <= 512);
});

test('browser web source reads CORS-accessible text without credentials and records transport', async (t) => {
  const saved = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = saved;
  });
  globalThis.fetch = async (url, options) => {
    assert.equal(url.href, 'https://example.com/article');
    // credentials 必须省略，模拟器不能把用户凭据带给任意站点。
    assert.equal(options.credentials, 'omit');
    return new Response('咖啡馆阅读区增加二十个座位。周末开始举行读书会。', {
      headers: { 'content-type': 'text/plain' },
    });
  };
  const mock = create();
  assert.match(await mock.generate(input), /阅读区/);
  assert.equal(mock.records[0].metadata.transport, 'browser-fetch');
});

test('browser fetch failures use fallback while user cancellation remains cancellation', async (t) => {
  const saved = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = saved;
  });
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  const mock = create();
  assert.match(await mock.generate(input), /不支持访问实时网页/);
  assert.equal(mock.records[0].metadata.sourceFallback, true);
  // 第二阶段改为可中止的挂起请求，用于区分用户取消和普通读取失败。
  let began;
  const started = new Promise((resolve) => {
    began = resolve;
  });
  globalThis.fetch = async (_url, options) =>
    new Promise((_resolve, reject) => {
      began();
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    });
  const controller = new AbortController();
  const pending = mock.generate(input, { signal: controller.signal });
  await started;
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(mock.records.at(-1).status, 'cancelled');
});
