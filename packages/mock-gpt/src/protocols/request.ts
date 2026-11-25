/** Native input snapshots preserve ordering while text prompts remain portable. */
import type { ModelRequest, Message } from '../types.js';
import { snapshotRequest } from '../runtime/chat-completions.js';
import { cloneJson, MockGPTError } from '../shared/utils.js';
export function objectBody(body: unknown): Record<string, any> {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new MockGPTError('MOCK_REQUEST', 'Expected request object', 400);
  return cloneJson(body) as Record<string, any>;
}
export function nativeRequest(
  body: Record<string, any>,
  protocol: string,
  messages: Message[],
  orderedInput: unknown,
): ModelRequest {
  const toolResults: unknown[] = [];
  const visit = (value: any): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (
      ['tool_result', 'function_call_output', 'function_result'].includes(value.type) ||
      value.functionResponse ||
      value.role === 'tool'
    )
      toolResults.push(value);
    Object.values(value).forEach(visit);
  };
  visit(orderedInput);
  const normalized = [...messages];
  for (const value of toolResults as any[])
    if (value.role !== 'tool')
      normalized.push({
        role: 'tool',
        content:
          typeof (value.content ?? value.output ?? value.result) === 'string'
            ? (value.content ?? value.output ?? value.result)
            : JSON.stringify(
                value.content ??
                  value.output ??
                  value.result ??
                  value.functionResponse?.response ??
                  null,
              ),
        tool_call_id:
          value.tool_use_id ?? value.call_id ?? value.id ?? value.functionResponse?.id ?? '',
      });
  return snapshotRequest({
    ...body,
    messages: normalized,
    protocol,
    native: body,
    orderedInput,
    toolResults,
    stream: body.stream ?? false,
  });
}
export function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .filter(
      (item) =>
        item &&
        typeof item === 'object' &&
        ['text', 'input_text', 'output_text'].includes(item.type),
    )
    .map((item) => item.text ?? '')
    .join('\n');
}
