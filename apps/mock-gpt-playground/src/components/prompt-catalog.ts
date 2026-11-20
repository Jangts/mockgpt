/**
 * 提示词列表面板：按关键字过滤场景目录，点击条目后向上派发 select-scenario 事件。
 * 桌面侧栏与移动端抽屉共用同一组件，compact 模式只隐藏标题、保留搜索框。
 */
import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { resetStyles } from '../reset-styles.ts';
import type { Scenario } from '../types.ts';

/**
 * 场景筛选与选择组件；scenarios 为页面传入的只读目录，selected 用于回显当前项。
 * 过滤只匹配 ID、名称、示例问句与覆盖能力标签，不改变页面选中的场景。
 */
@customElement('prompt-catalog')
export class PromptCatalog extends LitElement {
  @property({ attribute: false }) scenarios: Scenario[] = [];
  @property() selected = '';
  @property({ type: Boolean }) compact = false;
  @state() private query = '';
  static styles = [
    resetStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: 100%;
      }
      * {
        box-sizing: border-box;
      }
      input {
        flex: none;
        width: calc(100% - 2 * var(--sidebar-inset, 0px));
        padding: 10px 12px;
        margin: 0 var(--sidebar-inset, 0px) 8px;
        border: 1px solid var(--wa-color-surface-border, #dbe1e8);
        border-radius: 8px;
        font: inherit;
        font-size: 12px;
        color: inherit;
        background: var(--wa-color-surface-raised, #fff);
      }
      .heading {
        display: flex;
        flex: none;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin: 0 calc(var(--sidebar-inset, 0px) + 4px) 14px;
      }
      .heading h2 {
        font-size: 13px;
        line-height: 1.5;
        margin: 0;
      }
      :host([compact]) .heading {
        justify-content: flex-end;
        margin-bottom: 8px;
      }
      .count {
        flex: none;
        font-size: 11px;
        line-height: 1.5;
        opacity: 0.5;
        white-space: nowrap;
      }
      nav {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-height: 0;
        overflow: auto;
        overscroll-behavior: none;
        padding: 2px calc(var(--sidebar-inset, 0px) + 3px) 16px;
      }
      button {
        display: block;
        flex: none;
        width: 100%;
        padding: 11px 12px;
        margin: 0;
        border: 1px solid transparent;
        border-radius: 9px;
        color: inherit;
        background: transparent;
        text-align: left;
        font: inherit;
        cursor: pointer;
      }
      button:hover {
        background: var(--wa-color-surface-lowered, #f1f5f9);
      }
      button[aria-current='true'] {
        border-color: var(--wa-color-brand-border-normal, #9bc1ff);
        background: var(--wa-color-brand-fill-quiet, #eef5ff);
      }
      strong,
      small {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
      }
      strong {
        -webkit-line-clamp: 2;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.5;
      }
      small {
        -webkit-line-clamp: 2;
        font-size: 11px;
        line-height: 1.5;
        opacity: 0.58;
        margin-top: 5px;
      }
      .empty {
        font-size: 12px;
        opacity: 0.6;
        padding: 12px;
      }
    `,
  ];
  /** 把焦点移到搜索框；面板尚未渲染出输入框时不做任何事。 */
  focusSearch() {
    this.renderRoot.querySelector<HTMLInputElement>('input')?.focus();
  }
  render() {
    const query = this.query.trim().toLowerCase();
    const items = this.scenarios.filter((item) =>
      `${item.id} ${item.label} ${item.example} ${item.covers.join(' ')}`
        .toLowerCase()
        .includes(query),
    );
    return html`<div class="heading">
        ${this.compact ? nothing : html`<h2>提示词列表</h2>`}<span class="count"
          >${items.length} / ${this.scenarios.length} 个场景</span
        >
      </div>
      <input
        type="search"
        aria-label="搜索提示词"
        placeholder="搜索提示词…"
        .value=${this.query}
        @input=${(event: Event) => {
          this.query = (event.target as HTMLInputElement).value;
        }}
      />
      <nav aria-label="提示词列表">
        ${items.map((item) => html`<button type="button" aria-current=${this.selected === item.id ? 'true' : nothing} title=${item.example} @click=${() => this.dispatchEvent(new CustomEvent('select-scenario', { detail: item, bubbles: true, composed: true }))}><strong>${item.example.replace(/\s+https?:\/\/\S+/g, '').split(/[：\n]/)[0]}</strong><small title=${item.label}>${item.label}</small></button>`)}${!items.length ? html`<p class="empty">没有匹配的提示词</p>` : nothing}
      </nav>`;
  }
}
