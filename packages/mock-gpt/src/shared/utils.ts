/**
 * Shared low-level helpers used by every runtime, generator and transport module.
 *
 * The package's data boundary lives here: `snapshotJson` deep-copies anything that enters or
 * leaves the mock (configurations, requests, generated output, call records) while rejecting
 * cycles, non-finite numbers, functions, bigint, sparse arrays and class instances. Callers
 * therefore observe immutable, tamper-proof values regardless of what a generator or a test
 * fixture does afterwards. Also provides the seeded PRNG, abortable waits, bounded byte reads
 * and the error/response encoding used by the HTTP adapter.
 */
import type { JsonValue } from '../types.js';
/** Shared symbol brand so `instanceof` works across the ESM and CJS copies of this class. */
const errorBrand = Symbol.for('@jangts/mock-gpt/MockGPTError/v1');

/**
 * Error type carrying a stable machine-readable code plus optional HTTP status and details.
 *
 * The HTTP adapter maps `status` onto the response and serializes `code`/`details` into the
 * OpenAI-style error body, so codes are part of the public contract.
 */
export class MockGPTError extends Error {
  private readonly [errorBrand] = true;
  static [Symbol.hasInstance](value: unknown): boolean {
    if (this !== MockGPTError) return Function.prototype[Symbol.hasInstance].call(this, value);
    return (
      typeof value === 'object' &&
      value !== null &&
      Object.getOwnPropertyDescriptor(value, errorBrand)?.value === true
    );
  }
  /**
   * @param code Stable `MOCK_*` (or upstream) code reported in records and HTTP error bodies.
   * @param message Human-readable description; never contains private source content.
   * @param status HTTP status used when the error becomes a response; defaults to 500.
   * @param details Optional JSON diagnostics; must not include credentials or page content.
   */
  constructor(
    readonly code: string,
    message: string,
    readonly status = 500,
    readonly details?: Record<string, JsonValue>,
  ) {
    super(message);
    this.name = 'MockGPTError';
  }
}

/**
 * Throw when a rejection condition holds, with a lazily built message or error.
 *
 * Used as an assertion helper so validation reads as a linear list of checks that stops at the
 * first failure. Conditions can therefore be written in positive form ("is invalid") even
 * though the helper throws when true, and the error factory runs only on failure.
 *
 * @param condition Truthy value that must reject the surrounding operation.
 * @param error Message, error or factory producing either; defaults to a generic `Error`.
 * @throws Always throws when `condition` is truthy.
 */
export function breakWhile(
  condition: unknown,
  error?: string | Error | (() => string | Error),
): asserts condition is false {
  if (condition) {
    const value = typeof error === 'function' ? error() : error;
    throw value instanceof Error ? value : new Error(value ?? 'Check failed');
  }
}

/**
 * Validate that a value is a safe integer inside an inclusive range.
 *
 * @param value Candidate number.
 * @param name Field name used in the configuration error message.
 * @param min Inclusive lower bound; defaults to 0.
 * @param max Inclusive upper bound; defaults to `Number.MAX_SAFE_INTEGER`.
 * @returns The validated value, so the call can be used inline.
 * @throws MockGPTError `MOCK_CONFIG` when the value is not a safe integer in range.
 */
export function integer(
  value: number,
  name: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  breakWhile(
    !(Number.isSafeInteger(value) && value >= min && value <= max),
    () => new MockGPTError('MOCK_CONFIG', `${name} must be an integer in [${min}, ${max}]`),
  );
  return value;
}

/**
 * Enforce that a user callback returned its declared primitive synchronously.
 *
 * Async callbacks cannot be awaited without changing rule evaluation into a pipeline, so they
 * fail configuration validation instead of being silently coerced.
 *
 * @param value Value returned by the callback.
 * @param expected Primitive type the callback promised to return.
 * @param message Configuration error message describing the callback.
 * @throws MockGPTError `MOCK_CONFIG` when the runtime type differs from `expected`.
 */
