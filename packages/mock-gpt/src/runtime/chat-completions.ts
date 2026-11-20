/**
 * OpenAI-compatible `/chat/completions` wire codec.
 *
 * Owns what the mock accepts on that route (two path spellings, one canonical request shape) and
 * how a reply is encoded: one JSON body for non-streaming calls, or a sequence of SSE `data:`
 * frames plus a `data: [DONE]` terminator for streaming calls. Encoding is deterministic — ids,
 * frame order, frame count and content chunking depend only on the validated request and model
 * output. Only `intervalMs` (pacing) and `wireChunkSize` (byte slicing) vary with timing, and even
 * then the decoded payload is identical.
 */
import type { ModelRequest, ModelOutput } from '../types.js';
import { MockGPTError, cloneJson, delay, integer, jsonText, breakWhile } from '../shared/utils.js';
import { textChunks } from '../shared/text.js';
import { output } from './responses.js';

/**
 * Frozen route table matched by exact pathname.
 *
 * Both spellings are listed because OpenAI SDKs differ on whether `baseURL` already includes
 * `/v1`. The table is shared and frozen so importing it cannot re-route other instances.
 */
export const routes = Object.freeze([
  Object.freeze({ method: 'POST', path: '/chat/completions' }),
  Object.freeze({ method: 'POST', path: '/v1/chat/completions' }),
]);

/**
 * Copy and normalize a request body into the shape rules observe.
 *
 * Object-valued optional fields follow JSON request semantics; invalid data remains an input
 * error. `undefined` members are dropped so a rule cannot distinguish a client that omitted a
 * field from one whose JSON never had it.
 *
 * @param value Parsed request body.
 * @returns Normalized request; callers freeze it before exposing it to rules.
 * @throws MockGPTError `MOCK_REQUEST` (status 400) when the body is not JSON or fails validation.
 */
export function snapshotRequest(value: unknown): ModelRequest {
  let copy: unknown;
  try {
    copy = cloneJson(value, { omitUndefined: true });
  } catch {
    throw new MockGPTError('MOCK_REQUEST', 'Request must contain JSON-compatible data', 400);
  }
  return normalize(copy);
}

/**
 * Validate the fields the mock interprets and default the rest.
 *
 * Accepted: `model` (nonempty string), `messages` (nonempty array of messages with an OpenAI
 * role and string/array/null content), optional boolean `stream`, optional `tools` array,
 * `n` at most 1, and `stream_options.include_usage` as a boolean. Everything else is preserved
 * untouched for rules to read.
 *
 * @param value Candidate request object.
 * @returns The same object with `stream` defaulted to `false`.
 * @throws MockGPTError `MOCK_REQUEST` (status 400) on the first invalid field.
 */
export function normalize(value: unknown): ModelRequest {
  breakWhile(
    !(value && typeof value === 'object' && !Array.isArray(value)),
    () => new MockGPTError('MOCK_REQUEST', 'Expected request object', 400),
  );
  const data = value as ModelRequest;
  const checks = [
    [typeof data.model === 'string' && data.model.length > 0, 'model must be a nonempty string'],
    [Array.isArray(data.messages) && data.messages.length > 0, 'messages must be a nonempty array'],
    [data.stream === undefined || typeof data.stream === 'boolean', 'stream must be boolean'],
    [data.tools === undefined || Array.isArray(data.tools), 'tools must be an array'],
  ] as const;
  for (const [valid, message] of checks)
    breakWhile(!valid, () => new MockGPTError('MOCK_REQUEST', message, 400));
  for (const message of data.messages) {
    breakWhile(
      !(
        message &&
        typeof message === 'object' &&
        ['system', 'developer', 'user', 'assistant', 'tool', 'function'].includes(message.role)
      ),
      () => new MockGPTError('MOCK_REQUEST', 'Invalid message', 400),
    );
    breakWhile(
      !(
        message.content === undefined ||
        message.content === null ||
        typeof message.content === 'string' ||
        Array.isArray(message.content)
      ),
      () => new MockGPTError('MOCK_REQUEST', 'Invalid message content', 400),
    );
  }
  // The mock returns one choice; pretending to support n > 1 would silently drop replies.
  breakWhile(
    !(data.n === undefined || data.n === 1),
    () => new MockGPTError('MOCK_REQUEST', 'MockGPT supports n=1', 400),
  );
  breakWhile(
    !(
      data.stream_options === undefined ||
      (data.stream_options !== null &&
        typeof data.stream_options === 'object' &&
        !Array.isArray(data.stream_options) &&
        (data.stream_options.include_usage === undefined ||
          typeof data.stream_options.include_usage === 'boolean'))
    ),
    () => new MockGPTError('MOCK_REQUEST', 'Invalid stream_options', 400),
  );
  return { ...data, stream: data.stream ?? false };
}

