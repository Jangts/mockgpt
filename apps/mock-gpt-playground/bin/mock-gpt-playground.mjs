#!/usr/bin/env node
/**
 * CLI 入口：校验 --host/--port 后用 Vite preview 托管已构建的静态 Playground。
 * 运行期不重新编译，也不提供目录浏览。
 */
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

let server;
try {
  const { values } = parseArgs({
    options: {
      host: { type: 'string', default: '127.0.0.1' },
      port: { type: 'string', default: '2333' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.log(
      'Usage: mock-gpt-playground [--host 127.0.0.1] [--port 2333]\nServes the prebuilt static MockGPT Playground.',
    );
  } else {
    const port = Number(values.port);
    // 先按字符串校验再转数字，避免 '12abc' 被 Number 静默接受。
    if (!/^\d+$/.test(values.port) || !Number.isInteger(port) || port < 0 || port > 65535)
      throw new Error('Port must be an integer from 0 to 65535');
    const { preview } = await import('vite');
    // configFile: false 只托管构建产物，不重新读取开发配置。
    server = await preview({
      root: fileURLToPath(new URL('../', import.meta.url)),
      configFile: false,
      preview: { host: values.host, port, strictPort: true, open: false },
    });
    const shutdown = async () => {
      // 收到信号先关闭监听再退出，避免端口残留。
      await server.close();
      process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    server.printUrls();
  }
} catch (error) {
  await server?.close();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
