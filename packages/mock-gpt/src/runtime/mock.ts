/**
 * The `MockGPT` runtime: rule matching, generator execution and call bookkeeping.
 *
 * One instance owns an ordered rule list, an optional fallback, a seeded PRNG and a bounded ring
 * buffer of call records. `generate` returns plain data with no Request/Response work; `fetch`
 * turns the same result into an OpenAI-compatible `Response`. Both entry points share `evaluate`,
 * so rule order, hit counts, sequence positions and cancellation semantics are identical — that
 * shared path is what lets tests assert the same contract through either entry point.
 *
 * Determinism: with a fixed seed, the same sequence of accepted calls yields the same random
 * values and the same output. Time enters only through the injected `clock`, and no value is
 * derived from `Math.random`.
 */
import {
  ResponseDescription,
  type CallRecord,
  type Generator,
  type MockGPTOptions,
  type ModelOutput,
  type Rule,
  type HttpFault,
  type GenerationContext,
  type GenerationInput,
  type GenerationOptions,
  type Generated,
} from '../types.js';
import {
  abortable,
  checkSynchronous,
  cloneJson,
  codeOf,
  delay,
  errorResponse,
  freeze,
  integer,
  jsonText,
  MockGPTError,
  readBytes,
  breakWhile,
  seeded,
} from '../shared/utils.js';
import { promptOf, snapshotRequest } from './chat-completions.js';
import { output, snapshotDescription } from './responses.js';
import { findProtocol } from '../protocols/catalog.js';
import { normalizeScenario } from './scenario.js';
import { LifecycleRuntime } from '../lifecycle/index.js';
import type { ScenarioOutput } from '../types.js';
import { charLength } from '../shared/text.js';

interface RegisteredRule extends Rule {
  /** Id resolved from `Rule.id` or its 1-based position. */
  id: string;
  /** Accepted calls so far; compared against `times` and reported as `ruleIndex`. */
  hits: number;
}

/**
 * Copy a configured generator so later mutation of the caller's object cannot change behaviour.
 *
 * Functions are kept by reference (they may close over caller state by design), while plain data
 * and descriptors are deep-copied and frozen.
 *
 * @param generator Configured generator from a rule or fallback.
 * @returns A value safe to evaluate on every call.
 */
function snapshot(generator: Generator): Generator {
  if (typeof generator === 'function') return generator;
  if (generator instanceof ResponseDescription) return freeze(snapshotDescription(generator));
  return freeze(cloneJson(generator));
}

/**
 * Read the configured clock and reject asynchronous or non-finite implementations.
 *
 * @param clock Clock callback from the instance options.
 * @returns The current timestamp in milliseconds.
 * @throws MockGPTError `MOCK_CONFIG` when the clock returns a promise or a non-finite number.
 */
function readClock(clock: () => number): number {
  const now = clock();
  checkSynchronous(now, 'number', 'clock must return a finite millisecond timestamp synchronously');
  breakWhile(
    !Number.isFinite(now),
    () => new MockGPTError('MOCK_CONFIG', 'clock must return a finite millisecond timestamp'),
  );
  return now;
}

/** Configurable mock model instance. Create one per test or per mock server. */
export class MockGPT {
  /** Snapshot of the configured rules, in evaluation order. */
  private readonly rules: RegisteredRule[];
  /** Validated options with defaults applied. */
  private readonly options: MockGPTOptions;
  /** Snapshot of the fallback generator, if configured. */
  private readonly fallback?: Generator;
  /** Ring buffer of the most recent records, at most `recordLimit` entries. */
  private history: CallRecord[] = [];
  /** Index of the oldest slot; rotated back to 0 by `records`. */
  private historyStart = 0;
  /** 1-based sequence of the next accepted call; also the completion id suffix. */
  private next = 0;
  /** Number of calls served by the fallback; drives `ruleIndex` for fallback generators. */
  private fallbackHits = 0;
  /** In-flight calls and streams; guards `reset` and backs `activeRequests`. */
  private active = 0;
  private activeStreams = 0;
  /** Instance PRNG; re-seeded by `reset` so a reset run repeats the original sequence. */
  private random: () => number;
  private lifecycle?: LifecycleRuntime;
  private connections = new Set<() => void>();
  private httpActions = 0;
  private realtimeTurns = 0;

