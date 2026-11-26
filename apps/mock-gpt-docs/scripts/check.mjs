// MockGPT 文档站的产物检查：先完整执行一次生成，再核对公开导出与手写编排清单一致、
// 双语页面都实际写出、路由不碰撞、无内部符号或本地路径混入。
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { generateSite } from './generate.mjs';
import { extractApi } from './extract-api.mjs';
import { pages, englishPages } from './examples.mjs';
import { contentRoot } from './paths.mjs';

const exists = (filename) =>
  access(filename).then(
    () => true,
    () => false,
  );

const { report } = await generateSite();
const api = await extractApi();
const publicNames = api.records.map((record) => record.name);
const documented = pages.flatMap((page) => page.symbols.map((symbol) => symbol.name));

assert.deepEqual(
  [...publicNames].sort(),
  [...documented].sort(),
  '每个公开导出都必须被文档化且恰好一次',
);
assert.ok(publicNames.length > 0, '公开 API 为空');
assert.equal(report.publicSymbols, publicNames.length, '生成的符号数量与抽取不一致');
for (const name of documented)
  assert.ok(publicNames.includes(name), `编排清单包含不存在的符号：${name}`);

const routes = ['/en/api/', ...pages.map((page) => '/en/api/' + page.slug), '/zh/api/', ...pages.map((page) => '/zh/api/' + page.slug)];
assert.equal(new Set(routes).size, routes.length, 'API 路由碰撞');
assert.equal(new Set(pages.map((page) => page.slug)).size, pages.length, '页面 slug 碰撞');

for (const record of api.records) {
  assert.ok(/^[A-Za-z_$][\w$]*$/.test(record.name), `非法公开名称：${record.name}`);
  assert.ok(
    !record.name.includes('/Users/') && !record.name.includes('__@'),
    `内部符号混入公开名称：${record.name}`,
  );
  const parameters = [
    ...(record.signatures ?? []),
    ...record.members.flatMap((member) => member.signatures),
  ].flatMap((signature) => signature.parameters);
  for (const parameter of parameters)
    assert.ok(
      !/^__\d+$/.test(parameter.name),
      `编译器内部参数名混入：${record.name}.${parameter.name}`,
    );
  for (const member of record.members) {
    assert.ok(
      /^[\w$]+$/.test(member.name) && !member.name.includes('__@'),
      `内部成员混入：${record.name}.${member.name}`,
    );
  }
}

for (const locale of ['zh', 'en']) {
  const apiDir = path.join(contentRoot, locale, 'api');
  assert.ok(await exists(apiDir), `缺少 ${locale} API 目录`);
  const files = (await readdir(apiDir)).filter((name) => name.endsWith('.md'));
  assert.ok(files.includes('index.md'), `手写总览 /${locale}/api/index.md 缺失`);
  const generated = files.filter((name) => name !== 'index.md').map((name) => name.replace(/\.md$/, ''));
  assert.deepEqual(
    [...generated].sort(),
    pages.map((page) => page.slug).sort(),
    `${locale} 生成页面与编排清单不一致`,
  );
  for (const slug of generated) {
    const text = await readFile(path.join(apiDir, slug + '.md'), 'utf8');
    assert.ok(text.trim().length > 0, `${locale} 生成页面为空：${slug}`);
    assert.ok(
      !/dist\/esm/.test(text) && !/\/Users\//.test(text),
      `${locale} 生成页面混入本地路径或构建内部符号：${slug}`,
    );
  }
}

// 指南页面中英文都实际存在，且位于同级语言目录。
for (const locale of ['zh', 'en']) {
  const guideDir = path.join(contentRoot, locale, 'guide');
  for (const name of ['index.md', 'step-1.md', 'step-7.md', 'protocols.md']) {
    assert.ok(
      await exists(path.join(guideDir, name)),
      `Missing ${locale} guide page: ${name}`,
    );
  }
}

// 根路径只是语言入口：不渲染首页内容，由 head 内联脚本按浏览器语言进入 /en/ 或 /zh/。
const rootEntry = await readFile(path.join(contentRoot, 'index.md'), 'utf8');
assert.ok(rootEntry.includes('layout: false'), '根路径必须是语言入口，而不是某个语言的首页');
assert.ok(!/^#|layout: home/m.test(rootEntry), '根路径不应渲染首页内容');

console.log(
  JSON.stringify(
    {
      modules: api.modules.length,
      publicSymbols: publicNames.length,
      pages: pages.length,
      locales: ['zh', 'en'],
      routes,
    },
    null,
    2,
  ),
);
