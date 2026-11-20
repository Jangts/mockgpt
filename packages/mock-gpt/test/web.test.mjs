/**
 * End-to-end behaviour of `sources.web` inside the mock.
 *
 * Uses the injected `load` hook so page classification, text extraction, diagnostics, fallbacks
 * and timeouts can be exercised without any network access. Runs against the built output in
 * `dist/`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockGPT, generators } from '../dist/esm/index.js';
import { sources, isPublicAddress } from '../dist/esm/web.js';
const endpoint = 'http://mock/v1/chat/completions';
const call = (mock) =>
  mock.fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({
      model: 'demo',
      messages: [{ role: 'user', content: '总结 https://example.com/article' }],
    }),
  });
const html =
  '<html><head><title>咖啡馆</title></head><body><nav>菜单广告</nav><article><h1>咖啡馆</h1><p>我们在这里阅读和品尝咖啡。咖啡馆欢迎大家一起分享故事。</p><p>每周三有音乐活动。人们交流彼此的想法，留下温暖的记忆。</p></article><script>throw new Error("never execute")</script></body></html>';
test('long URLs reach the loader intact while diagnostic URLs remain bounded', async () => {
  const url = 'https://example.com/article?q=' + 'x'.repeat(5000);
  for (const status of [200, 403]) {
    const mock = new MockGPT({
      rules: [
        {
          generator: sources.web({
            url,
            fallback: 'unavailable',
            load: async (target) => {
              assert.equal(target.href, url);
              return {
                url: target.href,
                bytes: new TextEncoder().encode('Readable article.'),
                contentType: 'text/plain',
                status,
              };
            },
          }),
        },
      ],
    });
    const result = await mock.generate({
      model: 'demo',
      messages: [{ role: 'user', content: 'read' }],
    });
    assert.equal(result, status === 200 ? 'Readable article.' : 'unavailable');
    const { metadata } = mock.records[0];
    assert.equal(metadata.urlTruncated, true);
    assert.ok(metadata.requestedUrl.length <= 512);
    if (status === 200) assert.ok(metadata.finalUrl.length <= 512);
    else assert.equal(metadata.sourceError, 'MOCK_WEB_HTTP');
  }
});
test('web source retrieves article through an injected offline transport and summarizes it', async () => {
  let fetched = 0;
  const mock = new MockGPT({
    rules: [
      {
        generator: generators.summary({
          source: sources.web({
            load: async (url) => {
              fetched++;
              return {
                url: url.href,
                bytes: new TextEncoder().encode(html),
                contentType: 'text/html; charset=utf-8',
              };
            },
          }),
        }),
      },
    ],
  });
  const result = await (await call(mock)).json();
  assert.equal(fetched, 1);
  assert.match(result.choices[0].message.content, /咖啡|阅读/);
  assert.doesNotMatch(result.choices[0].message.content, /never execute/);
  assert.equal(mock.records[0].metadata.finalUrl, 'https://example.com/article');
});
test('inert component templates and their CSS are excluded before article extraction', async () => {
  // One and many repetitions cover both the normal article and the oversized-article path.
  for (const repetitions of [1, 30]) {
    const page = `<html><head><title>JavaScript 简介</title></head><body><article><h1>JavaScript 简介</h1><p>${'JavaScript 可以为网页提供交互能力。'.repeat(repetitions)}</p><template shadowrootmode="open"><style>.button{--csstools-light-dark-toggle:var(--color-green-20)}</style><span>template-only text</span></template><script>script-only text</script><p>通过控制台可以体验这门语言。</p></article></body></html>`;
    const source = sources.web({
      load: async (url) => ({
        url: url.href,
        bytes: new TextEncoder().encode(page),
        contentType: 'text/html',
        status: 200,
      }),
    });
    const mock = new MockGPT({ rules: [{ generator: source }] });
    const text = (await (await call(mock)).json()).choices[0].message.content;
    assert.match(text, /JavaScript 可以为网页提供交互能力/);
    assert.doesNotMatch(text, /--csstools|--color-green|template-only|script-only/);
  }
});
test('web input, mime, empty source and byte limits fail explicitly', async () => {
  for (const page of [
    { bytes: new TextEncoder().encode(''), contentType: 'text/plain' },
    { bytes: new TextEncoder().encode('PDF'), contentType: 'application/pdf' },
  ]) {
    const mock = new MockGPT({
      rules: [
        {
          generator: generators.summary({
            source: sources.web({ load: async (url) => ({ ...page, url: url.href }) }),
          }),
        },
      ],
    });
    await assert.rejects(call(mock));
  }
  const mock = new MockGPT({
    rules: [
      {
        generator: generators.summary({ source: sources.web({ url: 'http://127.0.0.1/private' }) }),
      },
    ],
  });
  await assert.rejects(call(mock), { code: 'MOCK_WEB_TARGET' });
});
test('an asynchronous URL selector fails without starting transport or leaking its rejection', async () => {
  let loaded = false;
  const mock = new MockGPT({
    rules: [
      {
        generator: sources.web({
          url: async () => {
            throw new Error('URL selector rejected');
          },
          load: async () => {
            loaded = true;
            throw new Error('must not run');
          },
        }),
      },
    ],
  });
  await assert.rejects(call(mock), { code: 'MOCK_CONFIG' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loaded, false);
  assert.equal(mock.activeRequests, 0);
});
test('an explicit URL selector cannot silently fall back to the prompt when it returns undefined', async () => {
  let loaded = false;
  const mock = new MockGPT({
    rules: [
      {
        generator: sources.web({
          url: () => undefined,
          load: async () => {
            loaded = true;
            throw new Error('must not run');
          },
        }),
      },
    ],
  });
  await assert.rejects(call(mock), { code: 'MOCK_CONFIG' });
  assert.equal(loaded, false);
});
test('address policy rejects local, mapped and reserved destinations', () => {
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '192.168.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '2002:7f00:1::',
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('93.184.216.34'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});
test('web source supports GBK, fallback text and timeout without falling back to fake success', async () => {
  const mock = new MockGPT({
    rules: [
      {
        generator: generators.summary({
          source: sources.web({
            load: async (url) => ({
              url: url.href,
              bytes: new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]),
              contentType: 'text/plain; charset=gbk',
            }),
          }),
        }),
      },
    ],
  });
  assert.equal((await (await call(mock)).json()).choices[0].message.content, '你好');
  const timed = new MockGPT({
    rules: [
      {
        generator: generators.summary({
          source: sources.web({ timeoutMs: 5, load: () => new Promise(() => {}) }),
        }),
      },
    ],
  });
  const keepAlive = setTimeout(() => {}, 100);
  try {
    await assert.rejects(call(timed));
  } finally {
    clearTimeout(keepAlive);
  }
  assert.equal(timed.activeRequests, 0);
});
test('upstream refusal preserves the source status and records the failed retrieval', async () => {
  const { MockGPTError } = await import('../dist/esm/index.js');
  const mock = new MockGPT({
    rules: [
      {
        generator: generators.summary({
          source: sources.web({
            load: async () => {
              throw new MockGPTError('MOCK_WEB_HTTP', 'Web source returned HTTP 403', 502, {
                upstreamStatus: 403,
              });
            },
          }),
        }),
      },
    ],
  });
  await assert.rejects(
    call(mock),
    (error) =>
      error.code === 'MOCK_WEB_HTTP' &&
      error.status === 502 &&
      error.details.upstreamStatus === 403,
  );
  assert.equal(mock.records[0].status, 'error');
  assert.equal(mock.records[0].metadata.upstreamStatus, 403);
  assert.equal(mock.records[0].metadata.sourceError, 'MOCK_WEB_HTTP');
});
test('page request profiles use browser-compatible headers and bounded header overrides', async () => {
  const { pageHeaders } = await import('../dist/esm/sources/http.js');
  const browser = pageHeaders();
  assert.match(browser['user-agent'], /^Mozilla\/5\.0 .*Chrome\/.*Safari\//);
  assert.match(browser.accept, /application\/xhtml\+xml/);
  assert.ok(browser['accept-language']);
  assert.deepEqual(pageHeaders({}, 'crawler'), browser);
  assert.equal(
    pageHeaders({ 'Accept-Language': 'en-US,en;q=0.8' })['accept-language'],
    'en-US,en;q=0.8',
  );
  for (const headers of [
    { Cookie: 'not forwarded' },
    { Authorization: 'not forwarded' },
    { Host: 'elsewhere' },
    { 'User-Agent': 'bad\r\nvalue' },
  ])
    assert.throws(() => pageHeaders(headers), { code: 'MOCK_CONFIG' });
});
test('verification pages never become successful summaries even when the status is 200', async () => {
  for (const status of [200, 403]) {
    const mock = new MockGPT({
      rules: [
        {
          generator: generators.summary({
            source: sources.web({
              load: async (url) => ({
                url: url.href,
                bytes: new TextEncoder().encode(
                  '<html><head><title>百度安全验证</title></head><body>请完成验证</body></html>',
                ),
                contentType: 'text/html',
                status,
              }),
            }),
          }),
        },
      ],
    });
    await assert.rejects(
      call(mock),
      (error) =>
        error.code === 'MOCK_WEB_CHALLENGE' &&
        error.details.upstreamStatus === status &&
        error.details.pageTitle === '百度安全验证',
    );
    assert.equal(mock.records[0].metadata.reason, 'verification-required');
  }
  const mock = new MockGPT({
    rules: [
      {
        generator: generators.summary({
          source: sources.web({
            load: async (url) => ({
              url: url.href,
              bytes: new TextEncoder().encode(
                '<html><head><title>设计验证码的文章</title></head><body><article><p>这里讨论验证码的历史和设计。</p></article></body></html>',
              ),
              contentType: 'text/html',
              status: 200,
            }),
          }),
        }),
      },
    ],
  });
  assert.equal((await call(mock)).status, 200);
});
test('failed IP connections use the next validated address, but an HTTP refusal never retries', async () => {
  const { withAddressFallback } = await import('../dist/esm/sources/http.js');
  const addresses = [
    { address: '93.184.216.34', family: 4 },
    { address: '93.184.216.35', family: 4 },
  ];
  let attempts = 0;
  const result = await withAddressFallback(
    addresses,
    new AbortController().signal,
    async (address) => {
      attempts++;
      if (attempts === 1) throw Object.assign(new Error('unreachable'), { code: 'ENETUNREACH' });
      return address.address;
    },
  );
  assert.equal(result, addresses[1].address);
  assert.equal(attempts, 2);
  attempts = 0;
  const refused = await withAddressFallback(addresses, new AbortController().signal, async () => {
    attempts++;
    return { status: 403 };
  });
  assert.equal(refused.status, 403);
  assert.equal(attempts, 1);
});
test('HTML fragments are normalized and script-only documents are classified as requiring rendering', async () => {
  const source = (html) =>
    new MockGPT({
      rules: [
        {
          generator: generators.summary({
            source: sources.web({
              load: async (url) => ({
                url: url.href,
                bytes: new TextEncoder().encode(html),
                contentType: 'text/html',
                status: 200,
              }),
            }),
          }),
        },
      ],
    });
  assert.match(
    (await (await call(source('<p>咖啡馆欢迎大家来阅读。</p>'))).json()).choices[0].message.content,
    /咖啡馆/,
  );
  const scripted = source('<script>setTimeout(() => location.reload(), 1000)</script>');
  await assert.rejects(call(scripted), { code: 'MOCK_WEB_RENDER_REQUIRED' });
  assert.equal(scripted.records[0].metadata.stage, 'extract');
});

test('titleless firewall refusals preserve upstream status and never become summaries', async () => {
  const page =
    '<html><body><h1>当前访问已被防火墙暂停使用数小时</h1><p>疑似攻击已被拦截。Attack has been blocked.</p></body></html>';
  for (const status of [403, 567]) {
    const mock = new MockGPT({
      rules: [
        {
          generator: generators.summary({
            source: sources.web({
              load: async (url) => ({
                url: url.href,
                contentType: 'text/html',
                status,
                bytes: new TextEncoder().encode(page),
              }),
            }),
          }),
        },
      ],
    });
    await assert.rejects(
      call(mock),
      (error) =>
        error.code === 'MOCK_WEB_BLOCKED' &&
        error.status === 502 &&
        error.details.upstreamStatus === status &&
        error.details.reason === 'firewall-denied',
    );
    assert.equal(mock.records[0].metadata.sourceError, 'MOCK_WEB_BLOCKED');
    assert.equal(mock.records[0].metadata.upstreamStatus, status);
    assert.equal(mock.records[0].status, 'error');
  }
});
test('nonstandard HTTP status alone is not evidence of a firewall, and normal security articles remain readable', async () => {
  const create = (status, body) =>
    new MockGPT({
      rules: [
        {
          generator: generators.summary({
            source: sources.web({
              load: async (url) => ({
                url: url.href,
                contentType: 'text/html',
                status,
                bytes: new TextEncoder().encode(body),
              }),
            }),
          }),
        },
      ],
    });
  await assert.rejects(
    call(create(567, '<html><body>Temporary upstream failure.</body></html>')),
    (error) => error.code === 'MOCK_WEB_HTTP' && error.details.upstreamStatus === 567,
  );
  await assert.rejects(
    call(
      create(
        567,
        '<html><body>暂不可用<script>const sample = "Web Application Firewall: Access Denied";</script></body></html>',
      ),
    ),
    (error) => error.code === 'MOCK_WEB_HTTP',
  );
  const article = create(
    200,
    '<html><body><article><h1>防火墙配置说明</h1><p>日志出现 Access Denied 或 Attack has been blocked 时，应核实策略。本文介绍 Web Application Firewall 的日常维护。</p></article></body></html>',
  );
  assert.equal((await call(article)).status, 200);
});

test('successful authentication redirects are not summarized as the requested article', async () => {
  const mock = new MockGPT({
    rules: [
      {
        generator: generators.summary({
          source: sources.web({
            load: async () => ({
              url: 'https://example.com/signin?next=%2Farticle&token=do-not-log',
              status: 200,
              contentType: 'text/html',
              bytes: new TextEncoder().encode(
                '<html><body><form>请登录<input type="password"></form></body></html>',
              ),
            }),
          }),
        }),
      },
    ],
  });
  await assert.rejects(
    call(mock),
    (error) =>
      error.code === 'MOCK_WEB_AUTH_REQUIRED' &&
      error.details.reason === 'authentication-redirect' &&
      error.details.finalUrl === 'https://example.com/signin',
  );
  assert.equal(mock.records[0].status, 'error');
  assert.equal(mock.records[0].metadata.sourceError, 'MOCK_WEB_AUTH_REQUIRED');
  assert.ok(!JSON.stringify(mock.records).includes('do-not-log'));
});
test('an explicitly requested login page and an ordinary login documentation path remain readable', async () => {
  for (const pathname of ['/signin', '/guides/login']) {
    const url = 'https://example.com' + pathname;
    const mock = new MockGPT({
      rules: [
        {
          generator: generators.summary({
            source: sources.web({
              url,
              load: async () => ({
                url,
                status: 200,
                contentType: 'text/html',
                bytes: new TextEncoder().encode(
                  '<html><body><article><h1>登录使用说明</h1><p>这里说明登录页面的使用方法和交互。</p></article></body></html>',
                ),
              }),
            }),
          }),
        },
      ],
    });
    assert.equal((await call(mock)).status, 200);
  }
});

test('explicit web fallback preserves real summaries and records failed reads as replacement text', async () => {
  const fallback = '我目前不支持访问实时网页。你可以把网页正文发给我，我可以帮你总结。';
  const make = (load) =>
    new MockGPT({
      rules: [{ generator: generators.summary({ source: sources.web({ load, fallback }) }) }],
    });
  const readable = make(async (url) => ({
    url: url.href,
    bytes: new TextEncoder().encode(html),
    contentType: 'text/html',
    status: 200,
  }));
  const summary = (await (await call(readable)).json()).choices[0].message.content;
  assert.match(summary, /咖啡|阅读/);
  assert.notEqual(summary, fallback);
  assert.equal(readable.records[0].metadata.sourceFallback, undefined);
  for (const [status, page, code] of [
    [403, '<p>Forbidden</p>', 'MOCK_WEB_HTTP'],
    [
      200,
      '<html><head><title>百度安全验证</title></head><body>请完成验证</body></html>',
      'MOCK_WEB_CHALLENGE',
    ],
    [200, '', 'MOCK_WEB_EMPTY'],
  ]) {
    const mock = make(async (url) => ({
      url: url.href,
      bytes: new TextEncoder().encode(page),
      contentType: 'text/html',
      status,
    }));
    const response = await call(mock);
    assert.equal(response.status, 200);
    // Summary may normalize sentence spacing; the unsupported reply must remain intact.
    assert.equal((await response.json()).choices[0].message.content.replace(/\s+/gu, ''), fallback);
    assert.equal(mock.records[0].metadata.sourceFallback, true);
    assert.equal(mock.records[0].metadata.sourceError, code);
    if (status === 403) assert.equal(mock.records[0].metadata.upstreamStatus, 403);
  }
});

test('web timeout fallback is a normal streamed model reply with a success terminator', async () => {
  const fallback = '我目前不支持访问实时网页。';
  const mock = new MockGPT({
    stream: { chunkSize: 2 },
    rules: [
      {
        generator: generators.summary({
          source: sources.web({ timeoutMs: 5, fallback, load: () => new Promise(() => {}) }),
        }),
      },
    ],
  });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const response = await mock.fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        model: 'demo',
        stream: true,
        messages: [{ role: 'user', content: '总结 https://example.com/article' }],
      }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    const data = await response.text();
    assert.match(data, /data: \[DONE\]/);
    const chunks = data
      .split('\n\n')
      .filter((item) => item.startsWith('data: ') && !item.includes('[DONE]'))
      .map((item) => JSON.parse(item.slice(6)));
    assert.ok(chunks.length > 2);
    assert.equal(chunks.map((item) => item.choices?.[0]?.delta?.content ?? '').join(''), fallback);
    assert.equal(mock.records[0].metadata.sourceError, 'MOCK_WEB_TIMEOUT');
    assert.equal(mock.records[0].metadata.sourceFallback, true);
    assert.equal(mock.activeRequests, 0);
  } finally {
    clearTimeout(keepAlive);
  }
});

test('web fallback does not consume caller cancellation or a rejected destination', async () => {
  const controller = new AbortController();
  let began;
  const started = new Promise((resolve) => {
    began = resolve;
  });
  const mock = new MockGPT({
    rules: [
      {
        generator: generators.summary({
          source: sources.web({
            fallback: '我目前不支持访问实时网页。',
            load: () => {
              began();
              return new Promise(() => {});
            },
          }),
        }),
      },
    ],
  });
  const pending = mock.fetch(endpoint, {
    method: 'POST',
    signal: controller.signal,
    body: JSON.stringify({
      model: 'demo',
      messages: [{ role: 'user', content: '总结 https://example.com/article' }],
    }),
  });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await started;
  controller.abort();
  await rejected;
  assert.equal(mock.records[0].status, 'cancelled');
  assert.equal(mock.records[0].metadata.sourceFallback, undefined);
  assert.equal(mock.activeRequests, 0);
  const { MockGPTError } = await import('../dist/esm/index.js');
  const blocked = new MockGPT({
    rules: [
      {
        generator: generators.summary({
          source: sources.web({
            fallback: 'unsupported',
            load: async () => {
              throw new MockGPTError('MOCK_WEB_TARGET', 'Destination rejected');
            },
          }),
        }),
      },
    ],
  });
  await assert.rejects(call(blocked), { code: 'MOCK_WEB_TARGET' });
  assert.equal(blocked.records[0].metadata.sourceFallback, undefined);
});