export function checkSynchronous(
  value: unknown,
  expected: 'string' | 'boolean' | 'number',
  message: string,
): void {
  if (typeof value === expected) return;
  // Invalid async callbacks still own a rejection that must be observed.
  void Promise.resolve(value).catch(() => {});
  throw new MockGPTError('MOCK_CONFIG', message);
}

/**
 * Recursively copy a value into a plain JSON tree, reading every property at most once.
 *
 * Getters are read a single time and `toJSON` is never invoked, so snapshots cannot be
 * influenced by hidden serialization hooks. Prototype keys are defined as own properties,
 * which keeps `__proto__` data inert.
 *
 * @param value Candidate JSON value.
 * @param omitUndefined Drop object entries whose value is `undefined` (used for request bodies).
 * @returns A fresh plain object/array tree; shared references become independent copies.
 * @throws MockGPTError `MOCK_GENERATION` for unsupported types, cycles or excessive size.
 */
function snapshotJson(value: unknown, { omitUndefined = false } = {}): unknown {
  const active = new Set<object>();
  let nodes = 0;
  function copy(item: unknown, depth: number): unknown {
    // Flat limits keep hostile or accidental structures from exhausting the stack or memory.
    breakWhile(
      ++nodes > 100_000 || depth > 64,
      () => new MockGPTError('MOCK_GENERATION', 'JSON data exceeds complexity limit'),
    );
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    // `-0` is normalized because JSON has a single zero representation.
    if (typeof item === 'number' && Number.isFinite(item)) return item === 0 ? 0 : item;
    breakWhile(
      !(typeof item === 'object' && item !== null),
      () =>
        new MockGPTError(
          'MOCK_GENERATION',
          'Expected JSON data; undefined, functions, bigint and non-finite numbers are unsupported',
        ),
    );
    const object = item as object;
    breakWhile(active.has(object), () => new MockGPTError('MOCK_GENERATION', 'Circular JSON data'));
    breakWhile(
      !(
        Array.isArray(object) ||
        Object.getPrototypeOf(object) === Object.prototype ||
        Object.getPrototypeOf(object) === null
      ),
      () => new MockGPTError('MOCK_GENERATION', 'Expected plain JSON objects'),
    );
    active.add(object);
    const result: unknown[] | Record<string, unknown> = Array.isArray(object) ? [] : {};
    if (Array.isArray(object)) {
      breakWhile(
        object.length > 100_000,
        () => new MockGPTError('MOCK_GENERATION', 'JSON data exceeds complexity limit'),
      );
      // Index iteration surfaces array holes as `undefined`, which the child check rejects.
      for (let i = 0; i < object.length; i++)
        (result as unknown[]).push(copy(object[i], depth + 1));
    } else
      for (const key of Object.keys(object)) {
        const child = (object as Record<string, unknown>)[key];
        if (child !== undefined || !omitUndefined)
          Object.defineProperty(result, key, {
            value: copy(child, depth + 1),
            enumerable: true,
            configurable: true,
            writable: true,
          });
      }
    active.delete(object);
    return result;
  }
  return copy(value, 0);
}

/**
 * Serialize a value as compact JSON after snapshotting it.
 *
 * @param value Value to serialize; must be JSON-compatible.
 * @param options `omitUndefined` drops undefined object entries instead of rejecting them.
 * @returns Compact JSON text (no whitespace), stable for equal inputs.
 * @throws MockGPTError `MOCK_GENERATION` when the value is not JSON-compatible.
 */
export function jsonText(value: unknown, options?: { omitUndefined?: boolean }): string {
  return JSON.stringify(snapshotJson(value, options));
}

/**
 * Deep-copy a value through the JSON snapshot rules.
 *
 * @param value Value to copy.
 * @param options `omitUndefined` drops undefined object entries instead of rejecting them.
 * @returns A detached copy; later mutation of the source does not affect it.
 * @throws MockGPTError `MOCK_GENERATION` when the value is not JSON-compatible.
 */
