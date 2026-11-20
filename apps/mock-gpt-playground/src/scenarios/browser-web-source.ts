/**
 * 浏览器端网页来源：直接抓取用户给出的单个 HTTP(S) 地址，抽取正文供摘要场景
 * 使用。不经过代理、不带凭据，失败时回退为固定提示并上报诊断字段。
 */
import { MockGPTError, type GenerationContext } from '@jangts/mock-gpt';

// 单页正文读取上限 2 MiB，避免超长页面占用过多内存与生成时间。
const maxBytes = 2_097_152;
// 抓取或解析失败时的统一回复，保持演示可继续。
const fallback = '我目前不支持访问实时网页。你可以把网页正文发给我，我可以帮你总结。';

/**
 * 流式读取并抽取网页正文；编码取自响应头的 charset，HTML 会移除脚本与导航节点。
 * @param response 已完成的抓取响应，正文按流读取。
 * @param signal 取消信号，读取过程中中止会立即失败。
 * @returns 纯文本正文；HTML 只保留文章主体文本。
 * @throws MockGPTError 状态码非成功、类型不支持、正文为空或超过大小上限时抛出。
 */
async function readPage(response: Response, signal: AbortSignal): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';
  const reader = response.body?.getReader();
  let text = '',
    size = 0;
  try {
    if (!response.ok) throw new MockGPTError('MOCK_WEB_HTTP', `网页返回 HTTP ${response.status}`);
    if (!/^(?:text\/html|application\/xhtml\+xml|text\/plain)(?:;|$)/i.test(contentType))
      throw new MockGPTError('MOCK_WEB_TYPE', '网页须为 HTML 或纯文本');
    if (!reader) throw new MockGPTError('MOCK_WEB_EMPTY', '网页没有正文');
    const decoder = new TextDecoder(
      /charset\s*=\s*["']?([^;\s"']+)/i.exec(contentType)?.[1] ?? 'utf-8',
    );
    while (true) {
      signal.throwIfAborted();
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > maxBytes) throw new MockGPTError('MOCK_WEB_LIMIT', '网页超过读取上限');
      text += decoder.decode(item.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    if (reader) {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  if (/^text\/plain(?:;|$)/i.test(contentType)) return text;
  const document = new DOMParser().parseFromString(text, 'text/html');
  document
    .querySelectorAll('script,style,noscript,template,nav,header,footer,aside,form')
    .forEach((node) => node.remove());
  const article = document.querySelector('article,main,[role="main"]') ?? document.body;
  article.querySelectorAll('p,div,section,li,h1,h2,h3,br').forEach((node) => node.append('\n'));
  return article.textContent ?? '';
}

/** 显式浏览器来源：不经过代理、不使用 cookie，也不依赖服务端网络。 */
export async function browserWebSource(context: GenerationContext): Promise<string> {
  const urls = context.prompt.match(/https?:\/\/[^\s<>"']+/g) ?? [];
  let url: URL;
  try {
    if (urls.length !== 1) throw new Error();
    url = new URL(urls[0]);
    if (url.username || url.password) throw new Error();
  } catch {
    throw new MockGPTError('MOCK_WEB_TARGET', '请提供一个不含登录凭据的 HTTP(S) 网页地址');
  }
  const requestedUrl = url.href.slice(0, 512);
  const timeout = AbortSignal.timeout(20_000);
  const signal = AbortSignal.any([context.signal, timeout]);
  try {
    const response = await fetch(url, {
      signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    const text = (await readPage(response, signal)).trim();
    signal.throwIfAborted();
    if (!text) throw new MockGPTError('MOCK_WEB_EMPTY', '网页没有可读正文');
    const finalUrl = response.url.slice(0, 512);
    context.report({
      transport: 'browser-fetch',
      requestedUrl,
      finalUrl,
      ...(requestedUrl !== url.href || finalUrl !== response.url ? { urlTruncated: true } : {}),
    });
    return text;
  } catch (error) {
    context.signal.throwIfAborted();
    context.report({
      transport: 'browser-fetch',
      requestedUrl,
      ...(requestedUrl !== url.href ? { urlTruncated: true } : {}),
      sourceFallback: true,
      sourceError: timeout.aborted
        ? 'MOCK_WEB_TIMEOUT'
        : error instanceof MockGPTError
          ? error.code
          : 'MOCK_WEB_FETCH',
    });
    return fallback;
  }
}
