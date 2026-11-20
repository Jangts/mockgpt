/**
 * Destination policy, redirect and transport-error handling for the web source.
 *
 * `node:http`, `node:https` and `node:dns/promises` are replaced with deterministic fakes, so
 * these tests never touch the network. `syncBuiltinESMExports` is required because the source
 * imports these bindings by name. Runs against the built output in `dist/`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import {
  readPublicPage,
  requestAtAddress,
  isPublicAddress,
  withAddressFallback,
  pageHeaders,
} from '../dist/esm/sources/http.js';
import { MockGPT, MockGPTError } from '../dist/esm/index.js';
import { sources } from '../dist/esm/web.js';

const options = { maxBytes: 4096, maxRedirects: 3, headers: pageHeaders() };
function transport(t, replies) {
  const calls = [];
  const fake = (url, settings, receive) => {
    calls.push({ url: url.href, settings });
    const request = new EventEmitter();
    request.end = () =>
      queueMicrotask(() => {
        const reply = replies.shift();
        if (reply?.error) {
          request.emit('error', reply.error);
          return;
        }
        const socket = new EventEmitter();
        request.emit('socket', socket);
        socket.emit('connect');
        socket.emit('secureConnect');
        const response = new PassThrough();
        // `status: undefined` means the reply carried no status metadata; 200 is only the default.
        response.statusCode = Object.hasOwn(reply ?? {}, 'status') ? reply.status : 200;
        response.headers = reply?.headers ?? { 'content-type': 'text/plain' };
        request.emit('response', response);
        receive(response);
        if (!response.destroyed)
          reply?.bodyError
            ? response.destroy(
                reply.bodyError === true ? new Error('body failed') : reply.bodyError,
              )
            : response.end(reply?.body ?? 'article');
      });
    return request;
  };
  t.mock.method(http, 'request', fake);
  t.mock.method(https, 'request', fake);
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  return calls;
}

test('public address policy rejects local, private, reserved and transition destinations', async () => {
  for (const address of [
    '127.0.0.1',
    '0.0.0.0',
    '10.1.2.3',
    '100.64.1.2',
    '169.254.169.254',
    '172.31.2.3',
    '192.168.0.1',
    '192.0.2.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    '2002:7f00:1::',
    '2001:db8::1',
    'not-an-ip',
  ])
    assert.equal(isPublicAddress(address), false, address);
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])
    assert.equal(isPublicAddress(address), true, address);
  const input = { model: 'test', messages: [{ role: 'user', content: 'hello' }] };
  for (const url of ['http://0x7f000001/', 'http://2130706433/', 'http://[::ffff:127.0.0.1]/']) {
    await assert.rejects(
      new MockGPT({
        rules: [{ generator: sources.web({ url, fallback: 'must not bypass policy' }) }],
      }).generate(input),
      { code: 'MOCK_WEB_TARGET' },
    );
  }
});

test('DNS answers are all validated before connecting and redirects revalidate every target', async (t) => {
  const calls = transport(t, [{ status: 302, headers: { location: 'http://127.0.0.1/private' } }]);
  t.mock.method(dns, 'lookup', async () => [
    { address: '8.8.8.8', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ]);
  syncBuiltinESMExports();
  await assert.rejects(
    readPublicPage(new URL('http://example.com'), new AbortController().signal, options),
    { code: 'MOCK_WEB_TARGET' },
  );
  assert.equal(calls.length, 0);
  await assert.rejects(
    readPublicPage(new URL('http://8.8.8.8'), new AbortController().signal, options),
    { code: 'MOCK_WEB_TARGET' },
  );
  assert.equal(calls.length, 1);
  let pinned;
  calls[0].settings.lookup('8.8.8.8', { all: true }, (_error, addresses) => {
    pinned = addresses;
  });
  assert.deepEqual(pinned, [{ address: '8.8.8.8', family: 4 }]);
});

test('redirect loops, missing locations, unsupported URLs and redirect budgets fail explicitly', async (t) => {
  const replies = [
    { status: 302, headers: { location: '/' } },
    { status: 302, headers: {} },
    { status: 302, headers: { location: 'http://[' } },
    { status: 302, headers: { location: 'http://1.1.1.1/' } },
    { status: 302, headers: { location: 'file:///private' } },
  ];
  transport(t, replies);
  const url = new URL('http://8.8.8.8/'),
    signal = new AbortController().signal;
  for (const code of ['MOCK_WEB_REDIRECT', 'MOCK_WEB_REDIRECT', 'MOCK_WEB_URL'])
    await assert.rejects(readPublicPage(url, signal, options), { code });
  await assert.rejects(readPublicPage(url, signal, { ...options, maxRedirects: 0 }), {
    code: 'MOCK_WEB_REDIRECT',
  });
  await assert.rejects(readPublicPage(url, signal, options), { code: 'MOCK_WEB_URL' });
});

test('pinned HTTP and TLS reads support compression, refusal prefixes and transport errors', async (t) => {
  const replies = [
    ...[
      ['gzip', gzipSync],
      ['deflate', deflateSync],
      ['br', brotliCompressSync],
    ].map(([encoding, encode]) => ({
      headers: { 'content-type': 'text/plain', 'content-encoding': encoding },
      body: encode('readable 🙂'),
    })),
    { status: 403, body: 'x'.repeat(5000) },
    { headers: { 'content-encoding': 'unknown' } },
    { error: Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' }) },
    { bodyError: true },
  ];
  const calls = transport(t, replies),
    progress = {},
    signal = new AbortController().signal;
  for (let i = 0; i < 3; i++) {
    const result = await requestAtAddress(
      new URL('https://example.com/'),
      { address: '8.8.8.8', family: 4 },
      signal,
      { ...options, progress },
    );
    assert.equal(new TextDecoder().decode(result.bytes), 'readable 🙂');
    assert.equal(progress.webStage, 'body');
  }
  const denied = await requestAtAddress(
    new URL('http://example.com/'),
    { address: '8.8.8.8', family: 4 },
    signal,
    { ...options, maxBytes: 10000 },
  );
  assert.equal(denied.status, 403);
  await assert.rejects(
    requestAtAddress(
      new URL('http://example.com/'),
      { address: '8.8.8.8', family: 4 },
      signal,
      options,
    ),
    { code: 'MOCK_WEB_ENCODING' },
  );
  await assert.rejects(
    requestAtAddress(
      new URL('http://example.com/'),
      { address: '8.8.8.8', family: 4 },
      signal,
      options,
    ),
    { code: 'ECONNREFUSED' },
  );
  await assert.rejects(
    requestAtAddress(
      new URL('http://example.com/'),
      { address: '8.8.8.8', family: 4 },
      signal,
      options,
    ),
    { code: 'MOCK_WEB_READ' },
  );
  assert.equal(calls.length, 7);
  let pinned;
  calls[0].settings.lookup('ignored', {}, (_error, address, family) => {
    pinned = { address, family };
  });
  assert.deepEqual(pinned, { address: '8.8.8.8', family: 4 });
});

test('address fallback is bounded and never retries HTTP or explicit cancellation failures', async () => {
  const addresses = Array.from({ length: 6 }, (_, index) => ({
    address: `8.8.8.${index}`,
    family: 4,
  }));
  const signal = new AbortController().signal;
  await assert.rejects(
    withAddressFallback([], signal, async () => {}),
    { code: 'MOCK_WEB_DNS' },
  );
  let attempts = 0;
  await assert.rejects(
    withAddressFallback(addresses, signal, async () => {
      attempts++;
      throw Object.assign(new Error('no route'), { code: 'EHOSTUNREACH' });
    }),
    { code: 'EHOSTUNREACH' },
  );
  assert.equal(attempts, 4);
  attempts = 0;
  await assert.rejects(
    withAddressFallback(addresses, signal, async () => {
      attempts++;
      throw new Error('HTTP refused');
    }),
  );
  assert.equal(attempts, 1);
  const controller = new AbortController(),
    reason = new Error('cancelled');
  await assert.rejects(
    withAddressFallback(addresses, controller.signal, async () => {
      controller.abort(reason);
      throw Object.assign(new Error(), { code: 'ECONNREFUSED' });
    }),
    (error) => error === reason,
  );
});

test('malformed upstream titles cannot turn a refusal into verification success', async () => {
  const html = '<title>unfinished '.repeat(4000);
  const mock = new MockGPT({
    rules: [
      {
        generator: sources.web({
          url: 'https://example.com',
          load: async (url) => ({
            url: url.href,
            status: 403,
            contentType: 'text/html',
            bytes: new TextEncoder().encode(html),
          }),
        }),
      },
    ],
  });
  await assert.rejects(
    mock.generate({ model: 'test', messages: [{ role: 'user', content: 'summarize' }] }),
    { code: 'MOCK_WEB_HTTP' },
  );
  assert.equal(mock.records[0].metadata.upstreamStatus, 403);
});

test('public reads expose HTTP progress and preserve missing metadata or bounded transport failures', async (t) => {
  const upstream = new MockGPTError('UPSTREAM', 'specific failure');
  transport(t, [
    { body: 'real article' },
    { status: undefined, headers: {} },
    { bodyError: upstream },
    { body: 'x'.repeat(5000) },
    { bodyError: true, status: 403 },
    { bodyError: true, headers: { 'content-encoding': 'gzip' } },
  ]);
  const mock = new MockGPT({ rules: [{ generator: sources.web({ url: 'http://8.8.8.8/' }) }] });
  assert.equal(
    await mock.generate({ model: 'test', messages: [{ role: 'user', content: 'read' }] }),
    'real article',
  );
  assert.equal(mock.records[0].metadata.transport, 'http');
  const page = await readPublicPage(
    new URL('http://8.8.8.8/'),
    new AbortController().signal,
    options,
  );
  assert.equal(page.status, 0);
  assert.equal(page.contentType, '');
  await assert.rejects(
    requestAtAddress(
      new URL('http://8.8.8.8/'),
      { address: '8.8.8.8', family: 4 },
      new AbortController().signal,
      options,
    ),
    (error) => error === upstream,
  );
  await assert.rejects(
    readPublicPage(new URL('http://8.8.8.8/'), new AbortController().signal, options),
    { code: 'MOCK_WEB_LIMIT' },
  );
  for (let i = 0; i < 2; i++)
    await assert.rejects(
      readPublicPage(new URL('http://8.8.8.8/'), new AbortController().signal, options),
      { code: 'MOCK_WEB_READ' },
    );
});
