/**
 * 校验 Playground 的 Vite 静态构建产物：入口 HTML 引用的 JS/CSS 必须自带场景目录
 * 与示例源码，且不能残留 Node 内置模块或仅开发服务器可用的接口，以便部署到任意
 * 路径前缀。测试位于构建链末端，只消费构建结果，不覆盖浏览器内交互。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

test('static build includes its catalog and code examples and works under a path prefix', async (t) => {
  const output = await mkdtemp(join(tmpdir(), 'mockgpt-static-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  await build({
    root: fileURLToPath(new URL('../', import.meta.url)),
    logLevel: 'error',
    build: { outDir: output },
  });
  const html = await readFile(join(output, 'index.html'), 'utf8');
  // 只检查入口 HTML 直接引用的资源，确保发布产物无需额外运行时依赖。
  const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((item) => item[1]);
  assert.ok(assets.some((path) => path.endsWith('.js')));
  assert.ok(assets.some((path) => path.endsWith('.css')));
  for (const path of assets) {
    const content = await readFile(join(output, path), 'utf8');
    // 生产包不得引用 Node 内置模块，也不能保留由开发插件提供的场景请求路径。
    assert.doesNotMatch(content, /__vite-browser-external|from\s*["']node:|\/api\/scenarios/);
    if (path.endsWith('.js')) {
      assert.match(content, /生成用户资料/);
      assert.match(content, /src\/scenarios\/composed-generators\.ts/);
      assert.match(content, /browser-fetch/);
    }
  }
  // 绝对路径会在反代子路径部署时指向错误位置，入口资源必须保持相对引用。
  assert.doesNotMatch(html, /["']\/(?:src|assets)\//);
});