/**
 * Project message content onto plain text.
 *
 * Strings are returned as-is; multimodal arrays keep only `text` blocks, joined by newlines in
 * their original order, so image/audio blocks never become part of a prompt.
 *
 * @param content Raw message content.
 * @returns Extracted text, or an empty string for any non-text shape.
 */
export function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

/**
 * Default prompt selector: text of the last `user` message.
 *
 * Only `user` messages count, so assistant prefill and tool output never move the prompt.
 *
 * @param request Normalized request.
 * @returns User text, or an empty string when the conversation has no user message.
 */
export function promptOf(request: ModelRequest): string {
  return messageText(request.messages.findLast((message) => message.role === 'user')?.content);
}

/**
 * Optional app-owned codec; validation and encoding consume the same snapshots.
 *
 * Thin public wrapper over `encodeModel`: re-validates identity arguments and re-snapshots both
 * the request and the model output, so callers that build replies themselves get identical
 * validation and cannot mutate the mock's state afterwards.
 *
 * @param request Request the reply answers.
 * @param result Model output to encode.
 * @param id Completion id copied into every frame.
 * @param created Unix timestamp in seconds already floored to an integer.
 * @param signal Cancellation source for streamed replies.
 * @param finish Callback invoked exactly once when the reply succeeds, fails or is cancelled.
 * @returns JSON or SSE `Response` depending on `request.stream`.
 * @throws MockGPTError `MOCK_CONFIG` for an invalid id, timestamp or callback.
 * @throws The abort reason when `signal` is already aborted.
 */
export function encodeModelResponse(
  request: ModelRequest,
  result: ModelOutput,
  id: string,
  created: number,
  signal: AbortSignal,
  finish: (error?: unknown, cancelled?: boolean) => void,
): Response {
  signal.throwIfAborted();
  breakWhile(
    typeof id !== 'string' ||
      !id ||
      !Number.isSafeInteger(created) ||
      created < 0 ||
      typeof finish !== 'function',
    () => new MockGPTError('MOCK_CONFIG', 'Invalid response identity or completion callback'),
  );
  return encodeModel(
    snapshotRequest(request),
    output(result).value as ModelOutput,
    id,
    created,
    signal,
    finish,
  );
}

/**
 * Encode an already-validated model output as a JSON body or an SSE stream.
 *
 * Frame order for streams: role announcement, content deltas, one tool-call opening frame per
 * call followed by name and argument deltas sharing that call index, a finish frame, an optional
 * usage-only chunk, then `data: [DONE]`. `finish` is called exactly once per reply, with the
 * cancellation flag set when the consumer or the signal ended the stream early.
 *
 * @param request Normalized request; only `stream` and `stream_options.include_usage` are read.
 * @param result Validated model output.
 * @param id Completion id copied into every frame.
 * @param created Unix timestamp in seconds.
 * @param signal Cancellation source; aborting errors the stream body.
 * @param finish Completion callback invoked exactly once.
 * @returns JSON or SSE `Response` depending on `request.stream`.
 * @throws MockGPTError `MOCK_CONFIG` when `chunkSize` is out of range.
 */
