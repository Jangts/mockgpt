/**
 * Error classification and fallback extraction in the web text source.
 *
 * Uses the trusted `load` hook to inject pages and mocks the HTML parser/Readability to force the
 * degraded paths, checking that a failure is reported as a bounded `MOCK_WEB_*` code without
 * leaking private upstream text. Runs against the built output in `dist/`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MockGPT, responses } from '../dist/esm/index.js';
import { sources } from '../dist/esm/web.js';
import { breakWhile } from '../dist/esm/shared/utils.js';
import { DOMParser } from 'linkedom';
import { Readability } from '@mozilla/readability';
const input = { model: 'demo', messages: [{ role: 'user', content: 'hello' }] };
const bytes = (text) => new TextEncoder().encode(text);
const source = (options) =>
  new MockGPT({ rules: [{ generator: sources.web({ url: 'https://example.com', ...options }) }] });
const html =
  '<html><head><title>Original title</title></head><body><nav>navigation</nav><p>readable body</p></body></html>';
const load = async (url) => ({ url: url.href, bytes: bytes(html), contentType: 'text/html' });

test('regex nonmatches fall through and response IDs and default rejection reasons are validated', async () => {
  const mock = new MockGPT({
    rules: [{ prompt: /unmatched/, generator: 'wrong' }, { generator: 'right' }],
  });
  assert.equal(await mock.generate(input), 'right');
  assert.throws(() => responses.toolCalls([{ name: 'read', arguments: {}, id: 7 }]), {
    code: 'MOCK_CONFIG',
  });
  assert.throws(() => breakWhile(true), /Check failed/);
});

test('readability exceptions fall back to sanitized document content', async (t) => {
  t.mock.method(Readability.prototype, 'parse', () => {
    throw Error('parser failure');
  });
  const mock = source({ load });
  assert.equal(await mock.generate(input), 'readable body');
  assert.equal(mock.records[0].metadata.readabilityFallback, true);
  assert.equal(mock.records[0].metadata.extraction, 'fallback');
});

test('readability can omit a title and long sources report bounded distributed sampling', async (t) => {
  t.mock.method(Readability.prototype, 'parse', () => ({ textContent: 'readable body' }));
  const mock = source({ load });
  assert.equal(await mock.generate(input), 'readable body');
  assert.equal(mock.records[0].metadata.title, 'Original title');
  const sampled = source({
    maxChars: 10,
    load: async (url) => ({
      url: url.href,
      bytes: bytes('long source content '.repeat(20)),
      contentType: 'text/plain',
    }),
  });
  assert.ok(Array.from(await sampled.generate(input)).length <= 10);
  assert.equal(sampled.records[0].metadata.sourceSampling, 'head-middle-tail');
});

test('fallback extraction handles documents without a body and without any text node', async (t) => {
  let empty = false;
  const doc = {
    querySelector: () => null,
    querySelectorAll: () => [],
    cloneNode() {
      return this;
    },
    body: null,
    get documentElement() {
      return empty ? null : { textContent: 'fallback text' };
    },
  };
  t.mock.method(DOMParser.prototype, 'parseFromString', () => ({ defaultView: { document: doc } }));
  t.mock.method(Readability.prototype, 'parse', () => null);
  assert.equal(await source({ load }).generate(input), 'fallback text');
  empty = true;
  await assert.rejects(source({ load }).generate(input), { code: 'MOCK_WEB_EMPTY' });
});

test('untyped transport and extraction failures receive safe source errors with bounded diagnostic codes', async (t) => {
  for (const code of ['ECONNRESET', 'invalid private code', undefined]) {
    const mock = source({
      load: async () => {
        throw Object.assign(Error('PRIVATE'), { code });
      },
    });
    await assert.rejects(
      mock.generate(input),
      (error) => error.code === 'MOCK_WEB_FETCH' && !error.message.includes('PRIVATE'),
    );
    assert.equal(mock.records[0].metadata.transportCode, code === 'ECONNRESET' ? code : undefined);
  }
  t.mock.method(DOMParser.prototype, 'parseFromString', () => {
    throw Error('PRIVATE');
  });
  await assert.rejects(source({ load }).generate(input), { code: 'MOCK_WEB_EXTRACT' });
});
