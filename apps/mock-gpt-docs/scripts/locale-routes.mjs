// MockGPT 文档站语言路由：各语言位于同级目录（/en/ 与 /zh/）；根路径直接渲染英文首页。

export const localeIds = ['zh', 'en'];

/** 根路径的英文首页副本（index.md）按英文处理。 */
export function localeOfPath(relativePath) {
  return relativePath.startsWith('zh/') ? 'zh' : 'en';
}

/**
 * 把相对 Markdown 路径转换为静态站点路由，保留语言目录（/en/、/zh/）。
 * @param {string} relativePath 相对 srcDir 的 Markdown 路径。
 * @returns {string} 以 / 开头、带 .html（目录首页除外）的路由。
 */
export function routeFromRelative(relativePath) {
  const withoutExtension = relativePath.replace(/\.md$/, '');
  const trimmed = withoutExtension.replace(/(^|\/)index$/, '$1');
  if (!trimmed) return '/';
  return trimmed.endsWith('/') ? '/' + trimmed : '/' + trimmed + '.html';
}

export function alternateRoutes(relativePath) {
  const rest = relativePath.replace(/^(?:en|zh)\//, '');
  return {
    zh: routeFromRelative('zh/' + rest),
    en: routeFromRelative('en/' + rest),
  };
}