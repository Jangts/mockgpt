/**
 * 场景目录装配：把规则场景、示例源码和配置快照组合成页面可直接消费的清单，
 * 同时保留生成器源码供代码面板展示。
 */
import { playgroundScenarios, scenarioRule } from './scenarios/playground-config.ts';
// 以原文导入生成器实现，让代码面板与真实配置保持同一来源。
import composedCode from './scenarios/composed-generators.ts?raw';
import markdownCode from './scenarios/markdown-generators.ts?raw';
import webCode from './scenarios/browser-web-source.ts?raw';
import type { Scenario } from './types.ts';
import { exampleSources } from './scenario-examples.ts';

/** 页面使用的完整场景目录，顺序与 playgroundScenarios 一致。 */
export const scenarios: Scenario[] = playgroundScenarios.map((scenario) => {
  const { id, label, example, covers } = scenario;
  // 规则用于展示当前场景实际命中的 prompt/when/generator 组合。
  const rule = scenarioRule(scenario);
  const code = exampleSources(scenario, {
    composed: composedCode,
    markdown: markdownCode,
    web: webCode,
  });
  return {
    id,
    label,
    example,
    covers: [...covers],
    config: {
      ...rule,
      // RegExp 不能直接序列化，只把字面量转成字符串供展示。
      prompt: rule.prompt instanceof RegExp ? rule.prompt.toString() : rule.prompt,
      when: scenario.whenCode,
      generator: code.expression,
    },
    generatorSource: code.generator,
    implementation: { file: 'mock.config.ts', code: code.config },
  };
});