  /** Detached accounting; transport actions never imply new generations. */
  get stats() {
    return {
      httpActions: this.httpActions,
      generations: this.next,
      realtimeTurns: this.realtimeTurns,
      activeStreams: this.activeStreams,
      batchItems: 0,
      activeConnections: this.connections.size,
      activeOperations: this.lifecycle?.activeOperations ?? 0,
      ...this.lifecycle?.stats,
    };
  }
  /** Register a duplex lifetime so reset cannot invalidate a live connection. */
  registerConnection(close: () => void): () => void {
    if (this.connections.size >= (this.options.maxConnections ?? 16))
      throw new MockGPTError('MOCK_RESOURCE_LIMIT', 'Connection limit exceeded');
    this.connections.add(close);
    return () => {
      this.connections.delete(close);
    };
  }
  /** Observe an explicitly admitted realtime response round. */
  noteRealtimeTurn(): void {
    this.realtimeTurns++;
  }

  /**
   * Validate options and snapshot every rule.
   *
   * Each rule's id, prompt, model, predicate and output are validated here, so configuration
   * mistakes surface at construction rather than on the first request.
   *
   * @param options Rule list plus optional fallback, seed, clock and limits.
   * @throws MockGPTError `MOCK_CONFIG` for a missing rule array, duplicate ids, invalid filters
   * or out-of-range limits.
   */
  constructor(options: MockGPTOptions) {
    breakWhile(
      !(options && Array.isArray(options.rules)),
      () => new MockGPTError('MOCK_CONFIG', 'rules must be an array'),
    );
    const ids = new Set<string>();
    this.rules = options.rules.map((rule, index) => {
      const id = rule.id ?? `rule-${index + 1}`;
      breakWhile(
        !(typeof id === 'string' && id.length && !ids.has(id)),
        () => new MockGPTError('MOCK_CONFIG', 'Rule IDs must be unique nonempty strings'),
      );
      ids.add(id);
      breakWhile(
        !(
          rule.prompt === undefined ||
          typeof rule.prompt === 'string' ||
          rule.prompt instanceof RegExp
        ),
        () => new MockGPTError('MOCK_CONFIG', `Invalid prompt in ${id}`),
      );
      breakWhile(
        !(rule.model === undefined || typeof rule.model === 'string'),
        () => new MockGPTError('MOCK_CONFIG', `Invalid model in ${id}`),
      );
      breakWhile(
        !(rule.when === undefined || typeof rule.when === 'function'),
        () => new MockGPTError('MOCK_CONFIG', `Invalid predicate in ${id}`),
      );
      if (rule.times !== undefined) integer(rule.times, 'times', 1);
      return {
        ...rule,
        id,
        // Patterns are cloned so a global/sticky pattern's lastIndex is per instance, not shared.
        prompt:
          rule.prompt instanceof RegExp
            ? new RegExp(rule.prompt.source, rule.prompt.flags)
            : rule.prompt,
        generator: snapshot(rule.generator),
        hits: 0,
      };
    });
    this.options = {
      ...options,
      ...(options.stream
        ? { stream: freeze(cloneJson(output(options.stream).value as ModelOutput)) }
        : {}),
      recordLimit: integer(options.recordLimit ?? 100, 'recordLimit', 0, 10_000),
      // 1 MiB matches typical local request bodies and keeps accidental uploads cheap to reject.
      maxBodyBytes: integer(options.maxBodyBytes ?? 1_048_576, 'maxBodyBytes', 1),
      maxOutputChars: integer(options.maxOutputChars ?? 1_000_000, 'maxOutputChars', 1),
    };
    if (options.maxConnections !== undefined) integer(options.maxConnections, 'maxConnections', 1);
    if (options.seed !== undefined) integer(options.seed, 'seed', 0, 0xffffffff);
    this.fallback = options.fallback === undefined ? undefined : snapshot(options.fallback);
    // Default seed 1 keeps unseeded tests reproducible while still allowing variation.
    this.random = seeded(options.seed ?? 1);
    if (options.lifecycle)
      this.lifecycle = new LifecycleRuntime({
        options: options.lifecycle,
        maxBodyBytes: this.options.maxBodyBytes,
        clock: options.clock,
        generate: (input, signal) => this.generate(input, { signal }),
        decode: (body, url) => {
          const codec = findProtocol(url.pathname);
          if (!codec) throw new MockGPTError('MOCK_ROUTE', 'Unknown generation route', 404);
          return codec.decode(body, url);
        },
        encode: (input, generated, id) => {
          const codec = findProtocol(String(input.wirePath ?? '/v1/responses'));
          if (!codec) throw new MockGPTError('MOCK_ROUTE', 'Unknown result route', 404);
          const value =
            generated instanceof ResponseDescription
              ? generated.value
              : { content: typeof generated === 'string' ? generated : jsonText(generated) };
          if (generated instanceof ResponseDescription && generated.kind === 'http') {
            const fault = value as HttpFault;
            return Response.json(fault.body, { status: fault.status });
          }
          if (generated instanceof ResponseDescription && generated.kind === 'reject')
            throw new MockGPTError('MOCK_NETWORK', String(value));
          return codec.encode(
            input as GenerationContext['request'],
            normalizeScenario(value as ModelOutput | ScenarioOutput),
            id,
            Math.floor(readClock(options.clock ?? Date.now) / 1000),
            new AbortController().signal,
            () => {},
          );
        },
      });
  }

