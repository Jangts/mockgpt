/**
 * 助手回复的 Markdown 渲染：把累计文本写入消息节点，处理工具提议、未完成图片
 * 的占位提示与增量重复写入。裸 HTML 转义为文本，最终输出经 DOMPurify 清洗。
 */
import { Marked, Renderer } from 'marked';
import createDOMPurify from 'dompurify';

const renderer = new Renderer();
// 模型回复按 Markdown 解释，但其中的原始 HTML 只作为可见文本，不参与执行。
renderer.html = (source) =>
  source.replace(/[&<>]/g, (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[value]);
const markdown = new Marked({ renderer, gfm: true, breaks: true });
// 按宿主 window 缓存清洗器，避免每次流式增量都新建 DOMPurify 实例。
const sanitizers = new WeakMap();
// 记录每个消息节点上次渲染的输入，内容未变化时跳过重绘。
const rendered = new WeakMap();

/**
 * 渲染一条回复的当前内容；工具提议存在时以文本形式展示，不执行调用。
 * @param body 承载回复的 DOM 节点，渲染结果写入其 textContent 或 innerHTML。
 * @param text 已累计的回复正文（Markdown 源码）。
 * @param calls 本次回复提出的工具调用，非空时改为纯文本展示。
 * @param complete 是否已收到正常结束信号；未完成时替换写了一半的图片语法。
 * @param state 展示状态，为未完成图片选择“生成中／已停止／生成失败”提示。
 * @returns 无返回值；输入与上次相同则提前返回，不触发 DOM 写入。
 */
export function renderReply(
  body,
  text,
  calls = [],
  complete = false,
  state = complete ? 'complete' : 'streaming',
) {
  const callsKey = JSON.stringify(calls);
  const previous = rendered.get(body);
  if (
    previous?.text === text &&
    previous.calls === callsKey &&
    previous.complete === complete &&
    previous.state === state
  )
    return;
  rendered.set(body, { text, calls: callsKey, complete, state });
  if (calls.length) {
    body.textContent = text + '\n\n工具提议（未执行）：\n' + JSON.stringify(calls, null, 2);
    return;
  }
  let source = text;
  // 不完整的图片地址不是可用文本，也不能触发破损图片请求。
  const imageStart = source.lastIndexOf('![');
  if (!complete && imageStart >= 0) {
    const note =
      state === 'cancelled'
        ? '图片生成已停止。'
        : state === 'error'
          ? '图片生成失败。'
          : '图片生成中…';
    source = source.slice(0, imageStart) + `\n\n*${note}*`;
  }
  const window = body.ownerDocument.defaultView;
  if (!window) {
    body.textContent = source;
    return;
  }
  let sanitizer = sanitizers.get(window);
  if (!sanitizer) {
    sanitizer = createDOMPurify(window);
    sanitizers.set(window, sanitizer);
  }
  body.innerHTML = sanitizer.sanitize(markdown.parse(source, { async: false }), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style'],
    FORBID_ATTR: ['style'],
    RETURN_TRUSTED_TYPE: false,
  });
  for (const image of body.querySelectorAll('img')) {
    image.classList.add('generated-image');
    image.addEventListener(
      'error',
      () => {
        image.replaceWith(
          body.ownerDocument.createTextNode(`[图片无法显示：${image.alt || '模拟图片'}]`),
        );
      },
      { once: true },
    );
  }
}
