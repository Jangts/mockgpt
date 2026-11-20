/**
 * 会话消息列表组件：负责消息气泡、状态提示、JSON 与工具提议展示，以及
 * Markdown 正文渲染。示例区链接通过 open-examples 事件交给应用外壳，
 * 组件本身不持有路由。
 */
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { resetStyles } from '../reset-styles.ts';
import type { Message } from '../types.ts';
import { renderReply } from '../render-markdown.mjs';

/** 把已完成的 JSON 回复格式化为可展示文本；非对象或解析失败时返回 undefined。 */
function prettyJSON(text: string) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? JSON.stringify(value, null, 2) : undefined;
  } catch {
    return undefined;
  }
}

/** 只读消息列表；messages 变化时由 Lit 重新渲染。 */
@customElement('chat-messages')
export class ChatMessages extends LitElement {
  @property({ attribute: false }) messages: Message[] = [];
  static styles = [
    resetStyles,
    css`
      :host {
        display: block;
        max-width: var(--chat-content-width, 850px);
        margin: auto;
      }
      article {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin: 0 0 28px;
      }
      .avatar {
        display: grid;
        place-items: center;
        flex: 0 0 32px;
        height: 32px;
        border-radius: 11px;
        background: var(--wa-color-brand-fill-loud, #2563eb);
        color: white;
        font-size: 13px;
        font-weight: 700;
      }
      .user {
        flex-direction: row-reverse;
      }
      .user .avatar {
        background: var(--wa-color-neutral-fill-normal, #e5e7eb);
        color: var(--wa-color-text-normal, #334155);
      }
      .content {
        min-width: 0;
        max-width: calc(100% - 44px);
      }
      .user .content {
        max-width: 80%;
      }
      .meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 20px;
        font-size: 12px;
        font-weight: 600;
        color: var(--wa-color-text-quiet, #64748b);
        margin: 1px 0 3px;
      }
      .user .meta {
        justify-content: flex-end;
      }
      .meta wa-copy-button {
        font-size: 14px;
        opacity: 0.6;
      }
      .meta wa-copy-button::part(button) {
        padding: 0;
      }
      .bubble {
        padding: 16px 18px;
        border-radius: 4px 16px 16px;
        background: var(--wa-color-surface-raised, #fff);
        border: 1px solid var(--wa-color-surface-border, #e2e8f0);
        line-height: 1.75;
        font-size: 14px;
        overflow-wrap: anywhere;
      }
      .user .bubble {
        border-radius: 16px 4px 16px 16px;
        background: var(--wa-color-brand-fill-loud, #2563eb);
        color: white;
        border: 0;
      }
      .body {
        white-space: normal;
      }
      .body > :first-child {
        margin-top: 0;
      }
      .body > :last-child {
        margin-bottom: 0;
      }
      .body p {
        margin: 0 0 12px;
      }
      .body table {
        display: block;
        max-width: 100%;
        overflow-x: auto;
        overscroll-behavior-x: none;
        overscroll-behavior-y: auto;
        border-collapse: collapse;
        margin: 12px 0;
        font-size: 13px;
      }
      .body th,
      .body td {
        padding: 9px 12px;
        border: 1px solid var(--wa-color-surface-border, #e2e8f0);
        white-space: nowrap;
      }
      .body th {
        background: var(--wa-color-surface-lowered, #f8fafc);
        font-weight: 600;
      }
      .body ul,
      .body ol {
        padding-inline-start: 22px;
        margin: 10px 0;
      }
      .body blockquote {
        border-left: 3px solid var(--wa-color-surface-border, #e2e8f0);
        margin: 12px 0;
        padding-left: 14px;
        opacity: 0.75;
      }
      .body a {
        color: var(--wa-color-text-link, #2563eb);
      }
      .body code {
        font-family: var(--wa-font-family-code, monospace);
      }
      .generated-image {
        display: block;
        max-width: 100%;
        height: auto;
        border-radius: 10px;
      }
      .note {
        font-size: 12px;
        opacity: 0.6;
      }
      .tools {
        margin-top: 12px;
      }
      details {
        border: 1px solid var(--wa-color-surface-border, #e2e8f0);
        border-radius: 10px;
        overflow: hidden;
        margin-top: 8px;
      }
      summary {
        padding: 10px 12px;
        cursor: pointer;
        background: var(--wa-color-surface-lowered, #f8fafc);
        font-size: 12px;
      }
      pre {
        font: 12px/1.7 var(--wa-font-family-code, monospace);
        margin: 0;
        padding: 14px;
        overflow: auto;
        overscroll-behavior-x: none;
        overscroll-behavior-y: auto;
        max-height: 360px;
        white-space: pre;
      }
      .json-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        opacity: 0.7;
        border-bottom: 1px solid var(--wa-color-surface-border, #e2e8f0);
        padding-bottom: 8px;
      }
      .typing {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 5px 0;
      }
      .typing i {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--wa-color-brand-fill-loud, #2563eb);
        animation: pulse 1.2s infinite;
      }
      .typing i:nth-child(2) {
        animation-delay: 0.15s;
      }
      .typing i:nth-child(3) {
        animation-delay: 0.3s;
      }
      .progress {
        display: inline-block;
        margin-left: 8px;
        font-weight: 400;
        opacity: 0.6;
      }
      @keyframes pulse {
        0%,
        80%,
        100% {
          opacity: 0.3;
          transform: translateY(0);
        }
        40% {
          opacity: 1;
          transform: translateY(-3px);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .typing i {
          animation: none;
        }
      }
      @media (max-width: 600px) {
        article {
          gap: 8px;
          margin-bottom: 20px;
        }
        .avatar {
          flex-basis: 28px;
          height: 28px;
          font-size: 11px;
        }
        .content {
          max-width: calc(100% - 36px);
        }
        .bubble {
          padding: 12px 14px;
        }
        .user .content {
          max-width: 85%;
        }
      }
    `,
  ];
  private onLinkClick(event: MouseEvent) {
    // 仅拦截指向示例区的锚点，其余链接保持浏览器默认行为。
    const link =
      event.target instanceof Element
        ? event.target.closest('a[href="#playground-examples"]')
        : null;
    if (!link) return;
    event.preventDefault();
    this.dispatchEvent(new Event('open-examples', { bubbles: true, composed: true }));
  }
  render() {
    // 完整 JSON 回复直接用代码块展示，避免再经 Markdown 解析破坏结构。
    return html`${this.messages.map((message, index) => {
      const json = message.complete ? prettyJSON(message.content) : undefined;
      return html`<article class=${message.role} @click=${this.onLinkClick}>
        <div class="avatar" aria-hidden="true">${message.role === 'user' ? '你' : 'M'}</div>
        <section class="content">
          <div class="meta">
            <span
              >${message.role === 'user' ? '你' : 'MockGPT'}${message.role === 'assistant' && !message.complete ? html`<span class="progress">${message.state === 'cancelled' ? '已停止' : message.state === 'error' ? '生成失败' : message.content || message.calls?.length ? '正在回复' : '正在生成'}</span>` : ''}</span
            >${message.role === 'assistant' && message.complete && message.content ? html`<wa-copy-button .value=${message.content} copy-label=${json ? '复制完整 JSON' : '复制回复'} success-label="已复制"></wa-copy-button>` : ''}
          </div>
          <div class="bubble">
            ${
              json
                ? html`<div class="json-head"><span>JSON 结构化回复</span></div>
                    <pre>${json}</pre>`
                : html`<div class="body" data-index=${index}></div>`
            }
            ${message.role === 'assistant' && !message.content && !message.calls?.length && message.state === 'streaming' ? html`<div class="typing" aria-label="正在生成"><i></i><i></i><i></i></div>` : ''}
            ${
              message.calls?.length
                ? html`<div class="tools">
                    ${message.calls.map(
                      (call) =>
                        html`<details open>
                          <summary>
                            工具提议 · ${call.function.name || '接收名称中…'} · 未执行
                          </summary>
                          <pre>
${prettyJSON(call.function.arguments) ?? call.function.arguments}</pre>
                        </details>`,
                    )}
                  </div>`
                : ''
            }
          </div>
        </section>
      </article>`;
    })}`;
  }
  protected updated() {
    // 正文由 renderReply 直接写 DOM，需在每次更新后重新渲染以保留增量。
    this.renderRoot.querySelectorAll<HTMLElement>('.body').forEach((body) => {
      const message = this.messages[Number(body.dataset.index)];
      if (message.role === 'assistant')
        renderReply(body, message.content, [], message.complete, message.state);
      else if (body.textContent !== message.content) body.textContent = message.content;
    });
    // 通知父组件重新计算滚动或布局。
    this.dispatchEvent(new Event('messages-updated', { bubbles: true, composed: true }));
  }
}
