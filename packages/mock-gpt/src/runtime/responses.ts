/**
 * Construction and validation of response descriptors.
 *
 * A `ResponseDescription` tells the runtime how to answer once a rule matched: a model reply
 * with declared framing/timing, an HTTP fault, or a simulated network rejection. Descriptors
 * are validated and snapshotted here before they can influence transport, so a malformed
 * generator result fails as `MOCK_CONFIG` instead of producing a half-written response.
 */
import {
  ResponseDescription,
  type ModelOutput,
  type ToolCall,
  type OutputOptions,
  type JsonValue,
  type HttpFault,
} from '../types.js';
import { scenario as scenarioDescription, snapshotScenario } from './scenario.js';
import type { ScenarioOutput } from '../types.js';
import { MockGPTError, cloneJson, integer, breakWhile } from '../shared/utils.js';

/**
 * Validate a model output and wrap it in a `model` descriptor.
 *
 * Ranges: delay, interval and interrupt counts accept 0-60 000, `chunkSize`/`wireChunkSize` accept
 * 1-1 000 000, and `usage` totals must equal the sum of prompt and completion tokens. Tool calls
 * must carry a nonempty name and an explicit `arguments` member (any JSON value, including null).
 *
 * @param value Candidate model output; copied before validation.
 * @returns A frozen-by-caller `model` descriptor owning a private copy of `value`.
 * @throws MockGPTError `MOCK_CONFIG` for any invalid field, range or tool call.
 */
export function output(value: ModelOutput): ResponseDescription {
  const copy = cloneJson(value);
  breakWhile(
    !(copy && typeof copy === 'object' && !Array.isArray(copy)),
    () => new MockGPTError('MOCK_CONFIG', 'Model output must be an object'),
  );
  for (const [name, min] of [
    ['delayMs', 0],
    ['chunkSize', 1],
    ['intervalMs', 0],
    ['wireChunkSize', 1],
    ['interruptAfter', 0],
  ] as const) {
    if (copy[name] !== undefined)
      integer(
        copy[name]!,
        name,
        min,
        ['chunkSize', 'wireChunkSize'].includes(name) ? 1_000_000 : 60_000,
      );
  }
  breakWhile(
    !(copy.content === undefined || copy.content === null || typeof copy.content === 'string'),
    () => new MockGPTError('MOCK_CONFIG', 'Output content must be text or null'),
  );
  breakWhile(
    !(
      copy.finishReason === undefined ||
      ['stop', 'length', 'tool_calls', 'content_filter'].includes(copy.finishReason)
    ),
    () => new MockGPTError('MOCK_CONFIG', 'Invalid finish reason'),
  );
  breakWhile(
    !(copy.tools === undefined || Array.isArray(copy.tools)),
    () => new MockGPTError('MOCK_CONFIG', 'tools must be an array'),
  );
  if (copy.tools)
    for (const call of copy.tools)
      breakWhile(
        !(
          call &&
          typeof call === 'object' &&
          !Array.isArray(call) &&
          typeof call.name === 'string' &&
          call.name.length &&
          Object.hasOwn(call, 'arguments') &&
          (call.id === undefined || typeof call.id === 'string')
        ),
        () => new MockGPTError('MOCK_CONFIG', 'Invalid tool call'),
      );
  if (copy.usage !== undefined) {
    breakWhile(
      !(copy.usage && typeof copy.usage === 'object' && !Array.isArray(copy.usage)),
      () => new MockGPTError('MOCK_CONFIG', 'Invalid usage'),
    );
    for (const name of ['prompt_tokens', 'completion_tokens', 'total_tokens'] as const)
      integer(copy.usage[name], name);
    // OpenAI clients may rely on the total; an inconsistent value is a fixture bug, not a reply.
    breakWhile(
      !(copy.usage.total_tokens === copy.usage.prompt_tokens + copy.usage.completion_tokens),
      () => new MockGPTError('MOCK_CONFIG', 'usage totals must agree'),
    );
  }
  return new ResponseDescription('model', copy);
}
/**
 * Kind-to-validator map. Adding a kind here is what makes `snapshotDescription` accept it, so
 * the descriptor vocabulary stays enumerable in one place.
 */
