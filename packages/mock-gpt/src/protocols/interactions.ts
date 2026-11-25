/** Gemini Interactions steps, event_type and native terminal verified against official
 * streaming guide 2026-11-25; interaction.completed does not carry steps.
 * https://aistudio.google.com/api-reference/interactions-api documents generic failed/error
 * but no refusal Content or content_filter status. Reject those portable outcomes explicitly
 * rather than silently reporting model_output text with completed status. */
import type { ProtocolCodec } from './catalog.js';
import { streamEvents, type WireEvent } from './sse.js';
import { objectBody, nativeRequest, textOf } from './request.js';
import { MockGPTError } from '../shared/utils.js';
export const interactionsCodec: ProtocolCodec = {
  id: 'gemini-interactions',
  match: (path) => /^\/v1(?:beta)?\/interactions$/.test(path),
  decode(body) {
    const data = objectBody(body),
      input = typeof data.input === 'string' ? [{ role: 'user', content: data.input }] : data.input;
    if (!Array.isArray(input) || !input.length)
      throw new MockGPTError('MOCK_REQUEST', 'input must be nonempty', 400);
    const messages = input.map((item) => ({
      role: item.role === 'model' ? 'assistant' : (item.role ?? 'user'),
      content: textOf(item.content ?? (item.type === 'text' ? item.text : '')),
    }));
    return nativeRequest(data, 'gemini-interactions', messages, input);
  },
  encode(request, scenario, id, created, signal, finish) {
    if (scenario.finishReason === 'content_filter')
      throw new MockGPTError('MOCK_CAPABILITY', 'Interactions cannot represent scenario.finishReason=content_filter');
    const refusalIndex = scenario.items.findIndex(item => item.type === 'refusal');
    if (refusalIndex >= 0)
      throw new MockGPTError('MOCK_CAPABILITY', `Interactions cannot represent scenario.items[${refusalIndex}].refusal`);
    if (
      scenario.items.some((item) => item.type === 'search') &&
      !request.tools?.some((tool: any) => tool?.type === 'google_search')
    )
      throw new MockGPTError('MOCK_CAPABILITY', 'Search requires explicit google_search tool');
    const steps: Record<string, any>[] = scenario.items.flatMap(
      (item, index): Record<string, any>[] => {
        switch (item.type) {
          case 'text':
            return [{ type: 'model_output', content: [{ type: 'text', text: item.text }] }];
          case 'refusal':
            throw new MockGPTError('MOCK_CAPABILITY', `Interactions cannot represent scenario.items[${index}].refusal`);
          case 'thinking':
            return [
              {
                type: 'thought',
                signature: item.signature ?? '',
                summary: [{ type: 'text', text: item.text }],
              },
            ];
          case 'function-call':
            return [
              {
                type: 'function_call',
                id: item.id ?? `${id}_call_${index}`,
                name: item.name,
                arguments: item.arguments,
              },
            ];
          case 'media':
            return [
              {
                type: 'model_output',
                content: [
                  {
                    type: item.modality === 'file' ? 'document' : item.modality,
                    uri: item.uri,
                    mime_type: item.mimeType ?? `${item.modality}/*`,
                  },
                ],
              },
            ];
          case 'search': {
            const call = item.id ?? `${id}_search_${index}`;
            return [
              { type: 'google_search_call', id: call, arguments: { queries: [item.query] } },
              {
                type: 'google_search_result',
                call_id: call,
                result: item.sources.map((source) => ({
                  url: source.url,
                  title: source.title ?? '',
                })),
                is_error: false,
              },
            ];
          }
        }
      },
    );
    const status = scenario.items.some((item) => item.type === 'function-call')
      ? 'requires_action'
      : scenario.finishReason === 'length'
        ? 'incomplete'
        : 'completed';
    const interaction = {
      id,
      object: 'interaction',
      model: request.model,
      status,
      created: new Date(created * 1000).toISOString(),
      updated: new Date(created * 1000).toISOString(),
      usage: {
        total_input_tokens: scenario.usage?.prompt_tokens ?? 0,
        total_output_tokens: scenario.usage?.completion_tokens ?? 0,
        total_tokens: scenario.usage?.total_tokens ?? 0,
      },
    };
    if (!request.stream) {
      signal.throwIfAborted();
      finish();
      return Response.json({ ...interaction, steps });
    }
    const events: WireEvent[] = [
      { event_type: 'interaction.created', interaction: { ...interaction, status: 'in_progress' } },
    ];
    const emit = (event_type: string, fields: Record<string, unknown>) =>
      events.push({ event_type, ...fields });
    steps.forEach((step, index) => {
      const start =
        step.type === 'function_call'
          ? { ...step, arguments: {} }
          : step.type === 'model_output'
            ? { type: step.type }
            : step.type === 'thought'
              ? { type: step.type }
              : { ...step, arguments: undefined, result: undefined };
      emit('step.start', { index, step: start });
      if (step.type === 'model_output')
        step.content.forEach((content: any) => emit('step.delta', { index, delta: content }));
      else if (step.type === 'thought') {
        emit('step.delta', { index, delta: { type: 'thought_summary', content: step.summary[0] } });
        emit('step.delta', {
          index,
          delta: { type: 'thought_signature', signature: step.signature },
        });
      } else if (step.type === 'function_call') {
        const chars = Array.from(JSON.stringify(step.arguments));
        for (let offset = 0; offset < chars.length; offset += scenario.chunkSize ?? 24)
          emit('step.delta', {
            index,
            delta: {
              type: 'arguments_delta',
              arguments: chars.slice(offset, offset + (scenario.chunkSize ?? 24)).join(''),
            },
          });
      } else emit('step.delta', { index, delta: step });
      emit('step.stop', { index });
    });
    emit('interaction.completed', { interaction });
    return streamEvents(events, scenario, signal, finish);
  },
  capabilities: ['text', 'function-call', 'thinking', 'media', 'search'],
  events: ['interaction.created', 'step.start', 'step.delta', 'step.stop', 'interaction.completed'],
  source: 'https://aistudio.google.com/docs/streaming',
};