export function cloneJson<T>(value: T, options?: { omitUndefined?: boolean }): T {
  return snapshotJson(value, options) as T;
}

/**
 * Recursively freeze a value in place.
 *
 * @param value Value to freeze; primitives are returned unchanged.
 * @returns The same reference, now deeply frozen wherever it is an object.
 */
export function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

/**
 * Race a promise against an abort signal, preserving the signal's reason.
 *
 * When the signal is already aborted the work still gets a rejection handler attached, so a
 * later failure never surfaces as an unhandled rejection.
 *
 * @param work Operation to wait for.
 * @param signal Cancellation source.
 * @returns The work result, or rejects with `signal.reason`.
 * @throws Whatever `work` throws, or the abort reason when cancelled first.
 */
export function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void work.catch(() => {});
    return Promise.reject(signal.reason);
  }
  return new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason);
    signal.addEventListener('abort', stop, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

/**
 * Wait for a delay that can be cut short by cancellation.
 *
 * @param ms Delay in milliseconds; 0 returns immediately after the abort check.
 * @param signal Cancellation source; aborting clears the timer.
 * @returns Resolves after the delay or rejects with `signal.reason`.
 * @throws The abort reason when the signal fires before the timer.
 */
export async function delay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (!ms) return;
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener('abort', cancel);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', cancel, { once: true });
  });
}

/**
 * Create a deterministic PRNG (mulberry32) returning floats in [0, 1).
 *
 * The whole package uses this generator so seeded runs are reproducible and no test depends on
 * `Math.random`.
 *
 * @param seed 32-bit seed; only the low 32 bits are used.
 * @returns Function producing the next float in [0, 1) for that sequence.
 */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Extract the reportable error code from a thrown value.
 *
 * @param error Any thrown value.
 * @returns The `MockGPTError.code`, or `MOCK_GENERATION` for arbitrary failures.
 */
export function codeOf(error: unknown): string {
  return error instanceof MockGPTError ? error.code : 'MOCK_GENERATION';
}

/**
 * Convert any thrown value into an OpenAI-style JSON error response.
 *
 * Unknown errors are reported as `MOCK_INTERNAL` with a generic message so internal details or
 * upstream content never leak into HTTP bodies.
 *
 * @param error Thrown value from request handling or generation.
 * @returns A `Response` whose status comes from the error (500 for unknown failures).
 */
export function errorResponse(error: unknown): Response {
  const e =
    error instanceof MockGPTError
      ? error
      : new MockGPTError('MOCK_INTERNAL', 'Mock request failed');
  return Response.json(
    {
      error: {
        message: e.message,
        type: 'mock_error',
        code: e.code,
        // Details are optional so the error body keeps the standard OpenAI shape.
        ...(e.details ? { details: e.details } : {}),
      },
    },
    { status: e.status },
  );
}

/**
 * Read a whole byte stream while enforcing a maximum size and observing cancellation.
 *
 * @param body Stream to drain; a null body yields an empty buffer.
 * @param limit Maximum accepted byte count.
 * @param signal Cancellation source.
 * @returns Concatenated bytes.
 * @throws MockGPTError `MOCK_BODY_LIMIT` (status 413) when the stream exceeds `limit`.
 * @throws The abort reason when the signal fires while reading.
 */
export async function readBytes(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      size += value.length;
      breakWhile(
        !(size <= limit),
        () =>
          new MockGPTError(
            'MOCK_BODY_LIMIT',
            'Response or request body exceeds configured byte limit',
            413,
          ),
      );
      chunks.push(value);
    }
    // A custom source's async cleanup must not prevent the caller from cancelling.
  } catch (error) {
    void reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

export { chars } from './text.js';
/** Diagnostic bag accepted by `GenerationContext.report`. */
export type Metadata = Record<string, JsonValue>;