const descriptions = {
  scenario: (value: ResponseDescription['value']) => {
    const copy = snapshotScenario(value as ScenarioOutput);
    const { items, ...options } = copy;
    output(options);
    return scenarioDescription(copy);
  },
  model: (value: ResponseDescription['value']) => output(value as ModelOutput),
  http: (value: ResponseDescription['value']) => {
    const fault = value as HttpFault;
    breakWhile(
      !(
        fault &&
        typeof fault === 'object' &&
        !Array.isArray(fault) &&
        Object.hasOwn(fault, 'body')
      ),
      () => new MockGPTError('MOCK_CONFIG', 'HTTP fault must include status and body'),
    );
    // Faults model upstream failures, so client-error and server-error statuses only.
    integer(fault.status, 'status', 400, 599);
    return new ResponseDescription('http', { status: fault.status, body: cloneJson(fault.body) });
  },
  reject: (value: ResponseDescription['value']) => {
    breakWhile(
      typeof value !== 'string',
      () => new MockGPTError('MOCK_CONFIG', 'Network fault message must be a string'),
    );
    return new ResponseDescription('reject', value);
  },
};

/**
 * Validate every branded descriptor, including ones created directly by JavaScript callers.
 *
 * This is the single gate used when configuration is snapshotted and when a generator returns a
 * descriptor, so both paths enforce identical rules.
 *
 * @param value Descriptor to re-validate and copy.
 * @returns A new descriptor of the same kind with its payload re-validated.
 * @throws MockGPTError `MOCK_CONFIG` for an unknown kind or an invalid payload.
 */
export function snapshotDescription(value: ResponseDescription): ResponseDescription {
  breakWhile(
    !Object.hasOwn(descriptions, value.kind),
    () => new MockGPTError('MOCK_CONFIG', 'Unknown response description kind'),
  );
  return descriptions[value.kind](value.value);
}

/**
 * Convenience constructors for the three descriptor families.
 *
 * Each helper validates eagerly, so a bad fixture fails when the rule is built rather than on
 * the first request.
 */
export const responses = {
  /** Create a portable ordered result, with the same framing options as text. */
  scenario: (value: ScenarioOutput) => descriptions.scenario(value),
  /**
   * @param content Assistant text, sent as a single message body or chunked into SSE deltas.
   * @param options Framing and timing overrides for the reply.
   * @returns A validated `model` descriptor.
   * @throws MockGPTError `MOCK_CONFIG` when any option is out of range.
   */
  text: (content: string, options: OutputOptions = {}) => output({ ...options, content }),
  /**
   * @param tools Tool calls emitted by the assistant; text content is always null.
   * @param options Framing and timing overrides; `finishReason` defaults to `tool_calls`.
   * @returns A validated `model` descriptor.
   * @throws MockGPTError `MOCK_CONFIG` when a tool call or option is invalid.
   */
  toolCalls: (tools: readonly ToolCall[], options: OutputOptions = {}) =>
    output({ ...options, tools, content: null }),
  /**
   * @param status HTTP status to return; must be in 400-599.
   * @param body JSON body written verbatim; defaults to a generic OpenAI-shaped error.
   * @returns An `http` descriptor.
   * @throws MockGPTError `MOCK_CONFIG` when the status or body is invalid.
   */
  httpError: (status: number, body: JsonValue = { error: { message: 'Simulated HTTP error' } }) => {
    integer(status, 'status', 400, 599);
    return new ResponseDescription('http', { status, body: cloneJson(body) });
  },
  /**
   * Simulate a transport failure that rejects the client call instead of answering with HTTP.
   *
   * @param message Rejection message; keep it free of private data because it reaches the caller.
   * @returns A `reject` descriptor.
   */
  reject: (message = 'Simulated network failure') => new ResponseDescription('reject', message),
};
