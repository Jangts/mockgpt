/**
 * Extractive summary behaviour (`generators/summarize.ts`).
 *
 * Focuses on qualities that distinguish a real selection from a prefix: central facts win over an
 * unrelated introduction, near-duplicates do not crowd out other aspects, budgets are respected in
 * code points and long documents are sampled across their whole length. Runs against the built
 * output in `dist/`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../dist/esm/generators/summarize.js';
import { MockGPT, generators } from '../dist/esm/index.js';
const article = [
  '欢迎访问，这是网站导航和栏目介绍。',
  '午后的花园里有一只橘色小猫。',
  '太阳能储能项目将为学校提供清洁电力。',
  '该太阳能项目采用屋顶光伏和储能电池，减少学校电力开支。',
  '储能电池能够在停电期间继续为学校供电。',
  '试点数据显示，太阳能储能使学校年度电费降低百分之三十。',
  '项目结论是将太阳能与储能配置推广到更多学校。',
].join('\n');
test('summary chooses central facts after an unrelated introduction rather than returning a prefix', () => {
  const result = summarize(article, 3, 110);
  assert.match(result.text, /学校|储能/);
  assert.doesNotMatch(result.text, /欢迎访问|橘色小猫/);
  assert.ok(result.selectedIndexes.some((index) => index >= 4));
  assert.ok(result.selectedIndexes.length > 1);
  assert.ok(Array.from(result.text).length <= 110);
});
test('similar statements do not crowd out a separate aspect of the document', () => {
  const text = [
    '学校太阳能项目采用储能电池，在夜间为教学楼供电。',
    '学校太阳能项目使用储能电池，在夜间为教学楼提供电力。',
    '学校太阳能项目安装储能电池，在夜间为教学楼持续供电。',
    '学校太阳能项目年度预算为一百万元，资金来自专项补助。',
    '学校太阳能项目预计九月开工，十二月完成验收。',
  ].join('\n');
  const result = summarize(text, 3, 180);
  assert.match(result.text, /预算|补助|九月|验收/);
  assert.ok(result.selected <= 3);
});
test('budget is spent while selecting complete sentences, with safe fallback for an oversized sentence', () => {
  const result = summarize(article, 3, 80);
  assert.ok(Array.from(result.text).length <= 80);
  assert.ok(/[。！？]$/.test(result.text));
  for (const max of [1, 2, 9, 40]) {
    const value = summarize('🙂' + '长句测试内容'.repeat(100) + '，', 3, max, true).text;
    assert.ok(Array.from(value).length <= max);
    assert.doesNotMatch(
      value,
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u,
    );
  }
});
test('candidate budget samples through a document rather than dropping everything beyond sentence 300', () => {
  // 350 sentences exceed the 180-candidate cap, so selection must sample, not truncate.
  const prefix = Array.from({ length: 350 }, (_, i) => `栏目序号${i}用于页面目录。`).join('\n');
  const ending = Array.from(
    { length: 8 },
    (_, i) => `学校太阳能储能项目研究结果${i}显示电力成本明显降低。`,
  ).join('\n');
  const result = summarize(prefix + '\n' + ending, 3, 160);
  assert.ok(result.candidates <= 180);
  assert.ok(result.selectedIndexes.some((index) => index >= 350));
});
test('long input analysis retains head, middle and tail and reports the chosen algorithm', async () => {
  const long = '序言材料。'.repeat(8000) + '\n' + article;
  const mock = new MockGPT({
    rules: [{ generator: generators.summary({ source: long, maxChars: 140 }) }],
  });
  const response = await mock.fetch('https://mock/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ model: 'demo', messages: [{ role: 'user', content: 'summary' }] }),
  });
  const content = (await response.json()).choices[0].message.content;
  assert.match(content, /学校|储能/);
  assert.equal(mock.records[0].metadata.summaryMethod, 'textrank-mmr');
  assert.equal(mock.records[0].metadata.analysisSampling, 'head-middle-tail');
});
test('short input, empty input and repeated identical sentences remain bounded and deterministic', () => {
  assert.equal(summarize('', 3, 120).text, '');
  assert.equal(summarize('你好。', 3, 120).text, '你好。');
  assert.equal(summarize('咖啡馆欢迎你。'.repeat(10), 3, 120).selected, 1);
  assert.deepEqual(summarize(article, 3, 140), summarize(article, 3, 140));
});
