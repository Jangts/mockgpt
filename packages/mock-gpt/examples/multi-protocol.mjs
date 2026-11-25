/** One ordered scenario encoded as four native protocols. No network or credentials required. */
import assert from 'node:assert/strict';
import { MockGPT, responses, createMockDuplex } from '@jangts/mock-gpt';

const mock = new MockGPT({
  rules: [{ generator: responses.scenario({ items: [{ type: 'text', text: 'hello' }] }) }],
});
const cases = [
  ['/v1/responses', { model: 'mock', input: 'Hello' }],
  [
    '/v1/messages',
    { model: 'mock', max_tokens: 64, messages: [{ role: 'user', content: 'Hello' }] },
  ],
  [
    '/v1beta/models/mock:generateContent',
    { contents: [{ role: 'user', parts: [{ text: 'Hello' }] }] },
  ],
  ['/v1beta/interactions', { model: 'mock', input: 'Hello' }],
];
for (const [path, body] of cases) {
  const response = await mock.fetch(`https://mock.invalid${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200, path);
  assert.match(JSON.stringify(await response.json()), /hello/, path);
}
const controller = new AbortController();
controller.abort();
await assert.rejects(
  mock.generate(
    { model: 'mock', messages: [{ role: 'user', content: 'Hello' }] },
    { signal: controller.signal },
  ),
);
const duplex = createMockDuplex(mock, { protocol: 'openai-realtime' });
await duplex.send({ type: 'session.update', session: {} });
const frames = duplex.frames[Symbol.asyncIterator]();
assert.equal((await frames.next()).value.type, 'session.updated');
duplex.close();
assert.equal(mock.stats.activeConnections, 0);
console.log('four protocols, cancellation and duplex setup passed');
