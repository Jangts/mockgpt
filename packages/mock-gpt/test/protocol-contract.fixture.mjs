/**
 * Shared OpenAI wire assertions, imported by the SDK and adapter contract tests.
 *
 * The caller supplies a factory that builds a fetch implementation from a model output, so the
 * same independent assertions protect every transport from drifting. Not a test file itself:
 * `node --test` only picks up `*.test.mjs`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Register the shared contract tests.
 *
 * The same independent wire assertions protect SDK and app-owned adapters from drifting.
 *
 * @param name Label prefix distinguishing the transport under test.
 * @param create Builds a `fetch` implementation that replays the given model output.
 */
export function protocolContract(name, create) {
  const request = (fetch, signal) =>
    fetch('https://mock.invalid/v1/chat/completions', {
      method: 'POST',
      signal,
      body: JSON.stringify({
        model: 'demo',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
        stream_options: { include_usage: true },
      }),
    });
  test(`${name}: Unicode, tools, finish and usage frames survive byte fragmentation`, async () => {
    const response = await request(
      create({
        content: '你好🙂',
        tools: [{ name: 'weather', arguments: { city: '武汉' } }],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      }),
    );
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let wire = '';
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      assert.equal(item.value.length, 1);
      wire += decoder.decode(item.value, { stream: true });
    }
    wire += decoder.decode();
    reader.releaseLock();
    const frames = wire
      .trim()
      .split('\n\n')
      // 6 is the length of the `data: ` prefix each SSE line carries.
      .map((frame) => frame.slice(6));
    assert.equal(frames.pop(), '[DONE]');
    const chunks = frames.map(JSON.parse),
      choices = chunks.flatMap((chunk) => chunk.choices);
    assert.equal(choices[0].delta.role, 'assistant');
    assert.equal(choices.map((choice) => choice.delta.content ?? '').join(''), '你好🙂');
    const calls = choices.flatMap((choice) => choice.delta.tool_calls ?? []);
    assert.ok(calls[0].id);
    assert.ok(calls.every((call) => call.index === 0));
    assert.equal(calls.map((call) => call.function.name ?? '').join(''), 'weather');
    assert.equal(calls.map((call) => call.function.arguments ?? '').join(''), '{"city":"武汉"}');
    assert.equal(choices.at(-1).finish_reason, 'tool_calls');
    assert.deepEqual(chunks.at(-1).usage, {
      prompt_tokens: 2,
      completion_tokens: 3,
      total_tokens: 5,
    });
    assert.deepEqual(chunks.at(-1).choices, []);
  });
  test(`${name}: cancellation and interruption cannot produce success terminators`, async () => {
    const interrupted = await request(create({ content: 'hello', interruptAfter: 1 }));
    await assert.rejects(interrupted.text());
    const controller = new AbortController();
    const response = await request(
      create({ content: 'hello', intervalMs: 60_000 }),
      controller.signal,
    );
    const reader = response.body.getReader();
    // Start the pending pull before aborting so the in-flight frame wait sees the cancellation.
    const pending = assert.rejects(reader.read(), { name: 'AbortError' });
    controller.abort();
    await pending;
    reader.releaseLock();
  });
}
