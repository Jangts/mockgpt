/**
 * 提示词配置面板：只读展示选中场景的 ID、示例问句、覆盖能力、匹配参数、
 * 生成器源码，以及可选的可用条件和完整 TypeScript 配置，供复制参考。
 */
import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { resetStyles } from '../reset-styles.ts';
import type { Scenario } from '../types.ts';

/** 右侧配置视图；scenario 为空时显示占位提示，不发起任何请求。 */
@customElement('scenario-config')
export class ScenarioConfig extends LitElement {
  @property({ attribute: false }) scenario?: Scenario;
  static styles = [
    resetStyles,
    css`
      :host {
        display: block;
        min-width: 0;
        overflow: auto;
        overscroll-behavior: none;
        padding: 0 calc(var(--sidebar-inset, 0px) + 5px) 24px;
      }
      * {
        box-sizing: border-box;
      }
      .config-id {
        font: 10px/1.5 var(--wa-font-family-code, monospace);
        opacity: 0.5;
        margin: 0 0 5px;
      }
      h3 {
        font-size: 15px;
        line-height: 1.6;
        margin: 0 0 6px;
      }
      .description {
        margin: 0;
        font-size: 12px;
        line-height: 1.7;
        opacity: 0.6;
      }
      section {
        margin-top: 22px;
      }
      h4 {
        font-size: 11px;
        letter-spacing: 0.03em;
        opacity: 0.55;
        margin: 0 0 10px;
      }
      .question {
        font-size: 12px;
        line-height: 1.7;
        margin: 0;
        padding: 12px;
        background: var(--wa-color-surface-lowered, #f8fafc);
        border-radius: 8px;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }
      .tag {
        border: 1px solid var(--wa-color-surface-border, #e2e8f0);
        border-radius: 5px;
        padding: 3px 6px;
        font: 11px/1.4 var(--wa-font-family-code, monospace);
      }
      pre {
        display: block;
        min-width: 0;
        max-width: 100%;
        margin: 0;
        padding: 12px;
        border: 1px solid var(--wa-color-surface-border, #e2e8f0);
        border-radius: 8px;
        background: var(--wa-color-surface-lowered, #f8fafc);
        font: 11px/1.7 var(--wa-font-family-code, monospace);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        tab-size: 2;
      }
      details {
        margin-top: 18px;
      }
      summary {
        font-size: 12px;
        line-height: 1.7;
        cursor: pointer;
        margin-bottom: 8px;
      }
      .empty {
        font-size: 12px;
        opacity: 0.6;
        line-height: 1.8;
      }
      .section-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }
      .section-heading h4 {
        margin: 0;
      }
      .section-heading wa-copy-button {
        font-size: 14px;
        opacity: 0.6;
      }
      .section-heading wa-copy-button::part(button) {
        padding: 0;
      }
    `,
  ];
  render() {
    if (!this.scenario) return html`<p class="empty">选择左侧提示词，查看对应配置。</p>`;
    const { generator, when, ...options } = this.scenario.config;
    const code = typeof generator === 'string' ? generator : JSON.stringify(generator, null, 2);
    return html`<div class="config-id">${this.scenario.id} · 只读</div>
      <h3>${this.scenario.example.replace(/\s+https?:\/\/\S+/g, '').split(/[：\n]/)[0]}</h3>
      <p class="description">${this.scenario.label}</p>
      <section>
        <h4>示例问句</h4>
        <p class="question">${this.scenario.example}</p>
      </section>
      <section>
        <h4>覆盖能力</h4>
        <div class="tags">
          ${this.scenario.covers.map((name) => html`<span class="tag" title=${name}>${name.replace(/^(generator|response)\./, '')}</span>`)}
        </div>
      </section>
      <section>
        <h4>匹配参数 · 只读</h4>
        <pre>${JSON.stringify(options, null, 2)}</pre>
      </section>
      <section>
        <div class="section-heading">
          <h4>生成器</h4>
          <wa-copy-button
            .value=${this.scenario.generatorSource}
            copy-label="复制生成器（含导入与依赖）"
            success-label="已复制"
          ></wa-copy-button>
        </div>
        <pre>${code}</pre>
      </section>
      ${
        when
          ? html`<details>
              <summary>可用条件</summary>
              <pre>${String(when)}</pre>
            </details>`
          : nothing
      }
      ${
        this.scenario.implementation
          ? html`<section>
              <div class="section-heading">
                <h4>完整 TypeScript 配置（含所需依赖）</h4>
                <wa-copy-button
                  .value=${this.scenario.implementation.code}
                  copy-label="复制完整 TypeScript 配置"
                  success-label="已复制"
                ></wa-copy-button>
              </div>
            </section>`
          : nothing
      }`;
  }
}
