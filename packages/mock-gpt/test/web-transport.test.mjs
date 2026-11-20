/**
 * Pinned-address HTTP transport (`sources/http.ts`) against a real local server.
 *
 * `requestAtAddress` deliberately skips the public-address policy, so a loopback server can stand
 * in for a remote host while compression, byte limits, progress and deadlines are checked for
 * real. Runs against the built output in `dist/`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { requestAtAddress, pageHeaders } from '../dist/esm/sources/http.js';

async function serve(t, handle) {
  const server = createServer(handle);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  // The hostname is intentionally not the loopback name: the address is pinned, not resolved.
  return new URL(`http://example.com:${server.address().port}/article`);
}
const pinned = { address: '127.0.0.1', family: 4 };
const options = (progress) => ({
  maxBytes: 4096,
  maxRedirects: 3,
  headers: pageHeaders(),
  progress,
});

test('ordinary HTTP transport reads the entire compressed article and records real response progress', async (t) => {
  const html =
    '<html><body><article>这是完整正文。普通 HTTP 请求无需浏览器即可读取。</article></body></html>';
  const encoded = gzipSync(html);
  let requests = 0;
  // Test the internal pinned-address transport with an isolated local server, not the public URL policy.
  const url = await serve(t, (request, response) => {
    requests++;
    assert.match(request.headers['accept-encoding'], /gzip/);
    assert.equal(request.headers.cookie, undefined);
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-encoding': 'gzip',
    });
    response.end(encoded);
  });
  const progress = { webStage: 'dns', receivedBytes: 0 };
  const page = await requestAtAddress(url, pinned, AbortSignal.timeout(2000), options(progress));
  assert.equal(new TextDecoder().decode(page.bytes), html);
  assert.equal(page.status, 200);
  assert.equal(requests, 1);
  assert.deepEqual(progress, {
    webStage: 'body',
    receivedBytes: encoded.length,
    upstreamStatus: 200,
  });
});

test('a stalled 200 body retains its status and downloaded bytes when the total deadline expires', async (t) => {
  const partial = '正文尚未下载完成';
  let requests = 0;
  const url = await serve(t, (_request, response) => {
    requests++;
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.write(partial);
  });
  const progress = { webStage: 'dns', receivedBytes: 0 };
  const signal = AbortSignal.timeout(150);
  await assert.rejects(requestAtAddress(url, pinned, signal, options(progress)));
  assert.equal(signal.aborted, true);
  assert.equal(requests, 1);
  assert.deepEqual(progress, {
    webStage: 'body',
    receivedBytes: Buffer.byteLength(partial),
    upstreamStatus: 200,
  });
});

test('unrecognized content encodings reject without invoking object prototype members', async (t) => {
  const url = await serve(t, (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'constructor' });
    response.end('article');
  });
  await assert.rejects(requestAtAddress(url, pinned, AbortSignal.timeout(2000), options()), {
    code: 'MOCK_WEB_ENCODING',
  });
});

test('the decompressed byte limit is a web source failure', async (t) => {
  const encoded = gzipSync('a'.repeat(5000));
  const url = await serve(t, (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip' });
    response.end(encoded);
  });
  await assert.rejects(requestAtAddress(url, pinned, AbortSignal.timeout(2000), options()), {
    code: 'MOCK_WEB_LIMIT',
  });
});
