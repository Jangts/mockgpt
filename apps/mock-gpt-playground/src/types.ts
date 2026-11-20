/**
 * Playground 前端的视图类型：会话消息、工具提议、场景元数据，以及兼容
 * Chat Completions 的流式增量与非流式完整响应。
 *
 * 这些类型只服务页面展示与增量聚合，不参与 SDK 的生成协议校验。
 */
export interface ToolCall {
  /** 调用标识，用于关联后续结果。 */
  id: string;
  /** 固定为 function，对应 Chat Completions 的工具类型。 */
  type: 'function';
  /** 函数名与序列化参数；参数在展示前不解析。 */
  function: { name: string; arguments: string };
}
/** 单条会话消息；正文随流式增量增长，状态字段只服务展示。 */
export interface Message {
  /** 消息发送方。 */
  role: 'user' | 'assistant';
  /** 已累计的正文；流式期间持续增长。 */
  content: string;
  /** 本次回复提出的工具调用，按 index 聚合。 */
  calls?: ToolCall[];
  /** 是否已收到正常结束信号。 */
  complete?: boolean;
  /** 展示状态，用于区分生成中、完成、取消与失败。 */
  state?: 'streaming' | 'complete' | 'cancelled' | 'error';
}
/** 页面可选的提示词场景；由规则配置和代码面板所需的源码片段组成。 */
export interface Scenario {
  /** 场景唯一 ID，与配置规则顺序对应。 */
  id: string;
  /** 展示用名称。 */
  label: string;
  /** 点击后填入输入框的示例提示。 */
  example: string;
  /** 该场景演示的 SDK 能力标签。 */
  covers: string[];
  /** 展示用规则快照，prompt 已转成字符串。 */
  config: Record<string, unknown>;
  /** 生成器源码片段，用于代码面板。 */
  generatorSource: string;
  /** 可选实现文件与完整配置代码。 */
  implementation?: { file: string; code: string };
}
/** 兼容 Chat Completions 的响应体：流式增量与非流式完整消息共用 choices。 */
export interface Completion {
  /** 候选列表；模拟器固定只返回一个候选。 */
  choices: {
    /** 流式增量；tool_calls 按 index 累积。 */
    delta?: {
      content?: string;
      tool_calls?: {
        /** 调用在响应中的顺序。 */
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
    /** 非流式完整消息。 */
    message?: { content?: string | null; tool_calls?: ToolCall[] };
    /** 结束原因，如 stop、tool_calls、length。 */
    finish_reason?: string | null;
  }[];
  /** 可选 token 用量，仅显式配置时出现。 */
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}
