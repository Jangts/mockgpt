/**
 * 会话控制器：管理消息列表、流式增量聚合、工具调用拼接和取消状态，
 * 并把更新通知给 Lit 宿主。请求实现可由构造参数替换，便于测试。
 */
import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { complete } from './chat-client.ts';
import type { Completion, Message } from './types.ts';

/** 响应式控制器；宿主在 addController 后由 requestUpdate 驱动重绘。 */
export class ChatController implements ReactiveController {
  /** 当前展示的消息列表（含尚未完成的助手回复）。 */
  messages: Message[] = [];
  /** 是否有请求正在进行。 */
  busy = false;
  /** 完成后的用量、结束原因或失败提示。 */
  status = '';
  /** 下一次请求是否使用流式传输。 */
  streaming = true;
  /** 已完成的对话历史，用于下一次请求上下文。 */
  private history: Message[] = [];
  /** 当前请求的取消句柄。 */
  private active?: AbortController;
  private host: ReactiveControllerHost;
  private complete: typeof complete;
  /**
   * @param host 触发更新的 Lit 宿主。
   * @param request 可替换的请求实现，默认走 chat-client。
   */
  constructor(host: ReactiveControllerHost, request = complete) {
    this.host = host;
    this.complete = request;
    host.addController(this);
  }
  /** 宿主断开时取消进行中的请求，避免后台写入已卸载组件。 */
  hostDisconnected() {
    this.stop();
  }
  /** 取消当前请求；没有进行中的请求时无副作用。 */
  stop() {
    this.active?.abort();
  }
  /** 清空消息与历史；生成中不允许清空，避免界面与请求状态脱节。 */
  clear() {
    if (this.busy) return;
    this.messages = [];
    this.history = [];
    this.status = '';
    this.host.requestUpdate();
  }
  /**
   * 发送一条用户消息并聚合助手回复。
   * @param prompt 用户输入；空白输入被忽略。
   * @returns 本轮是否正常完成；取消或失败返回 false。
   */
  async send(prompt: string) {
    if (this.busy || !prompt.trim()) return false;
    const user: Message = { role: 'user', content: prompt.trim() };
    const reply: Message = {
      role: 'assistant',
      content: '',
      calls: [],
      complete: false,
      state: 'streaming',
    };
    this.messages = [...this.messages, user, reply];
    this.history.push(user);
    const controller = new AbortController();
    this.active = controller;
    this.busy = true;
    this.status = '';
    this.host.requestUpdate();
    let usage: Completion['usage'];
    let reason: string | undefined;
    // 请求结束或取消后置为 false，用于丢弃迟到的流式分片。
    let accepting = true;
    try {
      await this.complete(this.history, this.streaming, controller.signal, (chunk) => {
        // 完成、失败或取消后的迟到分片不能改写已展示的回复。
        if (!accepting || controller.signal.aborted) return;
        usage = chunk.usage ?? usage;
        reason = chunk.choices[0]?.finish_reason ?? reason;
        const message = chunk.choices[0]?.message;
        const delta = chunk.choices[0]?.delta;
        if (message) {
          reply.content = message.content ?? '';
          reply.calls = message.tool_calls ?? [];
        }
        if (delta) {
          reply.content += delta.content ?? '';
          for (const item of delta.tool_calls ?? []) {
            const call = (reply.calls![item.index] ??= {
              id: '',
              type: 'function',
              function: { name: '', arguments: '' },
            });
            if (item.id) call.id = item.id;
            call.function.name += item.function?.name ?? '';
            call.function.arguments += item.function?.arguments ?? '';
          }
        }
        // 每次增量都换新数组，让 Lit 通过引用变化感知更新。
        this.messages = [...this.messages];
        this.host.requestUpdate();
      });
      controller.signal.throwIfAborted();
      reply.complete = true;
      reply.state = 'complete';
      // 工具提议轮次整体不保留：回退本轮用户消息，等待工具结果后由调用方续接。
      if (reply.calls?.length) this.history.pop();
      else this.history.push({ role: 'assistant', content: reply.content });
      const details: string[] = [];
      if (usage)
        details.push(
          `tokens：输入 ${usage.prompt_tokens}，输出 ${usage.completion_tokens}，合计 ${usage.total_tokens}`,
        );
      if (reason && !['stop', 'tool_calls'].includes(reason)) details.push(`结束原因：${reason}`);
      this.status = details.join(' · ');
      return true;
    } catch (error) {
      reply.state = controller.signal.aborted ? 'cancelled' : 'error';
      // 未完成的一轮不进入历史，下一次请求只带已接受的上下文。
      this.history.pop();
      this.status = controller.signal.aborted
        ? '已停止，本轮未加入历史。'
        : error instanceof Error
          ? error.message
          : '请求失败';
      // 没有正文或只剩图片占位时，用状态文案替换，避免留下空气泡。
      if (!reply.content || reply.content.startsWith('data:image/')) reply.content = this.status;
      return false;
    } finally {
      // 先停止接收分片，再复位忙碌状态并发布最终快照。
      accepting = false;
      this.active = undefined;
      this.busy = false;
      this.messages = [...this.messages];
      this.host.requestUpdate();
    }
  }
}
