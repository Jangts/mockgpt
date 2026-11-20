/**
 * 协议类场景清单：覆盖流式分片、延迟、用量、结束原因、工具提议、错误状态、
 * 断流与网络失败等传输行为。每个场景同时给出可复制提示和生成器配置，
 * 最终由 playground-config 合并进页面场景目录。
 */
import { responseExample, handlerExample, sequenceExample } from './generator-examples.ts';
import type { PlaygroundScenario } from './playground-config.ts';

/** 传输行为场景；covers 用于页面标注该场景演示的 SDK 能力。 */
export const protocolScenarios: readonly PlaygroundScenario[] = [
  {
    id: 'stream',
    label: '慢速长文分片，可随时停止',
    covers: ['stream', 'cancel', 'response.text'],
    prompt: '慢速长文',
    example: '慢速长文',
    ...responseExample(
      'text',
      '这段回答按小片段逐步输出。你可以观察内容增长，也可以点击停止。\n\n'.repeat(6),
      { chunkSize: 4, intervalMs: 80 },
    ),
  },
  {
    id: 'wire',
    label: '单字符与单字节分片，含中文和表情',
    covers: ['wireChunkSize'],
    prompt: '极细分片',
    example: '极细分片',
    ...responseExample('text', '你好，世界🙂。中文和表情应完整显示。', {
      chunkSize: 1,
      wireChunkSize: 1,
      intervalMs: 50,
    }),
  },
  {
    id: 'delay',
    label: '等待两秒后开始回复',
    covers: ['delayMs'],
    prompt: '延迟回复',
    example: '延迟回复',
    ...responseExample('text', '这条模拟回复等待了两秒后才开始返回。', { delayMs: 2000 }),
  },
  {
    id: 'usage',
    label: '显式 token 用量，完成后显示统计',
    covers: ['usage'],
    prompt: '用量统计演示',
    example: '用量统计演示',
    ...responseExample('text', '这是带模拟用量的回复。', {
      usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
    }),
  },
  {
    id: 'length',
    label: '模拟长度限制结束',
    covers: ['finishReason.length'],
    prompt: '长度限制演示',
    example: '长度限制演示',
    ...responseExample('text', '回答在这里因模拟长度限制结束……', { finishReason: 'length' }),
  },
  {
    id: 'filter',
    label: '模拟内容过滤结束',
    covers: ['finishReason.content_filter'],
    prompt: '内容过滤演示',
    example: '内容过滤演示',
    ...responseExample('text', '这是模拟的内容过滤结果。', { finishReason: 'content_filter' }),
  },
  {
    id: 'tool',
    label: '单工具提议，名称和参数分片',
    covers: ['generator.toolCall'],
    prompt: '模拟天气工具',
    example: '模拟天气工具',
    ...handlerExample('weatherTool'),
  },
  {
    id: 'tools',
    label: '两个工具提议，分别展示参数',
    covers: ['response.toolCalls'],
    prompt: '模拟双工具',
    example: '模拟双工具',
    ...handlerExample('pairedTools'),
  },
  {
    id: 'step',
    label: '连续发送三次依次回复，第四次报耗尽',
    covers: ['generator.sequence'],
    prompt: '下一步',
    example: '下一步',
    ...sequenceExample([
      '第一步：确认目标。',
      '第二步：生成结果。',
      '第三步：检查边界。再问一次将报序列耗尽。',
    ]),
  },
  {
    id: '429',
    label: 'HTTP 429 限流错误',
    covers: ['response.httpError'],
    prompt: '模拟429',
    example: '模拟429',
    ...responseExample('httpError', 429, {
      error: { message: '模拟限流，请稍后重试。', code: 'RATE_LIMIT' },
    }),
  },
  {
    id: '500',
    label: 'HTTP 500 上游错误',
    covers: ['response.httpError'],
    prompt: '模拟500',
    example: '模拟500',
    ...responseExample('httpError', 500, {
      error: { message: '模拟上游故障。', code: 'UPSTREAM_ERROR' },
    }),
  },
  {
    id: 'disconnect',
    label: '流中途断开，不发送成功终止帧',
    covers: ['interruptAfter'],
    prompt: '模拟断流',
    example: '模拟断流',
    ...responseExample('text', '这段内容会先显示几个分片，然后模拟连接中断。', {
      chunkSize: 3,
      interruptAfter: 5,
    }),
  },
  {
    id: 'network',
    label: '模拟连接故障',
    covers: ['response.reject'],
    prompt: '模拟网络失败',
    example: '模拟网络失败',
    ...responseExample('reject', '模拟网络失败'),
  },
];
