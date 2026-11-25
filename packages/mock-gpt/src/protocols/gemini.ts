/** Gemini generateContent v1beta; native parts and stream response schema checked 2026-11-25. */
import type { ProtocolCodec } from './catalog.js';
import { streamEvents } from './sse.js';
import { objectBody, nativeRequest } from './request.js';
import { MockGPTError } from '../shared/utils.js';
export const geminiCodec: ProtocolCodec = {
  id: 'gemini-generate-content',
  match: (path) =>
    /^\/v1(?:beta)?\/models\/[^/]+:(?:generateContent|streamGenerateContent)$/.test(path),
  decode(body, url) {
    const data = objectBody(body),
      model = decodeURIComponent(url.pathname.match(/\/models\/([^/]+):/)![1]);
    if (!Array.isArray(data.contents) || !data.contents.length)
      throw new MockGPTError('MOCK_REQUEST', 'contents must be a nonempty array', 400);
    const messages = data.contents.map((content: any) => ({
      role: content.role === 'model' ? 'assistant' : 'user',
      content:
        content.parts
          ?.filter((part: any) => typeof part.text === 'string' && !part.thought)
          .map((part: any) => ({ type: 'text', text: part.text })) ?? [],
    }));
    return nativeRequest(
      { ...data, model, stream: url.pathname.endsWith(':streamGenerateContent') },
      'gemini-generate-content',
      messages,
      data.contents,
    );
  },
  encode(request, scenario, id, _created, signal, finish) {
    const parts = scenario.items.map((item, index) => {
      switch (item.type) {
        case 'text':
        case 'refusal':
          return { text: item.text };
        case 'thinking':
          return {
            text: item.text,
            thought: true,
            ...(item.signature ? { thoughtSignature: item.signature } : {}),
          };
        case 'function-call':
          return {
            functionCall: {
              id: item.id ?? `${id}_call_${index}`,
              name: item.name,
              args: item.arguments,
            },
          };
        case 'media':
          return {
            fileData: { fileUri: item.uri, mimeType: item.mimeType ?? `${item.modality}/*` },
          };
        default:
          throw new MockGPTError(
            'MOCK_CAPABILITY',
            'generateContent search uses grounding metadata, not ordered search parts',
          );
      }
    });
    const finishReason =
      scenario.finishReason === 'length'
        ? 'MAX_TOKENS'
        : scenario.finishReason === 'content_filter' ||
            scenario.items.some((item) => item.type === 'refusal')
          ? 'SAFETY'
          : 'STOP';
    const usageMetadata = {
      promptTokenCount: scenario.usage?.prompt_tokens ?? 0,
      candidatesTokenCount: scenario.usage?.completion_tokens ?? 0,
      totalTokenCount: scenario.usage?.total_tokens ?? 0,
    };
    const body = {
      responseId: id,
      candidates: [{ index: 0, content: { role: 'model', parts }, finishReason }],
      usageMetadata,
      modelVersion: request.model,
    };
    if (!request.stream) {
      signal.throwIfAborted();
      finish();
      return Response.json(body);
    }
    const events = parts.map((part) => ({
      responseId: id,
      candidates: [{ index: 0, content: { role: 'model', parts: [part] } }],
    }));
    events.push({
      responseId: id,
      candidates: [{ index: 0, content: { role: 'model', parts: [] }, finishReason }],
      usageMetadata,
    } as any);
    return streamEvents(events, scenario, signal, finish, false);
  },
  capabilities: ['text', 'function-call', 'thinking', 'refusal', 'media'],
  events: ['candidates'],
  source: 'https://ai.google.dev/api/generate-content',
};
