import { createPlaygroundFetch } from '../src/simulated-fetch.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockGPT, generators, generatorNames, responses } from '@jangts/mock-gpt';
import { playgroundConfig } from '../src/scenarios/playground-config.ts';
import { playgroundScenarios } from '../src/scenarios/playground-config.ts';

const call = (mock, prompt) =>
  createPlaygroundFetch(mock, { chunkSize: 8, intervalMs: 0, wireChunkSize: 7 })(
    'https://mock.invalid/v1/chat/completions',
    {
      method: 'POST',
      body: JSON.stringify({
        model: 'mock-gpt',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        stream_options: { include_usage: true },
      }),
    },
  );
function create() {
  const config = playgroundConfig();
  return new MockGPT({
    ...config,
    seed: 42,
    clock: () => 1000,
    stream: { intervalMs: 0 },
    // The public-web example keeps its real matching rule, with an offline transport boundary.
    rules: config.rules.map((rule) =>
      rule.id === 'web'
        ? {
            ...rule,
            generator: generators.summary({
              source: async () => '这是离线网页正文。阅读区将在周末开放。',
            }),
          }
        : typeof rule.generator === 'object' && rule.generator?.kind === 'model'
          ? {
              ...rule,
              generator: responses.text(rule.generator.value.content, {
                ...rule.generator.value,
                intervalMs: 0,
              }),
            }
          : rule,
    ),
  });
}

test('playground catalog covers every exported generator and response helper with valid references', () => {
  const expected = [
    ...generatorNames.map((name) => `generator.${name}`),
    ...Object.keys(responses).map((name) => `response.${name}`),
  ];
  const covered = new Set(playgroundScenarios.flatMap((item) => item.covers));
  for (const name of expected) assert.ok(covered.has(name), `Missing playground: ${name}`);
  const ids = new Set();
  for (const item of playgroundScenarios) {
    assert.ok(!ids.has(item.id), `Duplicate scenario ${item.id}`);
    ids.add(item.id);
    assert.ok(item.example && item.label && item.covers.length);
    for (const name of item.covers) {
      if (name.startsWith('generator.') || name.startsWith('response.'))
        assert.ok(expected.includes(name), `Unknown capability: ${name}`);
    }
  }
});

for (const scenario of playgroundScenarios)
  test(`playground question actually matches and responds / ${scenario.id}`, async () => {
    const mock = create();
    if (scenario.id === 'network')
      await assert.rejects(call(mock, scenario.example), { code: 'MOCK_NETWORK' });
    else {
      const response = await call(mock, scenario.example);
      if (['429', '500'].includes(scenario.id)) assert.equal(response.status, Number(scenario.id));
      else if (scenario.id === 'disconnect') await assert.rejects(response.text());
      else {
        const wire = await response.text();
        assert.match(wire, /data: \[DONE\]/);
        if (scenario.id === 'ordered-scenario') {
          const deltas = wire.split('\n')
            .filter(line => line.startsWith('data: {'))
            .map(line => JSON.parse(line.slice(6)).choices[0]?.delta);
          assert.equal(deltas.map(delta => delta?.content ?? '').join(''), '我先查一下库存。');
          assert.equal(deltas.flatMap(delta => delta?.tool_calls ?? [])
            .map(call => call.function.name ?? '').join(''), 'lookupStock');
          assert.ok(deltas.findIndex(delta => delta?.content) < deltas.findIndex(delta => delta?.tool_calls));
        }
        if (scenario.id === 'usage') assert.match(wire, /"total_tokens":20/);
        if (scenario.id === 'length' || scenario.id === 'filter')
          assert.match(
            wire,
            new RegExp(
              `"finish_reason":"${scenario.id === 'length' ? 'length' : 'content_filter'}"`,
            ),
          );
      }
    }
    if (scenario.id === 'fallback') assert.equal(mock.records[0].fallback, true);
    else assert.equal(mock.records[0].ruleId, scenario.id);
    assert.equal(mock.activeRequests, 0);
  });

test('repeatable questions demonstrate sequence exhaustion and limited rule availability', async () => {
  const mock = create();
  for (let index = 0; index < 3; index++) await (await call(mock, '下一步')).text();
  await assert.rejects(call(mock, '下一步'), { code: 'MOCK_SEQUENCE_EXHAUSTED' });
  await (await call(mock, '领取演示券')).text();
  await (await call(mock, '领取演示券')).text();
  assert.equal(mock.records.at(-1).fallback, true);
});
