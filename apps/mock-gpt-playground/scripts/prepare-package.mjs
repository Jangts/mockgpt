/**
 * 打包前准备：用应用的 Vite 配置把 Playground 构建到 dist/，
 * 供 CLI preview 与发布产物直接使用。
 */
import { build } from 'vite';
import { fileURLToPath } from 'node:url';

await build({ root: fileURLToPath(new URL('../', import.meta.url)) });
