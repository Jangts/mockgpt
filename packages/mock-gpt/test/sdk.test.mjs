/**
 * Interoperability with the official `openai` SDK.
 *
 * Covers both integration modes: `fetch` injected into the client (no sockets) and a real
 * localhost HTTP server. Retries are disabled so a failing assertion cannot be masked by the
 * SDK's retry loop. Runs against the built output in `dist/`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { MockGPT, responses } from '../dist/esm/index.js';
import { createMockServer } from '../dist/esm/node.js';
const messages = [{ role: 'user', content: 'weather?' }];
test('independent official SDK consumes JSON, SSE and fragmented tool calls with injected fetch', async () => {
  const mock = new MockGPT({
    rules: [
      { when: (request) => request.messages.at(-1).role === 'tool', generator: '武汉今天晴。' },
      {
        prompt: 'weather?',
        generator: responses.toolCalls([{ name: 'weather', arguments: { city: '武汉' } }], {
          chunkSize: 1,
          wireChunkSize: 1,
        }),
      },
    ],
  });
  const client = new OpenAI({
    apiKey: 'mock',
    baseURL: 'https://mock.invalid/v1',
    fetch: mock.fetch,
    maxRetries: 0,
  });
  const result = await client.chat.completions.create({ model: 'demo', messages });
  const tool = result.choices[0].message.tool_calls[0];
  assert.equal(tool.function.name, 'weather');
  assert.equal(JSON.parse(tool.function.arguments).city, '武汉');
  const stream = await client.chat.completions.create({ model: 'demo', messages, stream: true });
  let args = '',
    reason;
  for await (const chunk of stream) {
    args += chunk.choices[0]?.delta.tool_calls?.[0]?.function.arguments ?? '';
    reason = chunk.choices[0]?.finish_reason ?? reason;
  }
  assert.equal(JSON.parse(args).city, '武汉');
  assert.equal(reason, 'tool_calls');
  const final = await client.chat.completions.create({
    model: 'demo',
    messages: [
      ...messages,
      result.choices[0].message,
      { role: 'tool', tool_call_id: tool.id, content: '{"weather":"sunny"}' },
    ],
  });
  assert.equal(final.choices[0].message.content, '武汉今天晴。');
});
test('independent SDK works across actual localhost HTTP without injected fetch', async (t) => {
  const shell = createMockServer({ mock: new MockGPT({ rules: [{ generator: 'HTTP works' }] }) });
  const address = await shell.listen({ port: 0 });
  t.after(() => shell.close());
  const client = new OpenAI({ apiKey: 'mock', baseURL: address.url + '/v1', maxRetries: 0 });
  const completion = await client.chat.completions.create({ model: 'demo', messages });
  assert.equal(completion.choices[0].message.content, 'HTTP works');
});
