/**
 * VitePress 站点配置：读取部署域名与子路径环境变量，合并 generateSite 产出的
 * API 侧边栏，并声明中英文双语导航、搜索与页脚。
 * 各语言位于同级目录（/en/、/zh/）；根路径直接渲染英文首页，不放跳转页。
 */
import { defineConfig } from 'vitepress';
import { generateSite } from '../scripts/generate.mjs';
import { locales as siteLocales } from '../scripts/locales.mjs';
import { alternateRoutes, routeFromRelative } from '../scripts/locale-routes.mjs';

const base = process.env.MOCK_GPT_DOCS_BASE ?? '/';
const origin = process.env.MOCK_GPT_DOCS_ORIGIN ?? 'https://mockgpt-docs.pages.jangts.cafe';
if (new URL(origin).origin !== origin || !/^https?:/.test(origin))
  throw new Error('MOCK_GPT_DOCS_ORIGIN must be an http(s) origin without a path.');
if (!/^\/(?:[a-zA-Z0-9._~-]+\/)*$/.test(base) || base.includes('/../'))
  throw new Error('MOCK_GPT_DOCS_BASE must be / or a trailing-slash URL path such as /mock-gpt/.');

function themeFor(locale, generated) {
  const t = locale.theme;
  const p = (value) => locale.prefix + value;
  return {
    nav: [
      { text: locale.nav.guide, link: p('/guide/') },
      { text: locale.nav.api, link: p('/api/') },
      { text: locale.nav.playground, link: 'https://mockgpt-playground.pages.jangts.cafe/' },
    ],
    sidebar: {
      [p('/guide/')]: [
        {
          text: locale.id === 'zh' ? '指南课程' : 'Guide course',
          items: [
            { text: locale.id === 'zh' ? '课程简介' : 'Introduction', link: p('/guide/') },
            { text: locale.id === 'zh' ? '第 1 步 · 最小应答' : 'Step 1 · Minimal reply', link: p('/guide/step-1') },
            { text: locale.id === 'zh' ? '第 2 步 · 规则与业务问答' : 'Step 2 · Rules & Q&A', link: p('/guide/step-2') },
            { text: locale.id === 'zh' ? '第 3 步 · 结构化资料' : 'Step 3 · Structured data', link: p('/guide/step-3') },
            { text: locale.id === 'zh' ? '第 4 步 · 工具提议' : 'Step 4 · Tool proposals', link: p('/guide/step-4') },
            { text: locale.id === 'zh' ? '第 5 步 · 生成器与随机资料' : 'Step 5 · Generators', link: p('/guide/step-5') },
            { text: locale.id === 'zh' ? '第 6 步 · 流式输出与接线' : 'Step 6 · Streaming & wiring', link: p('/guide/step-6') },
            { text: locale.id === 'zh' ? '多协议与生命周期' : 'Protocols and lifecycles', link: p('/guide/protocols') },
            { text: locale.id === 'zh' ? '第 7 步 · 长文本摘要与要点' : 'Step 7 · Summary & bullets', link: p('/guide/step-7') },
          ],
        },
      ],
      [p('/api/')]: generated.sidebar[p('/api/')] ?? generated.sidebar['/api/'],
    },
    outline: { level: [2, 3], label: t.outlineLabel },
    returnToTopLabel: t.returnToTopLabel,
    sidebarMenuLabel: t.sidebarMenuLabel,
    darkModeSwitchLabel: t.darkModeSwitchLabel,
    lightModeSwitchTitle: t.lightModeSwitchTitle,
    darkModeSwitchTitle: t.darkModeSwitchTitle,
    docFooter: { prev: t.docFooterPrev, next: t.docFooterNext },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: t.searchButtonText, buttonAriaLabel: t.searchButtonAriaLabel },
          modal: {
            noResultsText: t.searchNoResultsText,
            resetButtonTitle: t.searchResetButtonTitle,
            displayDetails: t.searchDisplayDetails,
            footer: {
              selectText: t.searchSelectText,
              navigateText: t.searchNavigateText,
              closeText: t.searchCloseText,
            },
          },
        },
        miniSearch: {
          options: {
            tokenize: (text: string) =>
              Array.from(
                new Intl.Segmenter(locale.lang, { granularity: 'word' }).segment(text),
                (part) => part.segment.toLowerCase(),
              ).filter((term) => /[\p{L}\p{N}_]/u.test(term)),
          },
          searchOptions: { prefix: true, fuzzy: 0.15 },
        },
      },
    },
    footer: { message: t.footerMessage, copyright: t.footerCopyright },
  };
}

export default async () => {
  const generated = await generateSite();
  const englishLocale = siteLocales.find((locale) => locale.id === 'en');

  const alternateHead = (pageData) => {
    const routes = alternateRoutes(pageData.relativePath);
    // 根路径是英文首页副本，规范地址指向 /en/，避免同一内容出现两个索引地址。
    const canonical =
      pageData.relativePath === 'index.md'
        ? routes.en
        : routeFromRelative(pageData.relativePath);
    return [
      ['link', { rel: 'canonical', href: origin + base + canonical.slice(1) }],
      ['link', { rel: 'alternate', hreflang: 'zh-CN', href: origin + base + routes.zh.slice(1) }],
      ['link', { rel: 'alternate', hreflang: 'en', href: origin + base + routes.en.slice(1) }],
      [
        'link',
        { rel: 'alternate', hreflang: 'x-default', href: origin + base + routes.en.slice(1) },
      ],
    ];
  };

  return defineConfig({
    title: englishLocale.title,
    description: englishLocale.description,
    lang: englishLocale.lang,
    base,
    head: [
      ['link', { rel: 'icon', type: 'image/png', href: base + 'branding/mockgpt-icon.png' }],
      ['script', { src: base + 'auto-lang.js' }],
    ],
    srcDir: 'content',
    outDir: 'dist',
    cleanUrls: false,
    lastUpdated: false,
    sitemap: { hostname: origin + base },
    transformHead: ({ pageData }) => alternateHead(pageData),
    markdown: {
      lineNumbers: true,
      theme: { light: 'github-light', dark: 'github-dark' },
    },
    locales: Object.fromEntries(
      siteLocales.map((locale) => [
        locale.viteKey,
        {
          label: locale.label,
          lang: locale.lang,
          link: locale.prefix + '/',
          title: locale.title,
          description: locale.description,
          themeConfig: themeFor(locale, generated),
        },
      ]),
    ),
    themeConfig: {
      logo: { src: '/branding/mockgpt-icon.png', alt: 'MockGPT' },
      siteTitle: 'MockGPT',
      // 根路径的英文首页副本使用顶层配置；其余页面按 /en/、/zh/ 语言配置渲染。
      ...themeFor(englishLocale, generated),
    },
  });
};
