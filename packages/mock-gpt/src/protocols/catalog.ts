/** Protocol routing and codec contracts. Official sources checked 2026-11-25. */
import type { ModelRequest, ScenarioOutput } from '../types.js';
import { encodeModel, snapshotRequest } from '../runtime/chat-completions.js';
import { MockGPTError } from '../shared/utils.js';
import { responsesCodec } from './responses.js';
import { messagesCodec } from './messages.js';
import { geminiCodec } from './gemini.js';
import { interactionsCodec } from './interactions.js';
export interface ProtocolCodec {
  readonly id: string;
  match(path: string): boolean;
  decode(body: unknown, url: URL): ModelRequest;
  encode(
    request: ModelRequest,
    scenario: ScenarioOutput,
    id: string,
    created: number,
    signal: AbortSignal,
    finish: (error?: unknown, cancelled?: boolean) => void,
  ): Response;
  readonly capabilities: readonly string[];
  readonly events: readonly string[];
  readonly source: string;
}
export const chatCodec: ProtocolCodec = {
  id: 'chat-completions',
  match: (path) => ['/chat/completions', '/v1/chat/completions'].includes(path),
  decode: (body) => snapshotRequest(body),
  encode(request, scenario, id, created, signal, finish) {
    if (scenario.items.some((item) => !['text', 'function-call'].includes(item.type)))
      throw new MockGPTError('MOCK_CAPABILITY', 'Chat cannot represent scenario.items');
    const firstCall = scenario.items.findIndex((item) => item.type === 'function-call');
    if (firstCall >= 0 && scenario.items.slice(firstCall).some((item) => item.type === 'text'))
      throw new MockGPTError(
        'MOCK_CAPABILITY',
        'Chat cannot preserve scenario.items text after function-call',
      );
    const texts = scenario.items.filter((item) => item.type === 'text');
    return encodeModel(
      request,
      {
        ...scenario,
        content: texts.length ? texts.map((item) => item.text).join('') : null,
        tools: scenario.items.filter((item) => item.type === 'function-call'),
      },
      id,
      created,
      signal,
      finish,
    );
  },
  capabilities: ['text', 'function-call'],
  events: ['chat.completion.chunk'],
  source:
    'https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create',
};
/** Inspect native codecs without allowing a consumer to mutate shared routing. */
export const protocolCatalog: readonly ProtocolCodec[] = Object.freeze(
  [chatCodec, responsesCodec, messagesCodec, geminiCodec, interactionsCodec].map((codec) =>
    Object.freeze({
      ...codec,
      capabilities: Object.freeze([...codec.capabilities]),
      events: Object.freeze([...codec.events]),
    }),
  ),
);
export function findProtocol(path: string): ProtocolCodec | undefined {
  return protocolCatalog.find((codec) => codec.match(path));
}
