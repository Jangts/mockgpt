/**
 * 示例源码生成：把已登记的场景规则还原成可复制的生成器表达式、独立
 * 生成器模块和完整 TypeScript 配置，代码面板因此与真实运行配置同源。
 */
import type { PlaygroundScenario } from './scenarios/playground-config.ts';
import type { ExampleModule } from './scenarios/generator-examples.ts';

const sourceFiles: Record<ExampleModule, { file: string; imports: readonly string[] }> = {
  composed: { file: 'src/scenarios/composed-generators.ts', imports: ['generators', 'responses'] },
  markdown: { file: 'src/scenarios/markdown-generators.ts', imports: ['generators'] },
  web: { file: 'src/scenarios/browser-web-source.ts', imports: ['MockGPTError'] },
};
function inlineSource(source: string): string {
  return source
    .replace(/^import .+ from ['"]([^'"]+)['"];\r?$/gm, (_line, specifier: string) => {
      if (!['@jangts/mock-gpt', './composed-generators.ts'].includes(specifier))
        throw new Error(`Unregistered example dependency: ${specifier}`);
      return '';
    })
    .trim();
}
/** 根据已登记的 recipe 及其实际本地依赖，生成可独立使用的 TypeScript 模块。 */
export function exampleSources(
  scenario: PlaygroundScenario,
  sources: Record<ExampleModule, string>,
) {
  const fallback = scenario.id === 'fallback';
  const expression = fallback
    ? 'fallbackReply'
    : typeof scenario.generatorCode === 'function'
      ? scenario.generatorCode()
      : scenario.generatorCode;
  const modules = new Set<ExampleModule>([
    ...(scenario.modules ?? []),
    ...(fallback ? ['composed' as const] : []),
  ]);
  const setupFor = (names: ReadonlySet<ExampleModule>, config = false) => {
    const imports = [
      ...new Set([
        ...(scenario.imports ?? []),
        ...[...names].flatMap((name) => sourceFiles[name].imports),
      ]),
    ];
    const types = [
      ...(names.size ? ['GenerationContext'] : []),
      ...(config ? ['MockGPTOptions'] : []),
    ];
    return [
      ...(imports.length ? [`import { ${imports.join(', ')} } from '@jangts/mock-gpt';`] : []),
      ...(types.length ? [`import type { ${types.join(', ')} } from '@jangts/mock-gpt';`] : []),
      ...[...names].map(
        (name) => `// Source: ${sourceFiles[name].file}\n${inlineSource(sources[name])}`,
      ),
    ].join('\n\n');
  };
  const generatorSetup = setupFor(modules);
  const fields = (['id', 'model', 'times'] as const).flatMap((name) =>
    scenario[name] === undefined ? [] : [`${name}: ${JSON.stringify(scenario[name])}`],
  );
  if (scenario.prompt !== undefined)
    fields.push(
      `prompt: ${scenario.prompt instanceof RegExp ? scenario.prompt.toString() : JSON.stringify(scenario.prompt)}`,
    );
  if (scenario.when) {
    if (!scenario.whenCode) throw new Error(`Missing example predicate: ${scenario.id}`);
    fields.push(`when: ${scenario.whenCode}`);
  }
  fields.push(`generator: ${expression}`);
  if (scenario.times !== undefined) modules.add('composed');
  const config = fallback
    ? '{ rules: [], fallback: fallbackReply }'
    : `{ rules: [{\n  ${fields.join(',\n  ')}\n}]${scenario.times !== undefined ? ', fallback: fallbackReply' : ''} }`;
  return {
    expression,
    generator: `${generatorSetup}\n\nexport default ${expression};\n`,
    config: `${setupFor(modules, true)}\n\nexport default ${config} satisfies MockGPTOptions;\n`,
  };
}
