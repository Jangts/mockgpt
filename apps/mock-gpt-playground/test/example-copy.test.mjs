import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { MockGPT } from '@jangts/mock-gpt';
import {
  playgroundScenarios,
  playgroundConfig,
  scenarioRule,
} from '../src/scenarios/playground-config.ts';
import { exampleSources } from '../src/scenario-examples.ts';

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries({
      composed: 'composed-generators',
      markdown: 'markdown-generators',
      web: 'browser-web-source',
    }).map(async ([key, name]) => [
      key,
      await readFile(new URL(`../src/scenarios/${name}.ts`, import.meta.url), 'utf8'),
    ]),
  ),
);
const sdk = new URL('../../../packages/mock-gpt/dist/esm/index.js', import.meta.url).href;
const settings = { seed: 42, clock: () => 1000 };
test('all copied modules typecheck with strict and unused-import checks enabled', () => {
  const files = new Map(
    playgroundScenarios.flatMap((scenario) => {
      const code = exampleSources(scenario, sources);
      return ['generator', 'config'].map((kind) => [
        fileURLToPath(new URL(`./virtual-examples/${scenario.id}-${kind}.ts`, import.meta.url)),
        code[kind],
      ]);
    }),
  );
  const options = {
    strict: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };
  const host = ts.createCompilerHost(options),
    getSource = host.getSourceFile.bind(host);
  host.getSourceFile = (file, language, onError, createNew) =>
    files.has(file)
      ? ts.createSourceFile(file, files.get(file), language, true)
      : getSource(file, language, onError, createNew);
  const program = ts.createProgram([...files.keys()], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => process.cwd(),
      getCanonicalFileName: (file) => file,
      getNewLine: () => '\n',
    }),
  );
});
async function load(code) {
  // Resolve only the installed SDK; every local example dependency must already be included.
  const source = code.replaceAll("'@jangts/mock-gpt'", JSON.stringify(sdk));
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length, 0);
  return (
    await import(
      `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`
    )
  ).default;
}

for (const scenario of playgroundScenarios)
  test(`copied generator and config execute independently / ${scenario.id}`, async (t) => {
    if (scenario.id === 'web') {
      const saved = globalThis.fetch;
      t.after(() => {
        globalThis.fetch = saved;
      });
      globalThis.fetch = async () =>
        new Response('阅读区增加二十个座位。周末举行读书会。', {
          headers: { 'content-type': 'text/plain' },
        });
    }
    const code = exampleSources(scenario, sources);
    const generator = await load(code.generator),
      config = await load(code.config);
    const input = { model: 'mock-gpt', messages: [{ role: 'user', content: scenario.example }] };
    const expected = new MockGPT({ ...playgroundConfig(), ...settings });
    const copiedConfig = new MockGPT({ ...config, ...settings });
    const rule =
      scenario.id === 'fallback' ? { generator } : { ...scenarioRule(scenario), generator };
    const copiedGenerator = new MockGPT({ rules: [rule], ...settings });
    const first = await expected.generate(input);
    assert.deepEqual(await copiedConfig.generate(input), first);
    assert.deepEqual(await copiedGenerator.generate(input), first);
    const repetitions = scenario.id === 'step' ? 3 : scenario.id === 'once' ? 1 : 0;
    for (let index = 0; index < repetitions; index++) {
      const result = await Promise.allSettled([
        expected.generate(input),
        copiedConfig.generate(input),
      ]);
      assert.equal(result[0].status, result[1].status);
      if (result[0].status === 'fulfilled') assert.deepEqual(result[1].value, result[0].value);
      else assert.equal(result[1].reason.code, result[0].reason.code);
    }
  });