  /**
   * Chronological records, oldest first, as detached copies.
   *
   * Rotates the ring buffer back into insertion order before returning, and deep-copies each
   * record so callers cannot mutate runtime state through the result.
   *
   * @returns Up to `recordLimit` records in call order.
   */
  get records(): readonly CallRecord[] {
    return cloneJson(
      this.historyStart
        ? [...this.history.slice(this.historyStart), ...this.history.slice(0, this.historyStart)]
        : this.history,
    );
  }

  /**
   * Accepted-call count per rule plus the `fallback` bucket, keyed by rule id.
   *
   * @returns A snapshot object; mutating it does not affect the instance.
   */
  get counts(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.rules.map((rule) => [rule.id, rule.hits]));
  }

  /**
   * Number of calls or response streams still in flight.
   *
   * @returns Count of calls that have not reached a terminal state yet.
   */
  get activeRequests(): number {
    return this.active;
  }

  /**
   * Clear history, hit counts and the PRNG sequence.
   *
   * @throws MockGPTError `MOCK_ACTIVE` when a call or stream is still active, because resetting
   * while a generator holds context would make the two views disagree.
   */
  reset(): void {
    breakWhile(
      !!this.active || !!this.connections.size || !!this.lifecycle?.activeOperations,
      () =>
        new MockGPTError(
          'MOCK_ACTIVE',
          'Cannot reset while a request or response stream is active',
        ),
    );
    this.lifecycle?.reset();
    this.httpActions = 0;
    this.realtimeTurns = 0;
    this.history = [];
    this.historyStart = 0;
    this.next = 0;
    this.fallbackHits = 0;
    for (const rule of this.rules) rule.hits = 0;
    this.random = seeded(this.options.seed ?? 1);
  }

  /**
   * Bound callback suitable for injection into an SDK's fetch option.
   *
   * Performs the HTTP side of the contract: route and method checks, byte-limited body reading,
   * request validation, then either a JSON/SSE `Response` or an OpenAI-shaped error response.
   * Transport faults (`responses.reject`) are rethrown as `MOCK_NETWORK` so SDKs observe a
   * network failure rather than an HTTP error.
   *
   * @param input Request URL, `Request` or string accepted by `Request`.
   * @param init Optional request initializer.
   * @returns The simulated response; unknown routes and methods become 404/405 JSON errors.
   * @throws MockGPTError when a simulated network rejection or cancellation occurs.
   */
  readonly fetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    request.signal.throwIfAborted();
    this.httpActions++;
    const lifecycleResponse = await this.lifecycle?.handle(request);
    if (lifecycleResponse) return lifecycleResponse;
    const path = new URL(request.url).pathname;
    const route = findProtocol(path);
    if (!route) return errorResponse(new MockGPTError('MOCK_ROUTE', 'Unknown model route', 404));
    if (request.method !== 'POST')
      return errorResponse(new MockGPTError('MOCK_METHOD', 'Expected POST', 405));
    let modelRequest;
    try {
      const bytes = await readBytes(request.body, this.options.maxBodyBytes!, request.signal);
      let value: unknown;
      try {
        value = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new MockGPTError('MOCK_REQUEST', 'Invalid JSON', 400);
      }
      modelRequest = freeze(route.decode(value, new URL(request.url)));
    } catch (error) {
      // Cancellation wins over body/parse failures so callers see AbortError, not a 400.
      request.signal.throwIfAborted();
      return errorResponse(error);
    }
    return this.evaluate(
      modelRequest,
      request.signal,
      path,
      async (generated, record, finish, clock) => {
        const description =
          generated instanceof ResponseDescription
            ? generated
            : new ResponseDescription('model', {
                content: typeof generated === 'string' ? generated : jsonText(generated),
              });
        if (description.kind === 'reject')
          throw new MockGPTError('MOCK_NETWORK', String(description.value));
        if (description.kind === 'http') {
          const fault = description.value as HttpFault;
          const response = Response.json(fault.body, { status: fault.status });
          // The call is terminal as soon as the fault body is produced; nothing is streamed.
          finish(new MockGPTError('MOCK_HTTP', 'Simulated HTTP failure'));
          return response;
        }
        // Both the instance defaults and generated descriptor have already been validated and snapshotted.
        const result: ModelOutput | ScenarioOutput = {
          ...this.options.stream,
          ...(description.value as ModelOutput | ScenarioOutput),
        };
        await delay(result.delayMs ?? 0, request.signal);
        request.signal.throwIfAborted();
        const now = clock();
        request.signal.throwIfAborted();
        return route.encode(
          modelRequest,
          normalizeScenario(result),
          record.id,
          Math.floor(now / 1000),
          request.signal,
          finish,
        );
      },
    );
  };

  /**
   * Evaluate rules and return data. No Request, Response, delay or streaming is created.
   *
   * Transport-only options in a generated descriptor (`delayMs`, `intervalMs`,
   * `interruptAfter`) are validated but ignored here, so SDK tests can exercise generators and
   * matching without simulating a network.
   *
   * @param input Request-shaped input (`model`, `messages` and optional passthrough fields).
   * @param options Abort signal for the call.
   * @returns The generator result: plain JSON data or an inert `ResponseDescription`.
   * @throws MockGPTError for invalid input, unmatched rules, invalid output or limit breaches.
   * @throws The abort reason when the signal fires before or during generation.
   */
  async generate(
    input: GenerationInput,
    { signal = new AbortController().signal }: GenerationOptions = {},
  ): Promise<Generated> {
    signal.throwIfAborted();
    let request: GenerationContext['request'];
    try {
      request = freeze(snapshotRequest(input));
    } catch (error) {
      // A getter may abort while the input is being read; preserve that reason over the error.
      signal.throwIfAborted();
      throw error;
    }
    signal.throwIfAborted();
    return this.evaluate(request, signal, undefined, (generated, _record, finish) => {
      finish();
      return generated;
    });
  }

  /**
   * Shared pipeline used by both entry points.
   *
   * Stages: select prompt, find the first matching rule, resolve the generator, reserve the call
   * index and record slot, build the frozen context, run the generator under cancellation,
   * validate/limit the output, then hand it to `consume`, which owns transport encoding.
   *
   * @param modelRequest Normalized request snapshot.
   * @param signal Call cancellation source.
   * @param path Request path, or undefined for `generate`.
   * @param consume Transport-specific final step; responsible for calling `finish`.
   * @returns Whatever `consume` returns.
   */
  private async evaluate<T>(
    modelRequest: GenerationContext['request'],
    signal: AbortSignal,
    path: string | undefined,
    consume: (
      generated: Generated,
      record: CallRecord,
      finish: (...args: [error?: unknown, cancelled?: boolean]) => void,
      clock: () => number,
    ) => T | Promise<T>,
  ): Promise<T> {
    let prompt: string;
    try {
      prompt = (this.options.selectPrompt ?? promptOf)(modelRequest);
      checkSynchronous(prompt, 'string', 'selectPrompt must return a string synchronously');
    } catch (error) {
      signal.throwIfAborted();
      throw error;
    }
    signal.throwIfAborted();
    let match: RegExpMatchArray | null = null;
    // First match wins: filters are ordered so the most specific rule must come first.
    const rule = this.rules.find((rule) => {
      if (
        (rule.times !== undefined && rule.hits >= rule.times) ||
        (rule.model !== undefined && rule.model !== modelRequest.model)
      )
        return false;
      if (typeof rule.prompt === 'string' && rule.prompt !== prompt) return false;
      let candidate: RegExpMatchArray | null = null;
      if (rule.prompt instanceof RegExp) {
        // Reset before each test: the instance clone of a global/sticky pattern retains state.
        rule.prompt.lastIndex = 0;
        candidate = rule.prompt.exec(prompt);
        if (!candidate) return false;
      }
      if (rule.when) {
        let accepted: boolean;
        try {
          accepted = rule.when(modelRequest);
          checkSynchronous(accepted, 'boolean', 'when must return a boolean synchronously');
        } catch (error) {
          signal.throwIfAborted();
          throw error;
        }
        signal.throwIfAborted();
        if (!accepted) return false;
      }
      match = candidate;
      return true;
    });
    const generator = rule ? rule.generator : this.fallback;
    breakWhile(
      !(generator !== undefined),
      () => new MockGPTError('MOCK_RULE_NOT_FOUND', 'No MockGPT rule matched this request'),
    );
    signal.throwIfAborted();
    // Reserve the index before awaiting the generator so concurrent calls keep call order.
    const index = ++this.next;
    if (rule) rule.hits++;
    else this.fallbackHits++;
    const record: CallRecord = {
      id: `chatcmpl-mock-${index}`,
      index,
      model: modelRequest.model,
      ...(path ? { path } : {}),
      ruleId: rule?.id,
      fallback: !rule,
      status: 'pending',
      metadata: {},
    };
    // Optional absent fields are not kept as undefined JSON entries.
    if (!rule) delete record.ruleId;
    if (this.options.recordLimit) {
      if (this.history.length < this.options.recordLimit) this.history.push(record);
      else {
        // Ring buffer: overwrite the oldest slot so memory stays bounded under sustained traffic.
        this.history[this.historyStart] = record;
        this.historyStart = (this.historyStart + 1) % this.options.recordLimit;
      }
    }
    this.active++;
    if (modelRequest.stream) this.activeStreams++;
    let ended = false;
    const finish = (...args: [error?: unknown, cancelled?: boolean]) => {
      const [error, cancelled = false] = args;
      // Abort, stream close and consumer cancel can race; only the first terminal signal counts.
      if (ended) return;
      ended = true;
      this.active--;
      if (modelRequest.stream) this.activeStreams--;
      record.status = cancelled ? 'cancelled' : args.length ? 'error' : 'completed';
      if (cancelled) record.errorCode = 'MOCK_CANCELLED';
      else if (args.length) record.errorCode = codeOf(error);
    };
    // Derive one seed per call so each call has an independent, reproducible random stream
    // regardless of how many values previous calls consumed.
    const callRandom = seeded(Math.floor(this.random() * 4294967296));
    const context: GenerationContext = Object.freeze({
      request: modelRequest,
      prompt,
      match,
      callIndex: index,
      ruleIndex: rule?.hits ?? this.fallbackHits,
      signal,
      random: callRandom,
      // Read lazily so a clock failure is reported per call, not at construction.
      clock: () => readClock(this.options.clock ?? Date.now),
      report: (metadata: CallRecord['metadata']) => {
        signal.throwIfAborted();
        if (ended) return;
        const merged = { ...record.metadata, ...metadata };
        const text = jsonText(merged);
        breakWhile(
          !(new TextEncoder().encode(text).length <= 8192),
          () => new MockGPTError('MOCK_METADATA_LIMIT', 'Source metadata exceeds limit'),
        );
        record.metadata = cloneJson(merged);
      },
    });
    try {
      // Run the generator in a microtask so a signal aborted immediately prevents user code.
      const generated = await abortable(
        Promise.resolve().then(() => {
          signal.throwIfAborted();
          return typeof generator === 'function' ? generator(context) : generator;
        }),
        signal,
      );
      // Validate a snapshot before returning data; transport descriptors stay inert here.
      const value = snapshot(generated as Generator);
      const model =
        value instanceof ResponseDescription &&
        (value.kind === 'model' || value.kind === 'scenario')
          ? (value.value as ModelOutput)
          : undefined;
      // Output budget counts code points, not UTF-16 units, and includes serialized tool calls.
      const size = model
        ? (value instanceof ResponseDescription && value.kind === 'scenario'
            ? new TextEncoder().encode(jsonText(value.value)).length
            : charLength(model.content ?? '', this.options.maxOutputChars)) +
          (model.tools ? jsonText(model.tools).length : 0)
        : charLength(
            typeof value === 'string'
              ? value
              : jsonText(value instanceof ResponseDescription ? value.value : value),
            this.options.maxOutputChars,
          );
      breakWhile(
        !(size <= this.options.maxOutputChars!),
        () =>
          new MockGPTError(
            'MOCK_OUTPUT_LIMIT',
            'Generated response exceeds configured output limit',
          ),
      );
      signal.throwIfAborted();
      return await consume(value as Generated, record, finish, context.clock);
    } catch (error) {
      // Cancellation is recorded as cancelled even if the generator threw its own error.
      finish(error, signal.aborted);
      signal.throwIfAborted();
      throw error;
    }
  }
}
