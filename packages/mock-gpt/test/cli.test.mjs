/**
 * End-to-end tests of the `mock-gpt serve` CLI.
 *
 * Each case spawns the real binary with a generated config file, waits for the startup banner to
 * learn the bound port, exercises JSON/error/network routes, and checks that SIGTERM exits cleanly.
 * Both config module formats are covered (`.mjs` and `.cjs`). Runs against the built output in
 * `dist/` plus `bin/mock-gpt.cjs`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
for (const format of ['mjs', 'cjs'])
  test(`CLI loads ${format} helpers, serves model API and exits on SIGTERM`, async (t) => {
    const temporary = await mkdtemp(join(tmpdir(), 'mock-gpt-cli-'));
    t.after(() => rm(temporary, { recursive: true, force: true }));
    const config = join(temporary, `mock.config.${format}`);
    const module = new URL(`../dist/${format === 'mjs' ? 'esm' : 'cjs'}/index.js`, import.meta.url);
    const imports =
      format === 'mjs'
        ? `import { responses, generators, MockGPTError } from ${JSON.stringify(module.href)};`
        : `const { responses, generators, MockGPTError } = require(${JSON.stringify(fileURLToPath(module))});`;
    const declaration = format === 'mjs' ? 'export default' : 'module.exports =';
    await writeFile(
      config,
      `${imports}\n${declaration} { rules: [
    { prompt: 'hello', generator: responses.text('hello') },
    { prompt: 'tool', generator: generators.sequence([responses.toolCalls([{ name: 'weather', arguments: { city: '武汉' } }])]) },
    { prompt: 'http', generator: responses.httpError(429) },
    { prompt: 'network', generator: responses.reject('offline') },
    { prompt: 'error', generator: () => { throw new MockGPTError('MOCK_WEB_HTTP', 'upstream failure', 502, { upstreamStatus: 403 }); } }
  ] };\n`,
    );
    // Port 0 lets the OS pick a free port; the startup banner on stdout reports the real one.
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('../bin/mock-gpt.cjs', import.meta.url)),
        'serve',
        '--config',
        config,
        '--port',
        '0',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const exited = once(child, 'exit');
    t.after(() => {
      if (child.exitCode === null) child.kill('SIGTERM');
    });
    let stdout = '',
      stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CLI failed to start: ' + stderr)), 5000);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', () => {
        clearTimeout(timer);
        reject(new Error('CLI exited: ' + stderr));
      });
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        const match = /MockGPT: (http:\/\/[^\s]+)\/v1\/chat\/completions/.exec(stdout);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
    });
    const call = (content) =>
      fetch(base + '/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: 'demo', messages: [{ role: 'user', content }] }),
      });
    const result = await call('hello');
    assert.equal(result.status, 200);
    assert.equal((await result.json()).choices[0].message.content, 'hello');
    const tool = (await (await call('tool')).json()).choices[0].message.tool_calls[0];
    assert.equal(tool.function.name, 'weather');
    assert.equal((await call('http')).status, 429);
    const failure = await call('error');
    assert.equal(failure.status, 502);
    assert.equal((await failure.json()).error.code, 'MOCK_WEB_HTTP');
    await assert.rejects(call('network'));
    assert.equal((await fetch(base + '/playground')).status, 404);
    child.kill('SIGTERM');
    const [code] = await exited;
    assert.equal(code, 0);
  });
