/**
 * 校验回复 Markdown 的渲染边界：流式不完整图片、GFM 表格、原始 HTML 与危险链接
 * 的转义，以及图片占位在失败/取消和后续分片到达时的去留。
 * 使用 JSDOM 提供 DOM，直接驱动 renderReply，不依赖页面组件。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderReply } from '../src/render-markdown.mjs';

const image =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><text>MockGPT</text></svg>',
  );
const markdown = `这是一张模拟图片：\n\n![MockGPT 模拟图片](${image})`;
function body(t) {
  // 每个用例独立 DOM，结束后关闭窗口避免监听器泄漏。
  const dom = new JSDOM('<div id="reply"></div>');
  t.after(() => dom.window.close());
  return dom.window.document.getElementById('reply');
}

test('image Markdown renders an image while keeping the source string unchanged', (t) => {
  const element = body(t);
  renderReply(element, markdown, [], true);
  assert.equal(element.querySelector('img').getAttribute('src'), image);
  assert.equal(element.querySelector('img').getAttribute('alt'), 'MockGPT 模拟图片');
  assert.match(element.textContent, /这是一张模拟图片/);
  assert.ok(!element.textContent.includes('data:image'));
  assert.match(markdown, /!\[MockGPT 模拟图片\]\(data:image/);
});

test('streaming Markdown waits for the complete image instead of showing partial URLs', (t) => {
  const element = body(t);
  // 逐步推进的文本必须等待完整图片地址，避免请求半截 data URL。
  for (const partial of [
    markdown.slice(0, markdown.indexOf('data:') + 12),
    markdown.slice(0, -1),
    markdown,
  ]) {
    renderReply(element, partial);
    assert.equal(element.querySelector('img'), null);
    assert.match(element.textContent, /图片生成中/);
    assert.ok(!element.textContent.includes('data:image'));
  }
  renderReply(element, markdown, [], true);
  assert.equal(element.querySelector('img').getAttribute('src'), image);
});

test('GFM table syntax renders table headings and data cells', (t) => {
  const element = body(t);
  renderReply(element, '| 商品 | 金额 |\n| --- | ---: |\n| 拿铁 | 28 |\n| 手冲 | 32 |', [], true);
  assert.equal(element.querySelectorAll('thead th').length, 2);
  assert.equal(element.querySelectorAll('tbody tr').length, 2);
  assert.equal(element.querySelector('tbody td').textContent, '拿铁');
});

test('raw HTML is text and unsafe Markdown links or event attributes cannot execute', (t) => {
  const element = body(t);
  const raw = '<img src=x onerror="alert(1)">';
  // 原始 HTML 只能作为文本出现，事件属性不能进入 DOM。
  renderReply(element, raw, [], true);
  assert.equal(element.querySelector('img'), null);
  assert.match(element.textContent, /onerror/);
  renderReply(
    element,
    '[危险链接](javascript:alert(1))\n\n![危险图片](javascript:alert(1))',
    [],
    true,
  );
  assert.equal(element.querySelector('a').getAttribute('href'), null);
  assert.equal(element.querySelector('[onerror], [onclick], [src^="javascript:"]'), null);
  renderReply(
    element,
    markdown,
    [{ id: 'call-1', function: { name: 'image', arguments: image } }],
    true,
  );
  assert.equal(element.querySelector('img'), null);
  assert.match(element.textContent, /工具提议（未执行）/);
});

test('failed and cancelled images end their placeholder and never request a partial destination', (t) => {
  for (const state of ['cancelled', 'error']) {
    const element = body(t);
    // 未完成且已终止时，占位提示必须结束并显示与状态一致的文案。
    renderReply(element, markdown.slice(0, -1), [], false, state);
    assert.equal(element.querySelector('img'), null);
    assert.doesNotMatch(element.textContent, /生成中/);
    assert.match(element.textContent, state === 'cancelled' ? /已停止/ : /失败/);
  }
});
test('unchanged messages retain their rendered image nodes as other chunks arrive', (t) => {
  const element = body(t);
  renderReply(element, markdown, [], true);
  const image = element.querySelector('img');
  renderReply(element, markdown, [], true);
  // 正文未变时复用已渲染的图片节点，避免重复解析与重新解码。
  assert.equal(element.querySelector('img'), image);
  renderReply(element, markdown + '\n\n补充说明。', [], true);
  assert.notEqual(element.querySelector('img'), image);
});
