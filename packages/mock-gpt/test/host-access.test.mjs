/**
 * `Host`/`Origin` enforcement in the Node handler, without opening a socket.
 *
 * A minimal `Readable` request and an `EventEmitter` response stub let the test inspect the status
 * and headers the handler would send, and whether the mock was consulted at all. Runs against the
 * built output in `dist/`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { MockGPT } from '../dist/esm/index.js';
import { createMockHandler } from '../dist/esm/node.js';
import { checkHost, configuredHosts } from '../dist/esm/node/access.js';

async function call(headers, options = {}) {
  const mock = new MockGPT({ rules: [{ generator: 'hello' }] });
  const request = Readable.from([
    Buffer.from(JSON.stringify({ model: 'demo', messages: [{ role: 'user', content: 'hello' }] })),
  ]);
  Object.assign(request, {
    url: '/v1/chat/completions',
    method: 'POST',
    headers,
    complete: true,
    socket: { localAddress: '127.0.0.1' },
  });
  let finish;
  const completed = new Promise((resolve) => {
    finish = resolve;
  });
  class Reply extends EventEmitter {
    headersSent = false;
    destroyed = false;
    writableFinished = false;
    headers = {};
    setHeader(name, value) {
      this.headers[name] = value;
    }
    writeHead(status, headers) {
      this.status = status;
      this.headersSent = true;
      Object.assign(this.headers, headers);
    }
    write() {
      return true;
    }
    end() {
      this.writableFinished = true;
      finish(this);
    }
    destroy() {
      this.destroyed = true;
      finish(this);
    }
  }
  createMockHandler({ mock, ...options })(request, new Reply());
  const response = await completed;
  return { response, calls: mock.records.length };
}
test('matching attacker Host and Origin never authorize an unregistered hostname', async () => {
  for (const options of [{}, { allowedOrigins: ['http://evil.invalid:4317'] }]) {
    const { response, calls } = await call(
      { host: 'evil.invalid:4317', origin: 'http://evil.invalid:4317' },
      options,
    );
    assert.equal(response.status, 403);
    assert.equal(calls, 0);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
});
test('trusted hosts still enforce same-origin and explicit cross-origin permissions', async () => {
  assert.equal(
    (await call({ host: 'localhost:4317', origin: 'http://localhost:4317' })).response.status,
    200,
  );
  assert.equal(
    (await call({ host: 'localhost:4317', origin: 'https://localhost:4317' })).response.status,
    403,
  );
  assert.equal(
    (
      await call(
        { host: 'localhost:4317', origin: 'http://client.invalid' },
        { allowedOrigins: ['http://client.invalid'] },
      )
    ).response.status,
    200,
  );
  assert.equal(
    (
      await call(
        { host: 'mock.example:4317', origin: 'http://mock.example:4317' },
        { allowedHosts: ['mock.example'] },
      )
    ).response.status,
    200,
  );
});
test('socket addresses support wildcard listeners and reject malformed host authorities', () => {
  for (const [host, local] of [
    ['192.168.1.2:4317', '192.168.1.2'],
    ['192.168.1.2:4317', '::ffff:192.168.1.2'],
    ['[::1]:4317', '::1'],
  ]) {
    assert.equal(checkHost(host, local, new Set(), new Set()), host);
  }
  for (const host of [
    undefined,
    'evil@localhost:4317',
    'localhost/path',
    'localhost?query',
    'localhost#hash',
    'localhost\\evil',
  ])
    assert.throws(() => checkHost(host, '127.0.0.1', configuredHosts(['localhost']), new Set()), {
      code: 'MOCK_HOST',
    });
});
