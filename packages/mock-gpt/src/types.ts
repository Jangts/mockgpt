/**
 * Shared contract types for `@jangts/mock-gpt`.
 *
 * These declarations define what the runtime accepts (requests and rules), what it records
 * (call history) and what it returns (generated values and response descriptors). Both the
 * SDK entry points and the HTTP adapters compile against this single definition. The only
 * runtime logic here is the `ResponseDescription` brand, which keeps transport instructions
 * from being mistaken for ordinary JSON generator output.
 */

/**
 * Any value accepted by the package's JSON snapshot rules: strings, finite numbers, booleans,
 * null, arrays and plain objects.
 */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * One entry of an OpenAI chat conversation.
 *
 * The runtime validates `role` against the OpenAI role set and validates the outer shape of
 * `content`; every other field is retained verbatim so vendor extensions flow through.
 */
export type Message = Readonly<{
  /**
   * `system`, `developer`, `user`, `assistant`, `tool` or `function`; anything else is rejected.
   */
  role: string;
  /** Text, a multimodal content-block array or null; numbers and objects are rejected. */
  content?: unknown;
  /** Opaque tool-call array from a previous assistant turn; never interpreted here. */
  tool_calls?: unknown;
  /** Correlates a `tool` message with the assistant tool call it answers. */
  tool_call_id?: string;
  /** Vendor extensions are snapshotted and preserved but never interpreted by the runtime. */
  [key: string]: unknown;
}>;

/**
 * A normalized `/chat/completions` request, produced by `snapshotRequest`.
 *
 * Optional `undefined` fields have already been dropped and `stream` is already defaulted, so
 * rules always observe the same shape regardless of whether the caller used `generate` or the
 * injected `fetch`.
 */
export interface ModelRequest {
  /** Model identifier; required, non-empty, and compared verbatim by `Rule.model`. */
  readonly model: string;
  /** Non-empty conversation; the last `user` message supplies the default prompt. */
  readonly messages: readonly Message[];
  /** Whether the codec should emit SSE; defaulted to `false` during normalization. */
  readonly stream: boolean;
  /** Tool schemas declared by the client; only the array shape is validated. */
  readonly tools?: readonly unknown[];
  /** `include_usage: true` appends a terminal usage-only chunk to the stream. */
  readonly stream_options?: Readonly<{ include_usage?: boolean }>;
  /** Other OpenAI parameters (`n`, `temperature`, ...) are retained but not interpreted. */
  readonly [key: string]: unknown;
}

/**
 * Input of `MockGPT.generate`.
 *
 * Normalized exactly like an HTTP request body, so a rule matches identically through both
 * entry points; only `model` and `messages` are required.
 */
export interface GenerationInput {
  /** Model identifier used for `Rule.model` filtering. */
  readonly model: string;
  /** Conversation whose last `user` message becomes the prompt. */
  readonly messages: readonly Message[];
  /** Extra request fields available to rules through `GenerationContext.request`. */
  readonly [key: string]: unknown;
}

/** Per-call options of `MockGPT.generate`. */
export interface GenerationOptions {
  /** Cancels the call before or during generation; rejection reason is preserved as-is. */
  signal?: AbortSignal;
}

/**
 * Everything a rule or generator may read for one accepted call.
 *
 * The context is frozen; the only mutable side channel is `report`, and only while the call is
 * still pending.
 */
export interface GenerationContext {
  /** Frozen snapshot of the normalized request that matched. */
  readonly request: ModelRequest;
  /** Prompt selected by `selectPrompt`; default is the text of the last `user` message. */
  readonly prompt: string;
  /** Match of the matched rule's regular expression, or null for string/fallback rules. */
  readonly match: RegExpMatchArray | null;
  /** 1-based sequence number of this call across the instance lifetime; reset by `reset`. */
  readonly callIndex: number;
  /** 1-based hit count of the matched rule, or the fallback hit count for fallback calls. */
  readonly ruleIndex: number;
  /** Signal for the current call; also aborts when the transport is cancelled. */
  readonly signal: AbortSignal;
  /** Per-call deterministic PRNG in [0, 1), derived from the instance seed and call order. */
  readonly random: () => number;
  /** Millisecond timestamp from the configured clock; throws if the clock is not synchronous. */
  readonly clock: () => number;
  /** Bounded diagnostic data; never inserted into model content. */
  readonly report: (metadata: Record<string, JsonValue>) => void;
}

/** A tool call the mocked assistant emits instead of executing. */
export interface ToolCall {
  /** Function name exposed as `function.name` on the wire. */
  name: string;
  /** Serialized into the `function.arguments` string; must be JSON-compatible. */
  arguments: JsonValue;
  /** Optional; the codec derives `<responseId>_tool_<index>` when omitted. */
  id?: string;
}

/** Token accounting reported by the OpenAI API; validated for internal consistency. */
export interface Usage {
  /** Tokens attributed to the prompt. */
  prompt_tokens: number;
  /** Tokens attributed to the generated completion. */
  completion_tokens: number;
  /** Must equal `prompt_tokens + completion_tokens`, otherwise the output is rejected. */
  total_tokens: number;
}

/**
 * Transport-level knobs of a generated response.
 *
 * All values are simulated: they affect framing and timing of the mock reply, not real model
 * behaviour.
 */
export interface OutputOptions {
  /**
   * Finish reason sent in the last content frame; defaults to `tool_calls` with tools, else
   * `stop`.
   */
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  /** Usage object included in non-stream replies and in the terminal usage chunk. */
  usage?: Usage;
  /** Artificial latency before the reply or first frame, in milliseconds; default 0. */
  delayMs?: number;
  /**
   * Maximum Unicode code points per content/tool-call delta; default 24; never splits a
   * code point.
   */
  chunkSize?: number;
  /** Delay between SSE frames in milliseconds; default 0 (emit as fast as the consumer pulls). */
  intervalMs?: number;
  /** Optional transport-level byte chunks, independent of content/codepoint chunks. */
  wireChunkSize?: number;
  /** Error the stream after this many data frames, without a success terminator. */
  interruptAfter?: number;
}

