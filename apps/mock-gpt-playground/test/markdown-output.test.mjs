/**
 * 校验 Playground 适配层在 JSON 与 SSE 两条返回通道上给出同一份 Markdown 文本：
 * 图片与表格必须由生成器渲染为 Markdown，而不是原始 HTML。属于响应编码层面的
 * 回归测试，依赖 createPlaygroundFetch 与场景装配。
 */
import { createPlaygroundFetch } from '../src/simulated-fetch.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockGPT } from '@jangts/mock-gpt';
import { playgroundConfig } from '../src/scenarios/playground-config.ts';

for (const prompt of ['生成图片', '生成表格'])
  test(`${prompt} returns Markdown through both JSON and SSE`, async () => {
    // 固定 seed 与时钟，让同一 prompt 的多次调用结果可逐字比较。
    const mock = new MockGPT({
      ...playgroundConfig(),
      seed: 42,
      clock: () => 1000,
      stream: { intervalMs: 0, chunkSize: 5, wireChunkSize: 7 },
    });
    // 同一请求分别以非流式与流式发出，最终拼接正文应与 JSON 完全一致。
    const call = (stream) =>
      createPlaygroundFetch(mock, { chunkSize: 8, intervalMs: 0, wireChunkSize: 7 })(
        'https://mock.invalid/v1/chat/completions',
        {
          method: 'POST',
          body: JSON.stringify({
            model: 'mock-gpt',
            stream,
            messages: [{ role: 'user', content: prompt }],
          }),
        },
      );
    const content = (await (await call(false)).json()).choices[0].message.content;
    assert.doesNotMatch(content, /<(?:img|table|svg)\b/i);
    if (prompt === '生成图片') {
      assert.match(content, /!\[.+\]\(data:image\/svg\+xml/);
      assert.ok(!content.startsWith('data:'));
    } else {
      assert.match(content, /\| 商品 \| 数量 \| 单价 \| 小计 \| 状态 \|/);
      assert.match(content, /\| --- \| ---:/);
    }
    mock.reset();
    const wire = await (await call(true)).text();
    assert.match(wire, /data: \[DONE\]/);
    // 去掉终止帧后逐帧解析，验证分片只是传输形式差异，不改变最终内容。
    const chunks = wire
      .trim()
      .split('\n\n')
      .slice(0, -1)
      .map((frame) => JSON.parse(frame.slice(6)));
    assert.equal(chunks.map((chunk) => chunk.choices[0]?.delta.content ?? '').join(''), content);
  });
