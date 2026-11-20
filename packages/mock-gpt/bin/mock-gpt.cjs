#!/usr/bin/env node
/**
 * Command-line entry for running MockGPT as a local OpenAI-compatible server.
 *
 * Only the `serve` subcommand exists: it loads a config module, starts the HTTP server on the
 * requested host/port and prints the `/v1/chat/completions` URL. `SIGINT`/`SIGTERM` close the
 * server once. It imports the built `dist` output, so run it after building the package.
 *
 * Usage: `mock-gpt serve --config ./mock.config.mjs [--host 127.0.0.1] [--port 4317]`.
 */
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { parseArgs } = require('node:util');
const { MockGPT } = require('../dist/cjs/index.js');
const { createMockServer } = require('../dist/cjs/node.js');
async function main() {
  const { values, positionals } = parseArgs({
    options: {
      config: { type: 'string' },
      host: { type: 'string', default: '127.0.0.1' },
      port: { type: 'string', default: '4317' },
      help: { type: 'boolean' },
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log('mock-gpt serve [--config ./mock.config.mjs] [--host 127.0.0.1] [--port 4317]');
    return;
  }
  if (positionals.length !== 1 || positionals[0] !== 'serve')
    throw new Error('Expected: mock-gpt serve --config ./mock.config.mjs');
  if (!values.config) throw new Error('Specify --config ./mock.config.mjs');
  const config = (await import(pathToFileURL(resolve(values.config)).href)).default;
  const server = createMockServer({ mock: new MockGPT(config) });
  const address = await server.listen({ host: values.host, port: Number(values.port) });
  console.log(`MockGPT: ${address.url}/v1/chat/completions`);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await server.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
