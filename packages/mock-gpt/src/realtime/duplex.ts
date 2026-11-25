/** Deterministic, bounded realtime protocol engine. No socket, device or media codec dependency. */
import {
  ResponseDescription,
  type Generated,
  type GenerationInput,
  type Message,
} from '../types.js';
import { cloneJson, integer, MockGPTError, delay } from '../shared/utils.js';
export type RealtimeProtocol = 'openai-realtime' | 'gemini-live';
export type RealtimeFrame = Readonly<Record<string, any>>;
/** The host owns rule admission and connection accounting. */
export interface RealtimeMock {
  generate(input: GenerationInput, options?: { signal?: AbortSignal }): Promise<Generated>;
  registerConnection?(close: () => void): () => void;
  noteRealtimeTurn?(): void;
}
export interface MockDuplexOptions {
  protocol: RealtimeProtocol;
  model?: string;
  maxQueuedFrames?: number;
  maxFrameBytes?: number;
  maxHistoryMessages?: number;
  maxAudioBytes?: number;
  signal?: AbortSignal;
}
export interface MockDuplex {
  send(frame: RealtimeFrame, signal?: AbortSignal): Promise<void>;
  frames: AsyncIterable<RealtimeFrame>;
  close(): void;
  readonly closed: boolean;
  readonly generation: number;
}
const fail = (message: string) => new MockGPTError('MOCK_REALTIME_PROTOCOL', message, 400);
/** Create a server-side duplex. Explicit response requests alone admit a new model generation. */
export function createMockDuplex(mock: RealtimeMock, options: MockDuplexOptions): MockDuplex {
  if (!['openai-realtime', 'gemini-live'].includes(options.protocol))
    throw fail('Unknown realtime protocol');
  const queued = integer(options.maxQueuedFrames ?? 64, 'maxQueuedFrames', 1);
  const bytes = integer(options.maxFrameBytes ?? 1_048_576, 'maxFrameBytes', 1);
  const historyLimit = integer(options.maxHistoryMessages ?? 1000, 'maxHistoryMessages', 1);
  const audioLimit = integer(options.maxAudioBytes ?? 1_048_576, 'maxAudioBytes', 1);
  let audio: { data: string; mimeType: string }[] = [];
  let audioSize = 0;
  const openai = options.protocol === 'openai-realtime';
  let setup = false,
    ended = false,
    generation = 0,
    sequence = 0,
    reading = false;
  let failure: unknown;
  let wake: (() => void) | undefined;
  let current: { id: string; generation: number; abort: AbortController } | undefined;
  let unregister = () => {};
  let history: Message[] = [];
  let model = options.model ?? 'mock';
  const calls = new Map<string, string>();
  const queue: RealtimeFrame[] = [];
  const notify = () => {
    const fn = wake;
    wake = undefined;
    fn?.();
  };
  const close = () => {
    if (ended) return;
    ended = true;
    current?.abort.abort();
    current = undefined;
    queue.length = 0;
    calls.clear();
    history = [];
    audio = [];
    audioSize = 0;
    unregister();
    options.signal?.removeEventListener('abort', close);
    notify();
  };
  const error = (cause: unknown) => {
    failure = cause;
    close();
  };
  const emit = (frame: RealtimeFrame) => {
    if (ended) return;
    if (queue.length >= queued || new TextEncoder().encode(JSON.stringify(frame)).length > bytes) {
      error(
        new MockGPTError('MOCK_RESOURCE_LIMIT', 'Realtime output queue or frame limit exceeded'),
      );
      return;
    }
    queue.push(cloneJson(frame));
    notify();
  };
  const append = (message: Message) => {
    if (history.length >= historyLimit)
      throw new MockGPTError('MOCK_RESOURCE_LIMIT', 'Realtime history limit exceeded');
    history.push(cloneJson(message));
  };
  const interrupt = () => {
    const previous = current;
    generation++;
    previous?.abort.abort();
    current = undefined;
    if (openai && previous)
      emit({
        type: 'response.done',
        response: { id: previous.id, status: 'cancelled', output: [] },
      });
    if (!openai) emit({ serverContent: { interrupted: true } });
    calls.clear();
  };
  async function run(continuation = false) {
    if (current) throw fail('Response already in progress');
    const turn = {
      id: `resp-mock-${++sequence}`,
      generation: continuation ? generation : ++generation,
      abort: new AbortController(),
    };
    current = turn;
    mock.noteRealtimeTurn?.();
    if (openai)
      emit({
        type: 'response.created',
        response: { id: turn.id, status: 'in_progress', output: [] },
      });
    try {
      const generated = await mock.generate(
        {
          model,
          messages: history.length ? history : [{ role: 'user', content: '' }],
          protocol: options.protocol,
        },
        { signal: turn.abort.signal },
      );
      if (ended || current !== turn || turn.abort.signal.aborted) return;
      let result: any =
        generated instanceof ResponseDescription
          ? generated.value
          : { content: typeof generated === 'string' ? generated : JSON.stringify(generated) };
      if (generated instanceof ResponseDescription && ['http', 'reject'].includes(generated.kind))
        throw fail('Simulated realtime generation failure');
      await delay(result.delayMs ?? 0, turn.abort.signal);
      const items: any[] = result.items ?? [
        ...(result.content ? [{ type: 'text', text: result.content }] : []),
        ...(result.tools ?? []).map((c: any) => ({ type: 'function-call', ...c })),
      ];
      const liveCalls: { id: string; name: string; args: unknown }[] = [];
      for (const [index, item] of items.entries()) {
        if (ended || current !== turn || turn.abort.signal.aborted) return;
        await delay(result.intervalMs ?? 0, turn.abort.signal);
        if (ended || current !== turn) return;
        if (item.type === 'text') {
          if (openai)
            emit({
              type: 'response.output_text.delta',
              response_id: turn.id,
              item_id: `${turn.id}_${index}`,
              output_index: index,
              content_index: 0,
              delta: item.text,
            });
          else
            emit({ serverContent: { modelTurn: { role: 'model', parts: [{ text: item.text }] } } });
          append({ role: 'assistant', content: item.text });
        } else if (item.type === 'function-call') {
          const id = item.id ?? `${turn.id}_call_${index}`;
          calls.set(id, item.name);
          if (openai) {
            emit({
              type: 'response.output_item.added',
              response_id: turn.id,
              output_index: index,
              item: {
                id: `item_${id}`,
                type: 'function_call',
                call_id: id,
                name: item.name,
                arguments: '',
              },
            });
            emit({
              type: 'response.function_call_arguments.done',
              response_id: turn.id,
              output_index: index,
              item_id: `item_${id}`,
              call_id: id,
              name: item.name,
              arguments: JSON.stringify(item.arguments),
            });
          } else liveCalls.push({ id, name: item.name, args: item.arguments });
          append({
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id,
                type: 'function',
                function: { name: item.name, arguments: JSON.stringify(item.arguments) },
              },
            ],
          });
        } else if (item.type === 'media' && item.modality === 'audio') {
          if (openai) {
            const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(item.uri);
            if (!match) throw fail('OpenAI audio output requires a base64 data URI');
            emit({ type: 'response.output_audio.delta', response_id: turn.id, delta: match[2] });
          } else
            emit({
              serverContent: {
                modelTurn: {
                  role: 'model',
                  parts: [{ fileData: { fileUri: item.uri, mimeType: item.mimeType } }],
                },
              },
            });
        } else throw fail(`Unsupported realtime scenario item: ${item.type}`);
      }
      if (ended || current !== turn) return;
      if (openai)
        emit({
          type: 'response.done',
          response: {
            id: turn.id,
            status: result.finishReason === 'length' ? 'incomplete' : 'completed',
            output: [],
            ...(result.usage
              ? {
                  usage: {
                    input_tokens: result.usage.prompt_tokens,
                    output_tokens: result.usage.completion_tokens,
                    total_tokens: result.usage.total_tokens,
                  },
                }
              : {}),
          },
        });
      else if (liveCalls.length) emit({ toolCall: { functionCalls: liveCalls } });
      else
        emit({
          serverContent: { turnComplete: true },
          ...(result.usage
            ? {
                usageMetadata: {
                  promptTokenCount: result.usage.prompt_tokens,
                  responseTokenCount: result.usage.completion_tokens,
                  totalTokenCount: result.usage.total_tokens,
                },
              }
            : {}),
        });
    } catch (cause) {
      if (!ended && current === turn && !turn.abort.signal.aborted) error(cause);
    } finally {
      if (current === turn) current = undefined;
    }
  }
  const addAudio = (data: unknown, mimeType = 'audio/pcm;rate=24000') => {
    if (typeof data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(data))
      throw fail('Audio requires base64 bytes');
    if (audioSize + data.length > audioLimit) {
      const cause = new MockGPTError('MOCK_RESOURCE_LIMIT', 'Realtime audio buffer limit exceeded');
      error(cause);
      throw cause;
    }
    audioSize += data.length;
    audio.push({ data, mimeType });
  };
  const commitAudio = () => {
    if (!audio.length) throw fail('Audio buffer is empty');
    append({
      role: 'user',
      content: audio.map((part) => ({ type: 'input_audio', input_audio: part })),
    });
    audio = [];
    audioSize = 0;
  };
  const toolResult = (id: string, value: unknown) => {
    if (!calls.has(id)) throw fail('Unknown, duplicate or interrupted tool result');
    append({
      role: 'tool',
      tool_call_id: id,
      content: typeof value === 'string' ? value : JSON.stringify(value),
    });
    calls.delete(id);
  };
  const duplex: MockDuplex = {
    get closed() {
      return ended;
    },
    get generation() {
      return generation;
    },
    close,
    async send(input, signal) {
      signal?.throwIfAborted();
      options.signal?.throwIfAborted();
      if (ended) throw failure ?? fail('Connection closed');
      if (new TextEncoder().encode(JSON.stringify(input)).length > bytes) {
        const e = new MockGPTError('MOCK_RESOURCE_LIMIT', 'Realtime input frame limit exceeded');
        error(e);
        throw e;
      }
      const frame = cloneJson(input);
      if ((openai && frame.type === 'session.update') || (!openai && frame.setup)) {
        if (setup) throw fail('Session already configured');
        setup = true;
        model = frame.session?.model ?? frame.setup?.model ?? model;
        emit(
          openai
            ? { type: 'session.updated', session: { id: 'session-mock', model } }
            : { setupComplete: {} },
        );
        return;
      }
      if (!setup) throw fail('Setup required');
      if (openai) {
        const handlers: Record<string, () => void> = {
          'conversation.item.create': () => {
            const item = frame.item;
            if (item?.type === 'function_call_output') toolResult(item.call_id, item.output);
            else if (item?.type === 'message' && item.role === 'user')
              append({
                role: 'user',
                content: (item.content ?? []).map((part: any) => part.text ?? '').join(''),
              });
            else throw fail('Unsupported conversation item');
          },
          'response.create': () => {
            if (current) throw fail('Response already in progress');
            void run();
          },
          'response.cancel': interrupt,
          'input_audio_buffer.append': () => addAudio(frame.audio),
          'input_audio_buffer.commit': commitAudio,
          'input_audio_buffer.clear': () => {
            audio = [];
            audioSize = 0;
          },
        };
        const handler = handlers[frame.type];
        if (!handler) throw fail('Unknown required realtime frame');
        handler();
      } else if (frame.clientContent) {
        if (current || calls.size) interrupt();
        for (const turn of frame.clientContent.turns ?? [])
          append({
            role: turn.role === 'model' ? 'assistant' : 'user',
            content: (turn.parts ?? []).map((part: any) => part.text ?? '').join(''),
          });
        if (frame.clientContent.turnComplete) void run();
      } else if (frame.toolResponse) {
        const results: unknown = frame.toolResponse.functionResponses;
        if (!Array.isArray(results) || !results.length) throw fail('Expected Live tool results');
        const ids = new Set<string>();
        for (const result of results) {
          if (
            !result ||
            typeof result.id !== 'string' ||
            !calls.has(result.id) ||
            ids.has(result.id)
          )
            throw fail('Unknown, duplicate or interrupted tool result');
          if (
            result.name !== calls.get(result.id) ||
            !result.response ||
            typeof result.response !== 'object' ||
            Array.isArray(result.response)
          )
            throw fail('Live tool result requires the matching name and a response object');
          ids.add(result.id);
        }
        if (history.length + results.length > historyLimit)
          throw new MockGPTError('MOCK_RESOURCE_LIMIT', 'Realtime history limit exceeded');
        for (const result of results) toolResult(result.id, result.response);
        if (!calls.size) void run(true);
      } else if (frame.realtimeInput?.activityStart) interrupt();
      else if (frame.realtimeInput?.audio)
        addAudio(frame.realtimeInput.audio.data, frame.realtimeInput.audio.mimeType);
      else if (frame.realtimeInput?.activityEnd) {
        if (current) throw fail('Response already in progress');
        commitAudio();
        void run();
      } else throw fail('Unknown required live frame');
    },
    frames: {
      async *[Symbol.asyncIterator]() {
        if (reading) throw fail('Only one realtime frame consumer is allowed');
        reading = true;
        try {
          while (true) {
            if (failure) throw failure;
            if (queue.length) {
              yield queue.shift()!;
              continue;
            }
            if (ended) return;
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
          }
        } finally {
          close();
        }
      },
    },
  };
  options.signal?.throwIfAborted();
  unregister = mock.registerConnection?.(close) ?? (() => {});
  options.signal?.addEventListener('abort', close, { once: true });
  return duplex;
}
