/** OpenAI Responses v1 codec; official streaming reference checked 2026-11-25. */
import type { ProtocolCodec } from './catalog.js';
import { streamEvents, type WireEvent } from './sse.js';
import { objectBody, nativeRequest, textOf } from './request.js';
import { MockGPTError } from '../shared/utils.js';
export const responsesCodec: ProtocolCodec = {
  id: 'responses',
  match: (path) => ['/responses', '/v1/responses'].includes(path),
  decode(body) {
    const data = objectBody(body);
    const input =
      typeof data.input === 'string' ? [{ role: 'user', content: data.input }] : data.input;
    if (!Array.isArray(input) || !input.length)
      throw new MockGPTError('MOCK_REQUEST', 'input must be text or a nonempty array', 400);
    const messages = input.map((item) =>
      item.type === 'function_call_output'
        ? {
            role: 'tool',
            content: typeof item.output === 'string' ? item.output : JSON.stringify(item.output),
            tool_call_id: item.call_id,
          }
        : item.role
          ? { ...item, content: textOf(item.content) }
          : { role: 'assistant', content: '' },
    );
    return nativeRequest(data, 'responses', messages, input);
  },
  encode(request, scenario, id, created, signal, finish) {
    if (
      scenario.items.some((item) => item.type === 'search') &&
      !request.tools?.some((tool: any) => tool?.type === 'web_search')
    )
      throw new MockGPTError('MOCK_CAPABILITY', 'Search requires explicit web_search tool');
    const sources = scenario.items.flatMap((item) => (item.type === 'search' ? item.sources : []));
    const output: Record<string, any>[] = scenario.items.map((item, index) => {
      const itemId = `${id}_item_${index}`;
      switch (item.type) {
        case 'text':
          return {
            type: 'message',
            id: itemId,
            role: 'assistant',
            status: 'completed',
            content: [
              {
                type: 'output_text',
                text: item.text,
                annotations: sources.map((source) => ({
                  type: 'url_citation',
                  start_index: 0,
                  end_index: item.text.length,
                  url: source.url,
                  title: source.title ?? '',
                })),
                logprobs: [],
              },
            ],
          };
        case 'refusal':
          return {
            type: 'message',
            id: itemId,
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'refusal', refusal: item.text }],
          };
        case 'function-call':
          return {
            type: 'function_call',
            id: itemId,
            call_id: item.id ?? `${id}_call_${index}`,
            name: item.name,
            arguments: JSON.stringify(item.arguments),
            status: 'completed',
          };
        case 'thinking':
          return {
            type: 'reasoning',
            id: itemId,
            summary: [{ type: 'summary_text', text: item.text }],
            ...(item.signature ? { encrypted_content: item.signature } : {}),
          };
        case 'search':
          return {
            type: 'web_search_call',
            id: item.id ?? itemId,
            status: 'completed',
            action: {
              type: 'search',
              query: item.query,
              sources: item.sources.map((source) => ({ type: 'url', ...source })),
            },
          };
        default:
          throw new MockGPTError(
            'MOCK_CAPABILITY',
            `Responses cannot represent scenario.items[${index}]`,
          );
      }
    });
    const status =
      scenario.finishReason === 'length' || scenario.finishReason === 'content_filter'
        ? 'incomplete'
        : 'completed';
    const response = {
      id,
      object: 'response',
      created_at: created,
      model: request.model,
      status,
      output,
      error: null,
      incomplete_details:
        status === 'incomplete'
          ? { reason: scenario.finishReason === 'length' ? 'max_output_tokens' : 'content_filter' }
          : null,
      usage: {
        input_tokens: scenario.usage?.prompt_tokens ?? 0,
        output_tokens: scenario.usage?.completion_tokens ?? 0,
        total_tokens: scenario.usage?.total_tokens ?? 0,
      },
    };
    if (!request.stream) {
      signal.throwIfAborted();
      finish();
      return Response.json(response);
    }
    const events: WireEvent[] = [];
    const emit = (type: string, fields: Record<string, unknown>) =>
      events.push({ type, sequence_number: events.length, ...fields });
    emit('response.created', {
      response: { ...response, status: 'in_progress', output: [], usage: null },
    });
    emit('response.in_progress', {
      response: { ...response, status: 'in_progress', output: [], usage: null },
    });
    output.forEach((item, output_index) => {
      const fields = { item_id: item.id, output_index };
      emit('response.output_item.added', {
        output_index,
        item: {
          ...item,
          status: 'in_progress',
          ...(item.type === 'message'
            ? { content: [] }
            : item.type === 'function_call'
              ? { arguments: '' }
              : {}),
        },
      });
      if (item.type === 'message') {
        const part = item.content[0],
          refusal = part.type === 'refusal',
          field = refusal ? 'refusal' : 'text',
          prefix = refusal ? 'response.refusal' : 'response.output_text';
        emit('response.content_part.added', {
          ...fields,
          content_index: 0,
          part: { ...part, [field]: '' },
        });
        const chars = Array.from(part[field] as string),
          size = scenario.chunkSize ?? 24;
        for (let offset = 0; offset < chars.length; offset += size)
          emit(`${prefix}.delta`, {
            ...fields,
            content_index: 0,
            delta: chars.slice(offset, offset + size).join(''),
            ...(refusal ? {} : { logprobs: [] }),
          });
        emit(`${prefix}.done`, {
          ...fields,
          content_index: 0,
          [field]: part[field],
          ...(refusal ? {} : { logprobs: [] }),
        });
        emit('response.content_part.done', { ...fields, content_index: 0, part });
      } else if (item.type === 'web_search_call') {
        for (const phase of ['in_progress', 'searching', 'completed'])
          emit(`response.web_search_call.${phase}`, fields);
      } else if (item.type === 'function_call') {
        const chars = Array.from(item.arguments as string),
          size = scenario.chunkSize ?? 24;
        for (let offset = 0; offset < chars.length; offset += size)
          emit('response.function_call_arguments.delta', {
            ...fields,
            delta: chars.slice(offset, offset + size).join(''),
          });
        emit('response.function_call_arguments.done', {
          ...fields,
          arguments: item.arguments,
          name: item.name,
        });
      }
      emit('response.output_item.done', { output_index, item });
    });
    emit(status === 'incomplete' ? 'response.incomplete' : 'response.completed', { response });
    return streamEvents(events, scenario, signal, finish);
  },
  capabilities: ['text', 'function-call', 'thinking', 'refusal', 'search'],
  events: [
    'response.created',
    'response.in_progress',
    'response.output_item.added',
    'response.output_text.delta',
    'response.function_call_arguments.delta',
    'response.output_item.done',
    'response.completed',
    'response.incomplete',
  ],
  source: 'https://developers.openai.com/api/reference/resources/responses/streaming-events',
};
