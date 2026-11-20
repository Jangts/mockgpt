import { MockGPTError, type GenerationInput } from '@jangts/mock-gpt';

/** 应用自管的传输预算；取消时不得等待自定义流的清理。 */
export async function readRequest(request: Request, limit = 1_048_576): Promise<GenerationInput> {
  request.signal.throwIfAborted();
  const reader = request.body?.getReader();
  if (!reader) throw new MockGPTError('MOCK_REQUEST', 'Invalid JSON', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => {
    void reader.cancel(request.signal.reason).catch(() => {});
  };
  request.signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      request.signal.throwIfAborted();
      const next = await reader.read();
      request.signal.throwIfAborted();
      if (next.done) break;
      size += next.value.length;
      if (size > limit)
        throw new MockGPTError(
          'MOCK_BODY_LIMIT',
          'Request body exceeds configured byte limit',
          413,
        );
      chunks.push(next.value);
    }
  } finally {
    request.signal.removeEventListener('abort', cancel);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new MockGPTError('MOCK_REQUEST', 'Invalid JSON', 400);
  }
}
