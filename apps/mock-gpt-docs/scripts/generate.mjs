// MockGPT 文档站的内容生成：按 examples.mjs 的编排把抽取到的符号渲染为 API 页，
// 按语言分别写入 /en/ 与 /zh/（同级目录）；根路径只作为语言入口，不放首页内容。
import { writeFile, mkdir, rm, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { extractApi } from './extract-api.mjs';
import { renderPage } from './render-api.mjs';
import { pages, englishPages, pageExamples } from './examples.mjs';
import { locales } from './locales.mjs';
import { contentRoot, sdkRoot, workspaceRoot } from './paths.mjs';
import { syncBrandAssets } from '../../../development/scripts/site-sync/brand-assets.mjs';

const zhApi = path.join(contentRoot, 'zh', 'api');
const enApi = path.join(contentRoot, 'en', 'api');

export async function generateSite() {
  const api = await extractApi();
  const byName = new Map(api.records.map((record) => [record.name, record]));

  function resolve(definitions) {
    return definitions.map((page) => ({
      ...page,
      symbols: page.symbols.map((entry) => {
        const record = byName.get(entry.name);
        if (!record) throw new Error(`编排清单引用了 SDK 不存在的符号：${page.slug}:${entry.name}`);
        return { ...entry, record };
      }),
    }));
  }

  const resolvedZh = resolve(pages);
  const resolvedEn = resolve(englishPages);

  await mkdir(zhApi, { recursive: true });
  await mkdir(enApi, { recursive: true });

  // 仅删除生成的 API 模块页，保留手写 index.md。
  async function cleanGenerated(dir) {
    for (const name of await readdir(dir).catch(() => [])) {
      if (name !== 'index.md' && name.endsWith('.md')) {
        await rm(path.join(dir, name));
      }
    }
  }
  await cleanGenerated(zhApi);
  await cleanGenerated(enApi);

  for (const page of resolvedZh) {
    await writeFile(
      path.join(zhApi, page.slug + '.md'),
      renderPage(page, pageExamples.zh[page.slug], locales[0]),
    );
  }
  for (const page of resolvedEn) {
    await writeFile(
      path.join(enApi, page.slug + '.md'),
      renderPage(page, pageExamples.en[page.slug], locales[1]),
    );
  }

  // The published SDK guide owns protocol paths, defaults and examples for both surfaces.
  const protocolGuide = await readFile(path.join(sdkRoot, 'docs', 'multi-protocol.md'), 'utf8');
  const guideSections = protocolGuide.split(/<a id="(?:english|中文)"><\/a>/);
  if (guideSections.length !== 3 || guideSections.slice(1).some((section) => !section.trim().startsWith('# ')))
    throw new Error('MockGPT SDK guide must contain English and Chinese headings');
  await syncBrandAssets(workspaceRoot, 'apps/mock-gpt-docs');
  for (const [locale, section] of [['en', guideSections[1]], ['zh', guideSections[2]]]) {
    const guide = section.trim().replace(/^(# .+)$/m, `$1\n\n> ${locale === 'zh' ? '适用 SDK 版本' : 'SDK version'}: ${api.version}`)
      .replace(/\(\.\.\/README\.md(?:#中文)?\)/g, `(/${locale}/guide/step-1)`)
      .replace(/\[([^\]]+)\]\(\.\.\/examples\/multi-protocol\.mjs\)/g, '`$1`');
    await writeFile(path.join(contentRoot, locale, 'guide', 'protocols.md'), guide + '\n');
  }

  // 根路径只是语言入口：不渲染首页内容，由 head 内联脚本按浏览器语言进入 /en/ 或 /zh/。
  await writeFile(path.join(contentRoot, 'index.md'), '---\nlayout: false\n---\n');

  const apiSidebar = (prefix, label, overview, list) => [
    {
      text: label,
      items: [
        { text: overview, link: prefix + 'api/' },
        ...list.map((page) => ({ text: page.title, link: prefix + 'api/' + page.slug })),
      ],
    },
  ];
  const sidebar = {
    '/en/api/': apiSidebar('/en/', locales[1].nav.api, 'Overview & error codes', resolvedEn),
    '/zh/api/': apiSidebar('/zh/', locales[0].nav.api, '总览与错误码', resolvedZh),
  };

  const report = {
    version: api.version,
    modules: api.modules.map((module) => module.module),
    publicSymbols: api.records.length,
    pages: resolvedZh.map((page) => ({
      slug: page.slug,
      route: '/zh/api/' + page.slug,
      symbols: page.symbols.map((symbol) => symbol.name),
    })),
  };
  return { sidebar, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const { report } = await generateSite();
  console.log(JSON.stringify(report, null, 2));
}
