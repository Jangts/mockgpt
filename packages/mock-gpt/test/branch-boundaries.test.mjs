/**
 * Edge branches of the runtime, generators, web source, host policy and wire codec.
 *
 * Asserts the concrete failure codes and cancellation reasons that the happy-path suites do not
 * reach, including parser failures and stream-construction races. Runs against the built output in
 * `dist/`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MockGPT, MockGPTError, generators } from '../dist/esm/index.js';
import { summarize } from '../dist/esm/generators/summarize.js';
import { delay, readBytes, errorResponse } from '../dist/esm/shared/utils.js';
import { sources } from '../dist/esm/web.js';
import { configuredHosts, checkHost } from '../dist/esm/node/access.js';
import { encodeModel } from '../dist/esm/runtime/chat-completions.js';
import { DOMParser } from 'linkedom';
import { Readability } from '@mozilla/readability';

const input = { model: 'demo', messages: [{ role: 'user', content: 'hello' }] };
test('text transforms handle empty input, continued topics, custom templates and large sources', async () => {
  const generate = (generator) => new MockGPT({ rules: [{ generator }] }).generate(input);
  assert.equal(await generate(generators.title({ source: '' })), '');
  const large = new MockGPT({
    rules: [{ generator: generators.title({ source: 'a'.repeat(30001) }) }],
  });
  assert.equal((await large.generate(input)).length, 24);
  assert.equal(large.records[0].metadata.sourceTruncated, true);
  assert.equal(
    await generate(generators.reply({ source: '' })),
    '你好，可以告诉我你想了解的内容。',
  );
  const previous = {
    ...input,
    messages: [
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: '继续' },
    ],
  };
  assert.match(
    await new MockGPT({ rules: [{ generator: generators.reply() }] }).generate(previous),
    /earlier/,
  );
  assert.match(await generate(generators.reply({ source: '继续' })), /继续/);
  assert.equal(
    await generate(generators.reply({ template: ({ text, previous }) => text + ':' + previous })),
    'hello:',
  );
  for (const [text, max, bullets] of [
    ['x', 2, true],
    ['the. and. 的。', 4, false],
    ['word '.repeat(70) + '，short，' + '长'.repeat(200), 30, false],
    ['small phrase longer than the available limit', 20, false],
  ]) {
    const result = summarize(text, 3, max, bullets);
    assert.ok(Array.from(result.text).length <= max);
  }
});

test('ring offsets, exhausted rules and late metadata remain isolated from active generation', async () => {
  let context;
  const mock = new MockGPT({
    recordLimit: 2,
    rules: [
      { times: 1, model: 'other', generator: 'unused' },
      {
        times: 1,
        generator: (source) => {
          context = source;
          return 'first';
        },
      },
    ],
    fallback: 'fallback',
  });
  await mock.generate(input);
  await mock.generate(input);
  await mock.generate(input);
  assert.deepEqual(
    mock.records.map((record) => record.index),
    [2, 3],
  );
  context.report({ late: true });
  assert.deepEqual(mock.records[0].metadata, {});
  await delay(1, new AbortController().signal);
  assert.deepEqual(await readBytes(null, 10, new AbortController().signal), new Uint8Array());
  assert.equal((await errorResponse(new Error('private')).json()).error.code, 'MOCK_INTERNAL');
});

test('Host validation rejects invalid configuration and permits explicit names without socket metadata', () => {
  for (const value of ['host/path', 'user@host', 'host?query', 'host\\path'])
    assert.throws(() => configuredHosts([value]), { code: 'MOCK_CONFIG' });
  assert.equal(
    checkHost('example.com', undefined, new Set(['example.com']), new Set()),
    'example.com',
  );
});

test('raw response encoding retains already-cancelled and mid-pull cancellation semantics', async () => {
  let finishes = 0;
  const signal = AbortSignal.abort(Error('already stopped'));
  const stopped = encodeModel(
    { ...input, stream: true },
    { content: 'x' },
    'id',
    0,
    signal,
    (_error, cancelled) => {
      assert.equal(cancelled, true);
      finishes++;
    },
  );
  await assert.rejects(stopped.text());
  assert.equal(finishes, 1);
  const response = encodeModel(
    { ...input, stream: true },
    { content: 'x', intervalMs: 1000 },
    'id',
    0,
    new AbortController().signal,
    () => {
      finishes++;
    },
  );
  const reader = response.body.getReader(),
    pending = reader.read();
  await new Promise((resolve) => setImmediate(resolve));
  await reader.cancel();
  await pending;
  assert.equal(finishes, 2);
});

test('web URL, charset, login metadata and short sampling remain explicit', async () => {
  const plain = { bytes: new TextEncoder().encode('readable'), contentType: 'text/plain' };
  const generate = (options) =>
    new MockGPT({
      rules: [
        {
          generator: sources.web({
            url: 'https://example.com',
            load: async (url) => ({ ...plain, url: url.href }),
            ...options,
          }),
        },
      ],
    }).generate(input);
  for (const url of ['bad url', 'ftp://example.com', 'https://user:password@example.com'])
    await assert.rejects(generate({ url }), { code: 'MOCK_WEB_URL' });
  await assert.rejects(
    generate({
      load: async (url) => ({
        ...plain,
        url: url.href,
        contentType: 'text/plain;charset=not-a-charset',
      }),
    }),
    { code: 'MOCK_WEB_ENCODING' },
  );
  assert.equal(
    await generate({ load: async () => ({ ...plain, url: 'invalid final URL' }) }),
    'readable',
  );
  assert.equal(await generate({ maxChars: 3 }), 'rea');
  await assert.rejects(
    generate({
      load: async () => ({ ...plain, url: 'https://' + 'a'.repeat(600) + '.example/signin' }),
    }),
    (error) => error.code === 'MOCK_WEB_AUTH_REQUIRED' && error.details.urlTruncated === true,
  );
  const bytes = Buffer.concat([
    Buffer.from('<html><head><meta charset="gbk"></head><body><p>'),
    Buffer.from([0xc4, 0xe3, 0xba, 0xc3]),
    Buffer.from('</p></body></html>'),
  ]);
  assert.match(
    await generate({ load: async (url) => ({ bytes, url: url.href, contentType: 'text/html' }) }),
    /你好/,
  );
});

test('firewall error diagnostics tolerate parser failures and absent document/body text', async (t) => {
  let mode;
  t.mock.method(DOMParser.prototype, 'parseFromString', () => {
    if (mode === 'throw') throw Error('parser failed');
    const node =
      mode === 'fallback' ? { textContent: 'Web Application Firewall: Access Denied' } : null;
    return {
      defaultView: { document: { body: null, documentElement: node, querySelectorAll: () => [] } },
    };
  });
  for (mode of ['throw', 'empty', 'fallback']) {
    const mock = new MockGPT({
      rules: [
        {
          generator: sources.web({
            url: 'https://example.com',
            load: async (url) => ({
              url: url.href,
              status: 403,
              bytes: new TextEncoder().encode('<html>denied</html>'),
              contentType: 'text/html',
            }),
          }),
        },
      ],
    });
    await assert.rejects(mock.generate(input), {
      code: mode === 'fallback' ? 'MOCK_WEB_BLOCKED' : 'MOCK_WEB_HTTP',
    });
  }
});

test('cancellation in selectors, predicates, input getters and stream construction retains its original reason', async (t) => {
  // Each phase aborts inside a different callback; the abort reason must win over the secondary
  // error each callback throws afterwards.
  for (const phase of [
    'selector-throw',
    'selector-value',
    'predicate-throw',
    'predicate-value',
    'input',
    'input-throw',
  ]) {
    const controller = new AbortController(),
      reason = Error(phase);
    const selected = () => {
      controller.abort(reason);
      if (phase.endsWith('throw')) throw Error('secondary');
      return phase.startsWith('predicate') ? false : 'hello';
    };
    const mock = new MockGPT({
      rules: [
        { generator: 'answer', ...(phase.startsWith('predicate') ? { when: selected } : {}) },
      ],
      ...(phase.startsWith('selector') ? { selectPrompt: selected } : {}),
    });
    const request = phase.startsWith('input')
      ? {
          ...input,
          get extra() {
            controller.abort(reason);
            if (phase.endsWith('throw')) throw Error('secondary');
            return 7;
          },
        }
      : input;
    await assert.rejects(
      mock.generate(request, { signal: controller.signal }),
      (error) => error === reason,
    );
    assert.equal(mock.activeRequests, 0);
    assert.equal(mock.counts['rule-1'], 0);
  }
  const original = globalThis.ReadableStream,
    controller = new AbortController(),
    reason = Error('cancel stream creation');
  let generated = false;
  t.mock.method(
    globalThis,
    'ReadableStream',
    class extends original {
      constructor(...args) {
        super(...args);
        if (generated) {
          controller.abort(reason);
          throw Error('secondary constructor failure');
        }
      }
    },
  );
  const mock = new MockGPT({
    rules: [
      {
        generator: () => {
          generated = true;
          return 'answer';
        },
      },
    ],
  });
  await assert.rejects(
    mock.fetch('http://mock/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ ...input, stream: true }),
      signal: controller.signal,
    }),
    (error) => error === reason,
  );
  assert.equal(mock.activeRequests, 0);
  assert.equal(mock.records[0].status, 'cancelled');
});

test('request, source and extraction validation execute their concrete rejection factories', async (t) => {
  for (const options of [null, {}, { rules: {} }])
    assert.throws(() => new MockGPT(options), { code: 'MOCK_CONFIG' });
  for (const request of [
    null,
    [],
    { ...input, messages: [null] },
    { ...input, messages: [{ role: 'unknown' }] },
    { ...input, messages: [{ role: 'user', content: 7 }] },
  ])
    await assert.rejects(new MockGPT({ rules: [] }).generate(request), { code: 'MOCK_REQUEST' });
  await assert.rejects(
    new MockGPT({ rules: [{ generator: generators.title({ source: () => 7 }) }] }).generate(input),
    { code: 'MOCK_SOURCE' },
  );
  assert.throws(() => generators.extract({ fields: { value: 7 } }), { code: 'MOCK_CONFIG' });
  for (const settings of [{ profile: 'unknown' }, { fallback: 7 }])
    assert.throws(() => sources.web(settings), { code: 'MOCK_CONFIG' });
  await assert.rejects(new MockGPT({ rules: [{ generator: sources.web() }] }).generate(input), {
    code: 'MOCK_WEB_URL',
  });
  await assert.rejects(
    new MockGPT({
      rules: [
        {
          generator: sources.web({
            url: 'https://example.com',
            maxBytes: 1,
            load: async (url) => ({
              url: url.href,
              contentType: 'text/plain',
              bytes: new Uint8Array(2),
            }),
          }),
        },
      ],
    }).generate(input),
    { code: 'MOCK_WEB_LIMIT' },
  );
  t.mock.method(Readability.prototype, 'parse', () => null);
  const fallback = new MockGPT({
    rules: [
      {
        generator: sources.web({
          url: 'https://example.com',
          load: async (url) => ({
            url: url.href,
            contentType: 'text/html',
            bytes: new TextEncoder().encode(
              '<html><body><nav>private navigation</nav><p>readable body</p></body></html>',
            ),
          }),
        }),
      },
    ],
  });
  assert.equal(await fallback.generate(input), 'readable body');
  assert.equal(fallback.records[0].metadata.extraction, 'fallback');
});

test('cancellation between a ready zero-interval frame and its pull continuation closes once', async () => {
  let finishes = 0;
  const response = encodeModel(
    { ...input, stream: true },
    { content: 'hello', intervalMs: 0 },
    'id',
    0,
    new AbortController().signal,
    () => {
      finishes++;
    },
  );
  const reader = response.body.getReader(),
    pending = reader.read();
  queueMicrotask(() => {
    void reader.cancel();
  });
  await pending;
  assert.equal(finishes, 1);
});

test('nonstream codec includes usage only when the model output declares it', async () => {
  const signal = new AbortController().signal;
  const plain = await encodeModel(
    { ...input, stream: false },
    { content: 'plain' },
    'plain',
    0,
    signal,
    () => {},
  ).json();
  assert.equal(Object.hasOwn(plain, 'usage'), false);
  const usage = { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 };
  const measured = await encodeModel(
    { ...input, stream: false },
    { content: 'measured', usage },
    'measured',
    0,
    signal,
    () => {},
  ).json();
  assert.deepEqual(measured.usage, usage);
});
