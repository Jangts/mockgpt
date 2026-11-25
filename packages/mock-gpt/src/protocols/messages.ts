/** Anthropic Messages 2023-06-01 codec; streaming guide checked 2026-11-25. */
import type { ProtocolCodec } from './catalog.js';
import { streamEvents, type WireEvent } from './sse.js';
import { objectBody, nativeRequest } from './request.js';
import { MockGPTError } from '../shared/utils.js';
export const messagesCodec: ProtocolCodec = {
  id: 'messages',
  match: (path) => ['/messages', '/v1/messages'].includes(path),
  decode(body) {
    const data = objectBody(body);
    if (!Array.isArray(data.messages))
      throw new MockGPTError('MOCK_REQUEST', 'messages must be an array', 400);
    return nativeRequest(data, 'messages', data.messages, data.messages);
  },
  encode(request, scenario, id, _created, signal, finish) {
    if (
      scenario.items.some((item) => item.type === 'search') &&
      !request.tools?.some((tool: any) => tool?.type === 'web_search_20250305')
    )
      throw new MockGPTError(
        'MOCK_CAPABILITY',
        'Search requires explicit web_search_20250305 tool',
      );
    const sources = scenario.items.flatMap((item) => (item.type === 'search' ? item.sources : []));
    const content: Record<string, any>[] = scenario.items.flatMap(
      (item, index): Record<string, any>[] => {
        switch (item.type) {
          case 'text':
            return [
              {
                type: 'text',
                text: item.text,
                ...(sources.length
                  ? {
                      citations: sources.map((source) => ({
                        type: 'web_search_result_location',
                        url: source.url,
                        title: source.title ?? '',
                        encrypted_index: 'mock',
                        cited_text: item.text.slice(0, 150),
                      })),
                    }
                  : {}),
              },
            ];
          case 'refusal':
            return [{ type: 'text', text: item.text }];
          case 'function-call':
            return [
              {
                type: 'tool_use',
                id: item.id ?? `${id}_call_${index}`,
                name: item.name,
                input: item.arguments,
              },
            ];
          case 'thinking':
            return [{ type: 'thinking', thinking: item.text, signature: item.signature ?? '' }];
          case 'search': {
            const call = item.id ?? `${id}_search_${index}`;
            return [
              {
                type: 'server_tool_use',
                id: call,
                name: 'web_search',
                input: { query: item.query },
              },
              {
                type: 'web_search_tool_result',
                tool_use_id: call,
                content: item.sources.map((source) => ({
                  type: 'web_search_result',
                  url: source.url,
                  title: source.title ?? '',
                  encrypted_content: 'mock',
                })),
              },
            ];
          }
          default:
            throw new MockGPTError(
              'MOCK_CAPABILITY',
              `Messages cannot represent scenario.items[${index}]`,
            );
        }
      },
    );
    // Official handling-stop-reasons guide (2026-11-25): refusal is the native
    // distinguishable safety terminal; it must not become end_turn or tool_use.
    const stop =
      scenario.finishReason === 'content_filter' || scenario.items.some(item => item.type === 'refusal')
        ? 'refusal'
        : scenario.finishReason === 'length'
          ? 'max_tokens'
          : scenario.items.some(item => item.type === 'function-call')
            ? 'tool_use'
            : 'end_turn';
    const usage = {
      input_tokens: scenario.usage?.prompt_tokens ?? 0,
      output_tokens: scenario.usage?.completion_tokens ?? 0,
    };
    const message = {
      id,
      type: 'message',
      role: 'assistant',
      model: request.model,
      content,
      stop_reason: stop,
      stop_sequence: null,
      usage,
    };
    if (!request.stream) {
      signal.throwIfAborted();
      finish();
      return Response.json(message);
    }
    const events: WireEvent[] = [
      {
        type: 'message_start',
        message: {
          ...message,
          content: [],
          stop_reason: null,
          usage: { ...usage, output_tokens: 0 },
        },
      },
    ];
    content.forEach((block, index) => {
      const field =
        block.type === 'text'
          ? 'text'
          : block.type === 'thinking'
            ? 'thinking'
            : block.type === 'tool_use'
              ? 'input'
              : undefined;
      events.push({
        type: 'content_block_start',
        index,
        content_block: field
          ? {
              ...block,
              [field]: field === 'input' ? {} : '',
              ...(field === 'thinking' ? { signature: '' } : {}),
            }
          : block,
      });
      if (field) {
        const text = field === 'input' ? JSON.stringify(block.input) : block[field];
        const chars = Array.from(text as string),
          size = scenario.chunkSize ?? 24;
        for (let offset = 0; offset < chars.length; offset += size)
          events.push({
            type: 'content_block_delta',
            index,
            delta: {
              type: field === 'input' ? 'input_json_delta' : `${field}_delta`,
              [field === 'input' ? 'partial_json' : field]: chars
                .slice(offset, offset + size)
                .join(''),
            },
          });
        if (field === 'text')
          for (const citation of block.citations ?? [])
            events.push({
              type: 'content_block_delta',
              index,
              delta: { type: 'citations_delta', citation },
            });
        if (field === 'thinking')
          events.push({
            type: 'content_block_delta',
            index,
            delta: { type: 'signature_delta', signature: block.signature },
          });
      }
      events.push({ type: 'content_block_stop', index });
    });
    events.push(
      {
        type: 'message_delta',
        delta: { stop_reason: stop, stop_sequence: null },
        usage: { output_tokens: usage.output_tokens },
      },
      { type: 'message_stop' },
    );
    return streamEvents(events, scenario, signal, finish);
  },
  capabilities: ['text', 'function-call', 'thinking', 'refusal', 'search'],
  events: [
    'message_start',
    'content_block_start',
    'content_block_delta',
    'content_block_stop',
    'message_delta',
    'message_stop',
  ],
  source: 'https://platform.claude.com/docs/en/build-with-claude/streaming',
};
