/**
 * Package root entry for `@jangts/mock-gpt`, compiled into both the ESM and CJS builds.
 *
 * Re-exports the environment-neutral surface: the `MockGPT` runtime, the generator
 * registry, response descriptors and the OpenAI-compatible wire codec. Browser and Node
 * additions stay behind the `web` and `node` subpath entries, so importing this module
 * never pulls in `node:http`, DNS resolution, `linkedom` or `@mozilla/readability`.
 */
export { MockGPT } from './runtime/mock.js';
export { generators, generatorNames } from './generators/index.js';
export { responses } from './runtime/responses.js';
export { MockGPTError } from './shared/utils.js';
export { ResponseDescription } from './types.js';
export { routes } from './runtime/chat-completions.js';
export { encodeModelResponse } from './runtime/chat-completions.js';
export type {
  JsonValue,
  Message,
  ModelRequest,
  GenerationContext,
  Generator,
  Generated,
  Rule,
  MockGPTOptions,
  CallRecord,
  ToolCall,
  OutputOptions,
  Usage,
} from './types.js';
export type { TextSource, TextOptions } from './generators/text.js';
export type { GenerationInput, GenerationOptions, ModelOutput, HttpFault } from './types.js';

export type { ScenarioOutput, ScenarioItem } from './types.js';
export { protocolCatalog, findProtocol } from './protocols/catalog.js';
export type { LifecycleOptions } from './lifecycle/index.js';
export { createMockDuplex } from './realtime/duplex.js';
export { bindMockDataChannel } from './realtime/datachannel.js';
export type {
  MockDuplex,
  MockDuplexOptions,
  RealtimeProtocol,
  RealtimeFrame,
} from './realtime/duplex.js';
export type { MockDataChannel } from './realtime/datachannel.js';
export { lifecycleCatalog, lifecycleFaultCatalog } from './lifecycle/index.js';
export type { ResourceLimits, LifecycleFault } from './lifecycle/index.js';