export function encodeModel(
  request: ModelRequest,
  result: ModelOutput,
  id: string,
  created: number,
  signal: AbortSignal,
  finish: (error?: unknown, cancelled?: boolean) => void,
): Response {
  // OpenAI clients group frames by id/model, so every frame repeats the same identity.
  const base = { id, created, model: request.model };
  const calls = result.tools?.map((call, index) => ({
    // The id is stable per call index because argument deltas only carry the index.
    id: call.id ?? `${id}_tool_${index}`,
    type: 'function',
    function: { name: call.name, arguments: jsonText(call.arguments) },
  }));
  const reason = result.finishReason ?? (calls?.length ? 'tool_calls' : 'stop');
  const message = {
    role: 'assistant',
    content: result.content ?? null,
    ...(calls?.length ? { tool_calls: calls } : {}),
  };
  if (!request.stream) {
    const response = Response.json({
      ...base,
      object: 'chat.completion',
      choices: [{ index: 0, message, finish_reason: reason, logprobs: null }],
      // Usage is optional in the OpenAI contract, so it appears only when the fixture declares it.
      ...(result.usage ? { usage: result.usage } : {}),
    });
    // A body response is complete as soon as it exists; the consumer drains it afterwards.
    finish();
    return response;
  }
  // `chunkSize` is measured in code points, matching the limits reported by the SDK.
  const chunkSize = integer(result.chunkSize ?? 24, 'chunkSize', 1);
  let frames = 0;
  const frame = (delta: unknown, finish_reason: string | null = null) => ({
    ...base,
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta, finish_reason, logprobs: null }],
  });
  function* payloads(): Generator<unknown> {
    // Clients expect the role before any content delta.
    yield frame({ role: 'assistant', content: '' });
    for (const content of textChunks(result.content ?? '', chunkSize)) yield frame({ content });
    for (const [index, call] of (calls ?? []).entries()) {
      // Tool-call deltas are keyed by `index`; the opening frame declares id and type once.
      yield frame({
        tool_calls: [
          { index, id: call.id, type: call.type, function: { name: '', arguments: '' } },
        ],
      });
      for (const name of textChunks(call.function.name, chunkSize))
        yield frame({ tool_calls: [{ index, function: { name } }] });
      for (const argumentsText of textChunks(call.function.arguments, chunkSize))
        yield frame({ tool_calls: [{ index, function: { arguments: argumentsText } }] });
    }
    // The finish frame carries no delta, only the reason for stopping.
    yield frame({}, reason);
    // With include_usage the terminal payload has no choices and must come after the finish frame.
    if (request.stream_options?.include_usage && result.usage)
      yield { ...base, object: 'chat.completion.chunk', choices: [], usage: result.usage };
  }
  const iterator = payloads();
  const encoder = new TextEncoder();
  let closed = false;
  let removeAbort: () => void;
  // Internal controller used only to interrupt a pending frame interval during cleanup.
  const interval = new AbortController();
  let pending = new Uint8Array();
  let offset = 0;
  let ending = false;
  const cleanup = () => {
    interval.abort();
    removeAbort();
    iterator.return(undefined);
    pending = new Uint8Array();
  };
  // Splitting is opt-in: the default keeps each SSE frame in a single transport chunk.
  const wireSize = result.wireChunkSize ?? Number.MAX_SAFE_INTEGER;
  const body = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        const stop = () => {
          if (!closed) {
            closed = true;
            controller.error(signal.reason);
            cleanup();
            // `cancelled` tells the runtime to record the call as cancelled, not failed.
            finish(signal.reason, true);
          }
        };
        removeAbort = () => signal.removeEventListener('abort', stop);
        signal.addEventListener('abort', stop, { once: true });
        // The signal may already have fired before the stream was constructed.
        signal.aborted && stop();
      },
      async pull(controller) {
        // ReadableStream never calls pull after closing/cancellation. In-flight
        // pulls still check closed after awaiting the interval below.
        try {
          signal.throwIfAborted();
          if (offset >= pending.length) {
            // Checked before waiting so an interrupted stream never emits another frame.
            if (result.interruptAfter !== undefined && frames >= result.interruptAfter)
              throw new Error('Simulated stream interruption');
            await delay(result.intervalMs ?? 0, interval.signal);
            if (closed) return;
            const item = iterator.next();
            ending = !!item.done;
            offset = 0;
            // SSE framing is `data: <json>\n\n`; the terminator uses the literal `[DONE]` token.
            pending = encoder.encode(
              ending ? 'data: [DONE]\n\n' : `data: ${JSON.stringify(item.value)}\n\n`,
            );
            if (!ending) frames++;
          }
          const end = Math.min(offset + wireSize, pending.length);
          controller.enqueue(pending.slice(offset, end));
          offset = end;
          if (ending && offset === pending.length) {
            closed = true;
            controller.close();
            cleanup();
            finish();
          }
        } catch (error) {
          if (!closed) {
            closed = true;
            controller.error(error);
            cleanup();
            finish(error, signal.aborted);
          }
        }
      },
      cancel(reason) {
        if (!closed) {
          closed = true;
          cleanup();
          // Consumer cancellation is reported as cancelled even if it supplies an odd reason.
          finish(reason ?? new DOMException('Cancelled', 'AbortError'), true);
        }
      },
    },
    // Refuse read-ahead: one frame is produced per pull, which keeps intervalMs observable
    // and avoids buffering the whole reply when nobody consumes it.
    { highWaterMark: 0 },
  );
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
  });
}
