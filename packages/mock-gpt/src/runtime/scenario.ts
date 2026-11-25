/** Portable scenario boundary: eager snapshots, ordered items and legacy projection. */
import { ResponseDescription, type ScenarioOutput, type ModelOutput } from '../types.js';
import { cloneJson, MockGPTError } from '../shared/utils.js';

/** Validate unknown scenario input without retaining caller references. */
export function snapshotScenario(value: ScenarioOutput): ScenarioOutput {
  const copy = cloneJson(value);
  const fail = (path: string): never => {
    throw new MockGPTError('MOCK_CONFIG', `Invalid ${path}`);
  };
  if (!copy || typeof copy !== 'object' || Array.isArray(copy)) fail('scenario');
  if ('content' in copy || 'tools' in copy) fail('scenario.items/content/tools conflict');
  if (!Array.isArray(copy.items)) fail('scenario.items');
  const validators: Record<string, (item: any) => boolean> = {
    text: (item) => typeof item.text === 'string',
    'function-call': (item) =>
      typeof item.name === 'string' &&
      !!item.name &&
      Object.hasOwn(item, 'arguments') &&
      (item.id === undefined || typeof item.id === 'string'),
    thinking: (item) =>
      typeof item.text === 'string' &&
      (item.signature === undefined || typeof item.signature === 'string'),
    media: (item) =>
      ['image', 'audio', 'video', 'file'].includes(item.modality) &&
      typeof item.uri === 'string' &&
      !!item.uri &&
      (item.mimeType === undefined || typeof item.mimeType === 'string'),
    search: (item) =>
      typeof item.query === 'string' &&
      (item.id === undefined || typeof item.id === 'string') &&
      Array.isArray(item.sources) &&
      item.sources.every(
        (source: any) =>
          source &&
          typeof source.url === 'string' &&
          (source.title === undefined || typeof source.title === 'string'),
      ),
    refusal: (item) => typeof item.text === 'string',
  };
  const ids = new Set<string>();
  copy.items.forEach((item, index) => {
    if (
      !item ||
      typeof item !== 'object' ||
      !Object.hasOwn(validators, item.type) ||
      !validators[item.type](item)
    )
      fail(`scenario.items[${index}]`);
    if ((item.type === 'function-call' || item.type === 'search') && item.id !== undefined) {
      if (!item.id || ids.has(item.id)) fail(`scenario.items[${index}].id`);
      ids.add(item.id);
    }
  });
  return copy;
}

/** Convert the legacy descriptor once before protocol-specific encoding. */
export function normalizeScenario(value: ModelOutput | ScenarioOutput): ScenarioOutput {
  if ('items' in value) return snapshotScenario(value as ScenarioOutput);
  const { content, tools, ...options } = value as ModelOutput;
  return {
    ...options,
    items: [
      ...(content == null ? [] : [{ type: 'text' as const, text: content }]),
      ...(tools ?? []).map((call) => ({ type: 'function-call' as const, ...call })),
    ],
  };
}

/** Descriptor constructor; framing options are validated by the common responses boundary. */
export function scenario(value: ScenarioOutput): ResponseDescription {
  return new ResponseDescription('scenario', snapshotScenario(value));
}
