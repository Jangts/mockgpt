/**
 * 模拟传输适配器：把浏览器的 fetch 调用转换成 MockGPT 生成请求，并按
 * Chat Completions 合同编码为 JSON 或流式响应，页面因此不依赖服务端。
 */
import {
  MockGPT,
  MockGPTError,
  ResponseDescription,
  responses,
  findProtocol,
  type GenerationInput,
  type ModelOutput,
  type ModelRequest,
  type HttpFault,
  type OutputOptions,
  type ScenarioOutput,
} from '@jangts/mock-gpt';
import { encodeModelResponse as encodeModel } from '@jangts/mock-gpt';
import { delay, jsonText } from './stream-utils.ts';
import { readRequest } from './request-body.ts';

/**
 * 创建只识别 `/v1/chat/completions` 与 `/chat/completions` 的 fetch 实现。
 * 应用自有的请求适配层：SDK 只负责生成，HTTP 状态码与流式输出在这里编码。
 * @param mock 页面持有的 MockGPT 实例，规则命中计数与随机状态都由它维护。
 * @param defaults 未显式配置分片大小、间隔与字节分片时使用的输出默认值。
 * @returns 与 `fetch` 同签名的函数；拒绝请求时返回 4xx JSON，其余错误继续抛出。
 */
export function createPlaygroundFetch(
  mock: MockGPT,
  defaults: Pick<OutputOptions, 'chunkSize' | 'intervalMs' | 'wireChunkSize'> = {
    chunkSize: 8,
    intervalMs: 50,
  },
): typeof fetch {
  const streamDefaults = Object.freeze(
    Object.fromEntries(Object.entries(defaults).filter(([, value]) => value !== undefined)),
  );
  responses.text('', streamDefaults);
  let next = 0;
  return async (input, init) => {
    const request = new Request(input, init);
    request.signal.throwIfAborted();
    const codec = findProtocol(new URL(request.url).pathname);
    if (codec?.id !== 'chat-completions')
      return Response.json({ error: { message: 'Unknown model route' } }, { status: 404 });
    if (request.method !== 'POST')
      return Response.json({ error: { message: 'Expected POST' } }, { status: 405 });
    const id = `chatcmpl-playground-${++next}`;
    let value: GenerationInput;
    let generated;
    try {
      value = await readRequest(request);
      generated = await mock.generate(value, { signal: request.signal });
    } catch (error) {
      request.signal.throwIfAborted();
      if (error instanceof MockGPTError && ['MOCK_REQUEST', 'MOCK_BODY_LIMIT'].includes(error.code))
        return Response.json(
          { error: { message: error.message, code: error.code } },
          { status: error.status },
        );
      throw error;
    }
    const description =
      generated instanceof ResponseDescription
        ? generated
        : new ResponseDescription('model', {
            content: typeof generated === 'string' ? generated : jsonText(generated),
          });
    if (description.kind === 'reject')
      throw new MockGPTError('MOCK_NETWORK', String(description.value));
    if (description.kind === 'http') {
      const fault = description.value as HttpFault;
      return Response.json(fault.body, { status: fault.status });
    }
    if (description.kind === 'scenario') {
      const scenario = { ...streamDefaults, ...(description.value as ScenarioOutput) };
      await delay(scenario.delayMs ?? 0, request.signal);
      return codec.encode(
        { ...value, stream: value.stream ?? false } as ModelRequest,
        scenario,
        id,
        Math.floor(Date.now() / 1000),
        request.signal,
        () => {},
      );
    }
    const result: ModelOutput = { ...streamDefaults, ...(description.value as ModelOutput) };
    await delay(result.delayMs ?? 0, request.signal);
    return encodeModel(
      { ...value, stream: value.stream ?? false } as ModelRequest,
      result,
      id,
      Math.floor(Date.now() / 1000),
      request.signal,
      () => {},
    );
  };
}