/** The model-authored part of a reply, before it becomes JSON or SSE frames. */
export interface ModelOutput extends OutputOptions {
  /** Assistant text; `null` or omitted means no textual content (common for tool-call replies). */
  content?: string | null;
  /** Tool calls emitted by the assistant; their serialized size also counts toward limits. */
  tools?: readonly ToolCall[];
}

/** A simulated HTTP-level failure returned instead of a model reply. */
export interface HttpFault {
  /** HTTP status to return; validated to the 400-599 range because faults model failures. */
  status: number;
  /** JSON body written verbatim, so callers can reproduce upstream error payloads. */
  body: JsonValue;
}

/** What a rule may produce: plain data, or a descriptor that changes transport behaviour. */
export type Generated = JsonValue | ResponseDescription;

/**
 * A rule's output: either a fixed value (deep-copied and frozen when the instance is built) or
 * a function evaluated per call. A function may be async and is awaited under cancellation.
 */
export type Generator =
  Generated | ((context: GenerationContext) => Generated | Promise<Generated>);

/** One ordered matching rule of a `MockGPT` instance. */
export interface Rule {
  /** Unique label reported in `CallRecord.ruleId`; defaults to `rule-<1-based position>`. */
  id?: string;
  /** Exact prompt string or pattern tested against `GenerationContext.prompt`. */
  prompt?: string | RegExp;
  /** Restricts the rule to one request model; omitted means any model. */
  model?: string;
  /** Extra predicate on the whole request; must return a boolean synchronously. */
  when?: (request: ModelRequest) => boolean;
  /** Value or factory used when this rule is the first match. */
  generator: Generator;
  /**
   * Maximum accepted calls before the rule is skipped; 1-based integer, omitted means unlimited.
   */
  times?: number;
}

/** Construction options of a `MockGPT` instance. */
export interface MockGPTOptions {
  /** Ordered rules; the first rule whose filters all pass wins, so order is significant. */
  rules: readonly Rule[];
  /**
   * Generator used when no rule matches; absent makes an unmatched call a `MOCK_RULE_NOT_FOUND`
   * error.
   */
  fallback?: Generator;
  /**
   * Overrides prompt extraction; must return a string synchronously; default is the last user
   * text.
   */
  selectPrompt?: (request: ModelRequest) => string;
  /** Defaults merged under every generated output; explicit output fields take precedence. */
  stream?: Pick<OutputOptions, 'chunkSize' | 'intervalMs' | 'wireChunkSize'>;
  /**
   * Seed for the deterministic PRNG (0-0xffffffff); default 1, so identical call sequences
   * repeat.
   */
  seed?: number;
  /** Millisecond timestamp source for `date` generators and response `created`; must be finite. */
  clock?: () => number;
  /** Ring-buffer size of `records`; 0 disables recording; max 10 000; default 100. */
  recordLimit?: number;
  /** Maximum accepted request body in bytes for `fetch`; default 1 MiB. */
  maxBodyBytes?: number;
  /** Maximum generated content in code points plus serialized tool calls; default 1 000 000. */
  maxOutputChars?: number;
}

/** Detached snapshot of one accepted call, exposed through `MockGPT.records`. */
export interface CallRecord {
  /** Wire-visible completion id in the form `chatcmpl-mock-<index>`; reused by the HTTP codec. */
  id: string;
  /** 1-based call sequence within the instance; monotonically increasing until `reset`. */
  index: number;
  /** Model from the matched request. */
  model: string;
  /** Request path when served through `fetch`; absent for `generate` calls. */
  path?: string;
  /** Id of the matched rule; absent for fallback calls. */
  ruleId?: string;
  /** True when the fallback generator produced the reply. */
  fallback: boolean;
  /** Terminal state; `pending` only while the call or its stream is still running. */
  status: 'pending' | 'completed' | 'error' | 'cancelled';
  /** `MOCK_*` code describing the failure or cancellation; absent on success. */
  errorCode?: string;
  /**
   * Diagnostic key/values from `context.report`, capped at 8192 serialized bytes; no model
   * content.
   */
  metadata: Record<string, JsonValue>;
}
/** Explicit brand avoids interpreting ordinary JSON as transport instructions. */
const responseBrand = Symbol.for('@jangts/mock-gpt/ResponseDescription/v1');

/**
 * Wrapper that distinguishes a transport instruction from ordinary generator data.
 *
 * `kind: 'model'` carries a `ModelOutput`, `'http'` an `HttpFault` response, and `'reject'` a
 * message used to simulate a network failure. Instances are recognized by brand rather than by
 * `instanceof` alone, so descriptors survive crossing the ESM/CJS boundary.
 */
export class ResponseDescription {
  private readonly [responseBrand] = true;
  static [Symbol.hasInstance](value: unknown): boolean {
    if (this !== ResponseDescription)
      return Function.prototype[Symbol.hasInstance].call(this, value);
    return (
      typeof value === 'object' &&
      value !== null &&
      Object.getOwnPropertyDescriptor(value, responseBrand)?.value === true
    );
  }
  /**
   * @param kind Which transport behaviour the descriptor requests.
   * @param value Payload matching `kind`; validated by `responses.output` or `snapshotDescription`.
   */
  constructor(
    readonly kind: 'model' | 'http' | 'reject',
    readonly value: ModelOutput | HttpFault | string,
  ) {}
}
