/**
 * Configuration snapshot guarantees.
 *
 * Generators and web sources must capture their options when they are created, so a test that
 * mutates the options object afterwards cannot change an already-registered rule. Runs against the
 * built output in `dist/`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockGPT, generators } from '../dist/esm/index.js';
import { sources } from '../dist/esm/web.js';
const input = { model: 'demo', messages: [{ role: 'user', content: 'hello' }] };

test('text sources and reply templates are captured when their generators are created', async () => {
  const options = { source: '旧资料。', template: ({ text }) => `旧模板：${text}` };
  const title = generators.title(options),
    reply = generators.reply(options);
  options.source = '新资料。';
  options.template = () => '新模板';
  const mock = new MockGPT({ rules: [{ generator: generators.sequence([title, reply]) }] });
  assert.equal(await mock.generate(input), '旧资料。');
  assert.equal(await mock.generate(input), '旧模板：旧资料。');
});
test('web URL and trusted loader cannot be replaced through the original options object', async () => {
  let replaced = false;
  const options = {
    url: 'https://example.com/original',
    load: async (url) => ({
      url: url.href,
      contentType: 'text/plain',
      bytes: new TextEncoder().encode(url.pathname),
    }),
  };
  const source = sources.web(options);
  options.url = 'https://example.com/replaced';
  options.load = async () => {
    replaced = true;
    throw new Error('replacement loader ran');
  };
  const mock = new MockGPT({ rules: [{ generator: source }] });
  assert.equal(await mock.generate(input), '/original');
  assert.equal(replaced, false);
  assert.equal(mock.records[0].metadata.requestedUrl, 'https://example.com/original');
});
