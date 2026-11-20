/**
 * Playground 页面根组件：装配提示词列表、对话区和配置面板，管理窄屏抽屉、
 * 输入框高度与滚动跟随，并把发送、停止、清空动作交给 ChatController。
 */
import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { ChatController } from './chat-controller.ts';
import { scenarios } from './scenario-catalog.ts';
import { resetStyles } from './reset-styles.ts';
import mockgptIcon from './assets/mockgpt-icon.svg';
import type { Scenario } from './types.ts';
import type { PromptCatalog } from './components/prompt-catalog.ts';

/**
 * 页面壳组件：桌面为三栏布局，900px 及以下改用左右抽屉，两者共享同一选中场景。
 * 组件只负责展示与交互编排，消息聚合和取消由 ChatController 持有。
 */
@customElement('mockgpt-playground')
export class PlaygroundApp extends LitElement {
  private chat = new ChatController(this);
  private followOutput = true;
  private composerObserver?: ResizeObserver;
  private media = window.matchMedia('(max-width:900px)');
  private onViewportChange = () => {
    this.mobileViewport = this.media.matches;
    if (!this.media.matches) {
      this.leftOpen = false;
      this.rightOpen = false;
    }
  };
  @state() private mobileViewport = this.media.matches;
  @state() private scenarios: Scenario[] = scenarios;
  @state() private selected?: Scenario = scenarios[0];
  @state() private prompt = '';
  @state() private leftOpen = false;
  @state() private rightOpen = false;
  static styles = [
    resetStyles,
    css`
      :host {
        display: block;
        height: 100dvh;
        overflow: hidden;
        color: var(--wa-color-text-normal);
        background: var(--wa-color-surface-default);
      }
      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }
      .shell {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        height: 100%;
        min-height: 0;
        overflow: hidden;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 22px;
        background: var(--wa-color-surface-raised, #fff);
        border-bottom: 1px solid var(--wa-color-surface-border, #e2e8f0);
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .brand-icon {
        display: block;
        flex: none;
        width: 40px;
        height: 40px;
      }
      .header-action {
        flex: none;
      }
      .header-action::part(base) {
        width: 30px;
        min-width: 30px;
        height: 30px;
        min-height: 30px;
        padding: 0;
      }
      .header-action svg {
        display: block;
        width: 18px;
        height: 18px;
      }
      h1 {
        font-size: 18px;
        line-height: 1.25;
        margin: 0;
      }
      header p {
        margin: 1px 0 0;
        font-size: 12px;
        line-height: 1.25;
        opacity: 0.6;
      }
      .mobile {
        display: none;
      }
      .workspace {
        display: grid;
        grid-template-columns: 260px minmax(0, 1fr) 360px;
        grid-template-rows: minmax(0, 1fr);
        min-width: 0;
        min-height: 0;
        overflow: hidden;
      }
      aside {
        --sidebar-inset: 14px;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        padding: 18px 0;
        overflow: hidden;
      }
      aside.left {
        border-right: 1px solid var(--wa-color-surface-border, #e2e8f0);
      }
      aside.right {
        border-left: 1px solid var(--wa-color-surface-border, #e2e8f0);
      }
      h2 {
        flex: none;
        font-size: 13px;
        margin: 0 calc(var(--sidebar-inset, 0px) + 4px) 14px;
      }
      prompt-catalog,
      scenario-config {
        flex: 1;
        min-height: 0;
      }
      main {
        --chat-content-width: 850px;
        --message-inset: 24px;
        --panel-gap: 16px;
        position: relative;
        display: block;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        background: var(--wa-color-surface-lowered, #f8fafc);
      }
      .messages {
        height: 100%;
        min-height: 0;
        overflow: auto;
        padding: var(--message-inset);
        padding-bottom: calc(var(--composer-height, 230px) + var(--panel-gap) + 24px);
        scroll-padding-bottom: calc(var(--composer-height, 230px) + var(--panel-gap) + 24px);
        overscroll-behavior: none;
      }
      .composer {
        position: absolute;
        z-index: 2;
        inset-inline: 0;
        bottom: var(--panel-gap);
        width: calc(100% - 24px);
        max-width: calc(var(--chat-content-width) + 44px);
        margin-inline: auto;
        min-width: 0;
        padding: 14px 12px 12px;
        border: 1px solid var(--wa-color-surface-border, #e2e8f0);
        border-radius: 18px;
        background: var(--wa-color-surface-raised, #fff);
        box-shadow: 0 8px 32px rgb(15 23 42 / 0.12);
      }
      .input-surface {
        border: var(--wa-form-control-border-width, 1px) solid
          var(--wa-form-control-border-color, #94a3b8);
        border-radius: 12px;
        overflow: hidden;
        background: var(--wa-form-control-background-color, #fff);
        transition: border-color 0.15s ease;
      }
      .input-surface:focus-within {
        border-color: var(--wa-color-focus, #2563eb);
      }
      .composer-inner {
        width: 100%;
      }
      wa-textarea {
        --input-max-lines: 5;
        --input-line-height: 20.8px;
        --input-text-max-height: min(
          calc(var(--input-max-lines) * var(--input-line-height)),
          calc(35dvh - 16px)
        );
        display: block;
        width: 100%;
        font-size: 13px;
        line-height: var(--input-line-height);
      }
      wa-textarea::part(base) {
        box-sizing: border-box;
        max-height: calc(var(--input-text-max-height) + 16px);
        padding-block: 8px;
        align-items: start;
        overflow: hidden;
        border: 0;
        border-radius: 0;
        background: transparent;
        outline: none;
        box-shadow: none;
      }
      /* 内边距留在滚动视口之外，确保行数上限精确。 */
      wa-textarea::part(textarea),
      wa-textarea::part(textarea-adjuster) {
        box-sizing: border-box;
        min-height: 0;
        max-height: var(--input-text-max-height);
        padding-block: 0;
        font-size: 13px;
        line-height: var(--input-line-height);
      }
      wa-textarea::part(textarea) {
        overflow-y: auto;
        overscroll-behavior: none;
        outline: none;
        box-shadow: none;
      }
      wa-textarea::part(textarea-adjuster) {
        padding: 0;
        overflow: hidden;
      }
      .actions {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
      }
      .action-buttons {
        display: flex;
        flex: none;
        align-items: center;
        gap: 6px;
        margin-inline-start: auto;
      }
      .action-buttons wa-button {
        flex: none;
        margin: 0;
      }
      .action-buttons wa-button::part(base) {
        height: 30px;
        min-height: 30px;
        font-size: 13px;
        padding-inline: 10px;
      }
      wa-button[hidden] {
        display: none;
      }
      .stream-toggle {
        position: relative;
        flex: 0 0 64px;
        width: 64px;
        height: 28px;
        padding: 0;
        border: 1px solid var(--wa-color-surface-border, #cbd5e1);
        border-radius: 999px;
        background: var(--wa-color-neutral-fill-normal, #e5e7eb);
        color: var(--wa-color-text-normal, #334155);
        cursor: pointer;
        font: inherit;
        transition: background-color 0.15s ease;
      }
      .stream-toggle[aria-checked='true'] {
        background: var(--wa-color-brand-fill-loud, #2563eb);
        border-color: transparent;
        color: white;
      }
      .stream-label {
        position: absolute;
        inset-block: 0;
        right: 7px;
        display: flex;
        align-items: center;
        font-size: 11px;
        line-height: 1;
      }
      .stream-toggle[aria-checked='true'] .stream-label {
        right: auto;
        left: 7px;
      }
      .stream-thumb {
        position: absolute;
        top: 3px;
        left: 3px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: white;
        box-shadow: 0 1px 3px rgb(0 0 0 / 0.15);
        transition: transform 0.15s ease;
      }
      .stream-toggle[aria-checked='true'] .stream-thumb {
        transform: translateX(36px);
      }
      .action-icon {
        display: block;
        width: 16px;
        height: 16px;
      }
      .utility-action::part(base) {
        font-size: 13px;
      }
      .send-action::part(base) {
        border-radius: 999px;
      }
      .status {
        font-size: 11px;
        line-height: 1.5;
        opacity: 0.55;
        margin: 8px 0 0;
      }
      .status:empty {
        display: none;
      }
      .welcome {
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-height: 100%;
        width: 100%;
        max-width: 760px;
        margin: 0 auto;
        padding: 20px 0;
        text-align: center;
        container-type: inline-size;
      }
      .welcome-mark {
        display: block;
        width: 64px;
        height: 64px;
        margin: 0 auto 18px;
      }
      .welcome h2 {
        font-size: 21px;
        margin: 0 0 10px;
      }
      .welcome p {
        font-size: 13px;
        line-height: 1.8;
        opacity: 0.6;
        margin: 0;
      }
      .suggestions {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 8px;
        margin-top: 22px;
      }
      .suggestions wa-button {
        min-width: 0;
      }
      .suggestions wa-button::part(base) {
        width: 100%;
        font-size: 13px;
        padding-inline: 10px;
      }
      @container (max-width: 680px) {
        .suggestions {
          grid-template-columns: repeat(6, minmax(0, 1fr));
        }
        .suggestions wa-button {
          grid-column: span 2;
        }
        .suggestions wa-button:nth-child(4) {
          grid-column: 2 / span 2;
        }
        .suggestions wa-button:nth-child(5) {
          grid-column: 4 / span 2;
        }
      }
      @container (max-width: 420px) {
        .suggestions {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .suggestions wa-button,
        .suggestions wa-button:nth-child(4) {
          grid-column: auto;
        }
        .suggestions wa-button:nth-child(5) {
          grid-column: 1 / -1;
        }
      }
      wa-drawer::part(body) {
        overscroll-behavior: none;
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
      }
      @media (min-width: 901px) and (max-width: 1200px) {
        .workspace {
          grid-template-columns: 220px minmax(0, 1fr) 290px;
        }
        main {
          --message-inset: 18px;
        }
        .composer {
          padding: 12px 10px;
        }
      }
      @media (max-width: 900px) {
        .brand {
          gap: 6px;
        }
        .brand-icon {
          width: 32px;
          height: 32px;
        }
        wa-textarea {
          --input-max-lines: 3;
        }
        .workspace {
          grid-template-columns: minmax(0, 1fr);
        }
        aside.desktop {
          display: none;
        }
        .mobile {
          display: inline-flex;
        }
        header {
          padding: 8px 16px;
        }
        h1 {
          font-size: 16px;
        }
        header p {
          display: none;
        }
        main {
          --message-inset: 16px;
          --panel-gap: 10px;
        }
        .composer {
          padding: 12px 10px;
        }
        .utility-action .action-label {
          display: none;
        }
        .action-buttons .utility-action {
          width: 30px;
        }
        .action-buttons .utility-action::part(base) {
          width: 30px;
          min-width: 30px;
          padding: 0;
          gap: 0;
        }
        .utility-action::part(label) {
          display: none;
        }
      }
    `,
  ];
  connectedCallback() {
    super.connectedCallback();
    this.media.addEventListener('change', this.onViewportChange);
    void this.watchComposer();
  }
  disconnectedCallback() {
    this.composerObserver?.disconnect();
    this.media.removeEventListener('change', this.onViewportChange);
    super.disconnectedCallback();
  }
  private async watchComposer() {
    await this.updateComplete;
    if (!this.isConnected) return;
    const main = this.renderRoot.querySelector<HTMLElement>('main');
    const composer = this.renderRoot.querySelector<HTMLElement>('.composer');
    const messages = this.renderRoot.querySelector<HTMLElement>('.messages');
    if (!main || !composer || !messages) return;
    this.composerObserver?.disconnect();
    this.composerObserver = new ResizeObserver(() => {
      main.style.setProperty(
        '--composer-height',
        `${Math.ceil(composer.getBoundingClientRect().height)}px`,
      );
      if (this.followOutput && this.chat.messages.length)
        messages.scrollTop = messages.scrollHeight;
    });
    this.composerObserver.observe(composer);
  }
  private openExamples() {
    if (this.mobileViewport) {
      this.leftOpen = true;
      return;
    }
    this.renderRoot.querySelector<PromptCatalog>('.left prompt-catalog')?.focusSearch();
  }
  private select(event: CustomEvent<Scenario>) {
    this.selected = event.detail;
    this.prompt = event.detail.example;
    this.leftOpen = false;
  }
  private async send() {
    if (this.chat.busy || !this.prompt.trim()) return;
    const prompt = this.prompt;
    this.followOutput = true;
    this.prompt = '';
    if (!(await this.chat.send(prompt)) && !this.prompt) this.prompt = prompt;
  }
  render() {
    return html`
      <div class="shell">
        <header>
          <wa-button
            class="mobile header-action"
            size="small"
            appearance="plain"
            aria-label="打开提示词列表"
            title="提示词列表"
            aria-expanded=${String(this.leftOpen)}
            @click=${() => {
              this.leftOpen = true;
            }}
            ><svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg
          ></wa-button>
          <div class="brand">
            <img class="brand-icon" src=${mockgptIcon} alt="" width="40" height="40" />
            <div>
              <h1>MockGPT Playground</h1>
              <p>模拟模型输出与配置演示</p>
            </div>
          </div>
          <wa-button
            class="mobile header-action"
            size="small"
            appearance="plain"
            aria-label="打开提示词配置"
            title="提示词配置"
            aria-expanded=${String(this.rightOpen)}
            @click=${() => {
              this.rightOpen = true;
            }}
            ><svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M4 7h8M16 7h4M4 17h4M12 17h8" />
              <circle cx="14" cy="7" r="2" />
              <circle cx="10" cy="17" r="2" /></svg
          ></wa-button>
        </header>
        <div class="workspace">
          <aside class="left desktop">
            <prompt-catalog
              .scenarios=${this.scenarios}
              .selected=${this.selected?.id ?? ''}
              @select-scenario=${this.select}
            ></prompt-catalog>
          </aside>
          <main>
            <div
              class="messages"
              @scroll=${(event: Event) => {
                const box = event.currentTarget as HTMLElement;
                this.followOutput = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
              }}
              @messages-updated=${(event: Event) => {
                const box = event.currentTarget as HTMLElement;
                if (this.followOutput) box.scrollTop = box.scrollHeight;
              }}
            >
              ${
                this.chat.messages.length
                  ? html`<chat-messages
                      .messages=${this.chat.messages}
                      @open-examples=${this.openExamples}
                    ></chat-messages>`
                  : html`<section class="welcome">
                      <img
                        class="welcome-mark"
                        src=${mockgptIcon}
                        alt="MockGPT"
                        width="64"
                        height="64"
                      />
                      <h2>开始一段模拟对话</h2>
                      <p>
                        从左侧选择提示词，或直接输入问题。<br />在这里观察生成过程，在右侧查看对应配置。
                      </p>
                      <div class="suggestions">
                        ${this.scenarios
                          .filter((item) =>
                            ['chat', 'users', 'image', 'table', 'recommend'].includes(item.id),
                          )
                          .map(
                            (item) =>
                              html`<wa-button
                                appearance="outlined"
                                @click=${() => {
                                  if (this.chat.busy) return;
                                  this.selected = item;
                                  this.prompt = item.example;
                                  void this.send();
                                }}
                                >${item.example}</wa-button
                              >`,
                          )}
                      </div>
                    </section>`
              }
            </div>
            <div class="composer">
              <div class="composer-inner">
                <div class="input-surface">
                  <wa-textarea
                    aria-label="发送消息"
                    placeholder="输入问题，或从左侧选择提示词…"
                    rows=${this.mobileViewport ? 2 : 3}
                    resize="auto"
                    @keydown=${(event: KeyboardEvent) => {
                      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault();
                        void this.send();
                      }
                    }}
                    .value=${this.prompt}
                    ?disabled=${this.chat.busy}
                    @input=${(event: Event) => {
                      this.prompt = (event.target as HTMLTextAreaElement).value;
                    }}
                  ></wa-textarea>
                </div>
                <div class="actions">
                  <button
                    class="stream-toggle"
                    type="button"
                    role="switch"
                    aria-label="流式输出"
                    aria-checked=${String(this.chat.streaming)}
                    @click=${() => {
                      this.chat.streaming = !this.chat.streaming;
                      this.requestUpdate();
                    }}
                  >
                    <span class="stream-label">流式</span
                    ><span class="stream-thumb" aria-hidden="true"></span>
                  </button>
                  <div class="action-buttons">
                    <wa-button
                      class="utility-action"
                      size="small"
                      appearance="plain"
                      aria-label="清空会话"
                      title="清空会话"
                      ?disabled=${this.chat.busy}
                      @click=${() => this.chat.clear()}
                      ><svg
                        slot="start"
                        class="action-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg
                      ><span class="action-label">清空会话</span></wa-button
                    ><wa-button
                      class="utility-action"
                      size="small"
                      aria-label="粘贴正文"
                      title="粘贴正文"
                      ?disabled=${this.chat.busy}
                      @click=${() => {
                        this.prompt = '总结：\n';
                      }}
                      appearance="plain"
                      ><svg
                        slot="start"
                        class="action-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <rect x="8" y="3" width="8" height="4" rx="1" />
                        <path d="M8 5H5v16h14V5h-3M8 12h8M8 16h6" /></svg
                      ><span class="action-label">粘贴正文</span></wa-button
                    ><wa-button
                      size="small"
                      ?hidden=${!this.chat.busy}
                      ?disabled=${!this.chat.busy}
                      @click=${() => this.chat.stop()}
                      >停止</wa-button
                    ><wa-button
                      class="send-action"
                      size="small"
                      variant="brand"
                      ?disabled=${this.chat.busy || !this.prompt.trim()}
                      @click=${this.send}
                      >发送</wa-button
                    >
                  </div>
                </div>
                <p class="status" role="status">${this.chat.status}</p>
              </div>
            </div>
          </main>
          <aside class="right desktop">
            <h2>提示词配置</h2>
            <scenario-config .scenario=${this.selected}></scenario-config>
          </aside>
        </div>
      </div>
      <wa-drawer
        label="提示词列表"
        placement="start"
        ?open=${this.leftOpen}
        @wa-after-hide=${() => {
          this.leftOpen = false;
        }}
        ><prompt-catalog
          compact
          .scenarios=${this.scenarios}
          .selected=${this.selected?.id ?? ''}
          @select-scenario=${this.select}
        ></prompt-catalog
      ></wa-drawer>
      <wa-drawer
        label="提示词配置"
        placement="end"
        ?open=${this.rightOpen}
        @wa-after-hide=${() => {
          this.rightOpen = false;
        }}
        ><scenario-config .scenario=${this.selected}></scenario-config
      ></wa-drawer>
    `;
  }
}
