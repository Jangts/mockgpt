/**
 * Lifecycle and HTTP behaviour of the standalone `createMockServer`.
 *
 * Covers concurrent start/close calls, restart, status mapping, cancellation on shutdown and the
 * fact that no UI or static route exists. Runs against the built output in `dist/`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockGPT, responses } from '../dist/esm/index.js';
import { createMockServer } from '../dist/esm/node.js';
const body = JSON.stringify({ model: 'demo', messages: [{ role: 'user', content: '你好' }] });
test('duplicate or concurrent starts reject without changing a running server, and restart remains possible', async (t) => {
  const server = createMockServer({ mock: new MockGPT({ rules: [{ generator: 'hello' }] }) });
  t.after(() => server.close());
  const starting = server.listen({ host: 'localhost', port: 0 });
  await assert.rejects(server.listen({ host: 'not-a-bound-host.invalid', port: 0 }), {
    code: 'MOCK_ACTIVE',
  });
  const address = await starting;
  await assert.rejects(server.listen({ host: 'not-a-bound-host.invalid', port: 0 }), {
    code: 'MOCK_ACTIVE',
  });
  const response = await fetch(address.url + '/v1/chat/completions', {
    method: 'POST',
    body,
    headers: { host: `localhost:${address.port}` },
  });
  assert.equal(response.status, 200);
  await server.close();
  const restarted = await server.listen({ port: 0 });
  assert.equal(
    (await fetch(restarted.url + '/v1/chat/completions', { method: 'POST', body })).status,
    200,
  );
});
test('close waits for pending startup and shares its completion with concurrent closes', async (t) => {
  const server = createMockServer({ mock: new MockGPT({ rules: [{ generator: 'hello' }] }) });
  t.after(() => server.close());
  const starting = server.listen({ host: 'localhost', port: 0 });
  const closing = server.close(),
    alsoClosing = server.close();
  await assert.rejects(server.listen({ port: 0 }), { code: 'MOCK_ACTIVE' });
  await starting;
  await Promise.all([closing, alsoClosing]);
  const address = await server.listen({ port: 0 });
  assert.equal(
    (await fetch(address.url + '/v1/chat/completions', { method: 'POST', body })).status,
    200,
  );
});
test('standalone shell serves JSON/SSE and never serves a UI', async (t) => {
  const server = createMockServer({ mock: new MockGPT({ rules: [{ generator: 'hello' }] }) });
  const address = await server.listen({ port: 0 });
  t.after(() => server.close());
  const request = (data = body, headers = {}) =>
    fetch(address.url + '/v1/chat/completions', { method: 'POST', body: data, headers });
  assert.equal((await request()).status, 200);
  const stream = await request(JSON.stringify({ ...JSON.parse(body), stream: true }));
  assert.match(await stream.text(), /data: \[DONE\]/);
  assert.equal((await fetch(address.url + '/playground')).status, 404);
  assert.equal((await request(body, { origin: 'https://elsewhere.invalid' })).status, 403);
  assert.equal((await request('{')).status, 400);
  assert.equal((await fetch(address.url + '/unknown')).status, 404);
});
test('HTTP shell maps local configuration errors into HTTP errors, no UI is bundled', async (t) => {
  const server = createMockServer({ mock: new MockGPT({ rules: [] }) });
  const { url } = await server.listen({ port: 0 });
  t.after(() => server.close());
  const failed = await fetch(url + '/v1/chat/completions', { method: 'POST', body });
  assert.equal(failed.status, 500);
  assert.equal((await failed.json()).error.code, 'MOCK_RULE_NOT_FOUND');
  assert.equal((await fetch(url + '/playground')).status, 404);
});
test('closing a service cancels active streams after its grace period', async () => {
  const mock = new MockGPT({
    rules: [{ generator: responses.text('long', { intervalMs: 20_000 }) }],
  });
  // 30 ms keeps the grace period short while still exercising the forced-abort path.
  const server = createMockServer({ mock, closeTimeoutMs: 30 });
  const { url } = await server.listen({ port: 0 });
  const pending = fetch(url + '/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ ...JSON.parse(body), stream: true }),
  }).then((response) => response.text());
  const handled = assert.rejects(pending);
  await new Promise((resolve) => setTimeout(resolve, 30));
  await server.close();
  await handled;
  assert.equal(mock.activeRequests, 0);
});
test('intentional network faults close the HTTP connection rather than becoming an HTTP 500', async (t) => {
  const shell = createMockServer({
    mock: new MockGPT({ rules: [{ generator: responses.reject('network fault') }] }),
  });
  const { url } = await shell.listen({ port: 0 });
  t.after(() => shell.close());
  await assert.rejects(fetch(url + '/v1/chat/completions', { method: 'POST', body }));
});
test('web upstream status is distinct from the local HTTP error status', async (t) => {
  const { MockGPTError } = await import('../dist/esm/index.js');
  const shell = createMockServer({
    mock: new MockGPT({
      rules: [
        {
          generator: () => {
            throw new MockGPTError('MOCK_WEB_HTTP', 'Web source returned HTTP 403', 502, {
              upstreamStatus: 403,
            });
          },
        },
      ],
    }),
  });
  const { url } = await shell.listen({ port: 0 });
  t.after(() => shell.close());
  const response = await fetch(url + '/v1/chat/completions', { method: 'POST', body });
  assert.equal(response.status, 502);
  const payload = await response.json();
  assert.equal(payload.error.code, 'MOCK_WEB_HTTP');
  assert.equal(payload.error.details.upstreamStatus, 403);
  assert.equal(payload.choices, undefined);
});
