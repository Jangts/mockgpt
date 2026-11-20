/**
 * Playground 的 Vite 配置：相对 base 便于静态托管，固定开发端口，
 * 并保持 Lit 装饰器与字段赋值的编译行为。
 */
import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  // Keep Lit fields assignment-based, including sources installed under node_modules.
  oxc: {
    target: 'es2020',
    decorator: { legacy: true },
    assumptions: { setPublicClassFields: true },
  },
  server: { host: '127.0.0.1', port: 2333, strictPort: true },
});
