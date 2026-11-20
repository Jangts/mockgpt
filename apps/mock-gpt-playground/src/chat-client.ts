/**
 * 浏览器侧模型客户端：把会话消息封装成 Chat Completions 请求，并把普通响应或
 * SSE 分片统一交给回调消费。错误以异常形式交给 ChatController 判定取消或失败。
 */
import { playgroundFetch } from './mock-runtime.ts';
import type { Completion, Message } from './types.ts';

/**
 * 读取 SSE 响应并逐帧解析 data 字段。
 * 缓冲区可能跨读取边界截断帧，因此只在出现空行分隔时消费。
 * @param response 已建立的事件流响应。
 * @param consume 每收到一个非终止帧时调用。
 * @returns 收到 `[DONE]` 并释放 reader 后结束。
 * @throws {Error} 流结束但缺少终止帧，或某帧 data 不是合法 JSON 时抛出。
 */
async function readSSE(response: Response, consume: (chunk: Completion) => void) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '',
    ended = false;
  const flush = () => {
    let position: number;
    while ((position = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, position);
      buffer = buffer.slice(position + 2);
      const data = event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      if (data === '[DONE]') ended = true;
      else consume(JSON.parse(data));
    }
  };
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      buffer += decoder.decode(item.value, { stream: true });
      flush();
    }
    buffer += decoder.decode();
    flush();
    // 上游断流却没有终止帧时视为失败，不能把已收到片段当作完成。
    if (!ended) throw new Error('响应流未正常结束');
  } finally {
    // 无论正常结束还是取消，都释放 reader，避免连接悬挂。
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/**
 * 发送一次未流式或流式的补全请求。
 * @param messages 本次请求使用的历史消息，不包含尚未完成的助手回复。
 * @param stream 为 true 时按 SSE 解析，否则读取一次性 JSON。
 * @param signal 取消信号；取消会中断 fetch 与流读取。
 * @param consume 每收到一个完整响应或流式增量时调用。
 * @returns 请求与流正常结束后的 Promise。
 * @throws {Error} 响应非 2xx、流缺少终止帧或分片不是合法 JSON 时拒绝。
 */
export async function complete(
  messages: Message[],
  stream: boolean,
  signal: AbortSignal,
  consume: (chunk: Completion) => void,
) {
  const response = await playgroundFetch('https://mockgpt.local/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify({
      model: 'mock-gpt',
      messages: messages.map(({ role, content }) => ({ role, content })),
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
    }),
  });
  if (!response.ok) {
    const body = await response.json();
    throw new Error(body.error?.message ?? `HTTP ${response.status}`);
  }
  if (stream) await readSSE(response, consume);
  else consume(await response.json());
}
