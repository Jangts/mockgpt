/**
 * Playground 场景清单：汇总内容示例、传输协议场景与其余演示项，并给出把清单
 * 转成 MockGPT 规则的函数。清单同时充当页面建议、帮助文本与配置示例的唯一来源。
 */
import type { MockGPTOptions, Rule } from '@jangts/mock-gpt';
import { fallbackReply } from './composed-generators.ts';
import {
  handlerExample,
  textExample,
  literalExample,
  helpExample,
  type GeneratorExample,
} from './generator-examples.ts';
import { protocolScenarios } from './protocol-scenarios.ts';
/** 页面场景条目：MockGPT 规则 + 列表、代码面板和配置示例所需的展示信息。 */
export interface PlaygroundScenario extends Rule, GeneratorExample {
  /** 场景唯一标识，用于选中回显、示例源码路径与测试引用。 */
  id: string;
  /** 展示用名称，作为列表副标题和帮助清单的说明。 */
  label: string;
  /** 点击后填入输入框的示例提示，同时用于列表标题。 */
  example: string;
  /** 本场景演示的 SDK 能力标签，仅用于展示与搜索过滤。 */
  covers: readonly string[];
  /** when 谓词的源码文本；配置快照用字符串替代不可序列化的函数。 */
  whenCode?: string;
}
/** 内容类场景；顺序即页面建议与帮助清单的展示顺序。 */
const contentScenarios: readonly PlaygroundScenario[] = [
  {
    id: 'users',
    label: '函数组合：编号、整数、小数、布尔、选值、日期、句子与头像',
    covers: [
      'generator.id',
      'generator.integer',
      'generator.float',
      'generator.boolean',
      'generator.pick',
      'generator.date',
      'generator.sentence',
      'generator.imageUrl',
    ],
    prompt: '生成用户资料',
    ...handlerExample('userProfiles'),
    example: '生成用户资料',
  },
  {
    id: 'orders',
    label: '函数式 JSON 订单与金额一致性',
    covers: ['function', 'json'],
    prompt: '生成订单',
    ...handlerExample('orders'),
    example: '生成订单',
  },
  {
    id: 'recommend',
    label: '组合生成自然语言推荐',
    covers: ['function'],
    prompt: '推荐一杯咖啡',
    ...handlerExample('recommendation'),
    example: '推荐一杯咖啡',
  },
  {
    id: 'web',
    label: '网页读取与摘要，跨域受限或读取失败时返回提示',
    covers: ['source.web'],
    prompt: /^(?:网页总结|总结网页)\s+https?:\/\//,
    ...textExample('summary', { maxChars: 500 }, 'web'),
    example: '网页总结 https://example.com/',
  },
  {
    id: 'summary',
    label: '输入相关摘要与正则捕获',
    covers: ['generator.summary', 'match.regex'],
    prompt: /^(?:总结|摘要)[:：\s]+([\s\S]+)/,
    ...textExample('summary', {}, 'body'),
    example: '总结：春天适合播种。咖啡馆准备增加新的阅读区。我们会先整理书架，再邀请大家来读书。',
  },
  {
    id: 'bullets',
    label: 'Markdown 要点',
    covers: ['generator.bullets'],
    prompt: /^要点[:：\s]+([\s\S]+)/,
    ...textExample('bullets', {}, 'body'),
    example: '要点：先确认需求。然后完成实现。最后做一次回归检查。',
  },
  {
    id: 'keywords',
    label: 'JSON 关键词数组',
    covers: ['generator.keywords'],
    prompt: /^关键词[:：\s]+([\s\S]+)/,
    ...textExample('keywords', {}, 'body'),
    example: '关键词：咖啡馆提供咖啡、阅读和音乐，咖啡带来温暖。',
  },
  {
    id: 'title',
    label: '单行标题',
    covers: ['generator.title'],
    prompt: /^标题[:：\s]+([\s\S]+)/,
    ...textExample('title', {}, 'body'),
    example: '标题：我们要建一个可以聊天和阅读的咖啡馆。',
  },
  {
    id: 'extract',
    label: '提取日期、邮箱与金额',
    covers: ['generator.extract'],
    prompt: /^提取[:：\s]+([\s\S]+)/,
    ...textExample('extract', {}, 'body'),
    example: '提取：2026-10-30 联系 demo@example.com，预算 ¥120。',
  },
  {
    id: 'image',
    label: 'Markdown 图片回复',
    covers: ['generator.imageUrl', 'markdown.image'],
    prompt: /^(?:生成图片|生成图像|模拟生图|生图|演示图片)(?:[:：\s]|$)/u,
    ...handlerExample('imageMarkdown'),
    example: '生成图片',
  },
  {
    id: 'table',
    label: 'Markdown 表格回复',
    covers: ['markdown.table'],
    prompt: '生成表格',
    ...handlerExample('tableMarkdown'),
    example: '生成表格',
  },
];
/** 页面完整场景清单：内容示例、传输协议场景与其余演示项按此处顺序展示。 */
export const playgroundScenarios: readonly PlaygroundScenario[] = [
  ...contentScenarios,
  ...protocolScenarios,
  {
    id: 'async',
    label: '异步来源与摘要',
    covers: ['async', 'source.function'],
    prompt: '总结异步资料',
    example: '总结异步资料',
    ...textExample('summary', {}, 'async'),
  },
  {
    id: 'summary-late',
    label: '跳过无关前言，选取后文重点',
    covers: ['summary.relevance'],
    prompt: /^后文摘要[:：]([\s\S]+)/,
    example:
      '后文摘要：欢迎访问网站，这里介绍栏目。花园有一只小猫。学校太阳能储能项目开始试点。储能电池可在停电时继续供电。试点使学校年度电费降低百分之三十。',
    ...textExample('summary', { maxChars: 100 }, 'body'),
  },
  {
    id: 'summary-diverse',
    label: '重复降权，保留不同方面',
    covers: ['summary.diversity'],
    prompt: /^多角度摘要[:：]([\s\S]+)/,
    example:
      '多角度摘要：学校太阳能项目使用储能电池供电。太阳能项目安装储能电池维持供电。太阳能项目采用储能电池持续供电。项目预算一百万元，资金来自专项补助。预计九月开工，十二月验收。',
    ...textExample('summary', { maxChars: 140 }, 'body'),
  },
  {
    id: 'chat',
    label: '模板聊天与本轮消息条件',
    covers: ['generator.reply', 'match.when'],
    prompt: '你好',
    when: (request) => request.messages.at(-1)?.role === 'user',
    whenCode: "request => request.messages.at(-1)?.role === 'user'",
    example: '你好',
    ...handlerExample('chatReply'),
  },
  {
    id: 'continue',
    label: '使用请求历史续接话题',
    covers: ['history'],
    prompt: '继续',
    example: '继续',
    ...handlerExample('chatReply'),
  },
  {
    id: 'tasks',
    label: '随机组合 JSON 任务列表',
    covers: ['json'],
    prompt: '生成待办',
    example: '生成待办',
    ...handlerExample('taskList'),
  },
  {
    id: 'story',
    label: '随机人物、场景与结局的故事',
    covers: ['text'],
    prompt: '讲个小故事',
    example: '讲个小故事',
    ...handlerExample('shortStory'),
  },
  {
    id: 'model',
    label: '指定模型名匹配',
    covers: ['match.model'],
    model: 'mock-gpt',
    prompt: '模型匹配演示',
    example: '模型匹配演示',
    ...literalExample('当前请求匹配到了 mock-gpt 模型专用规则。'),
  },
  {
    id: 'once',
    label: '仅命中一次，再次提问进入兜底',
    covers: ['match.times'],
    times: 1,
    prompt: '领取演示券',
    example: '领取演示券',
    ...literalExample('已领取这张虚构演示券；再次发送同一句话会进入模板兜底。'),
  },
  {
    id: 'fallback',
    label: '规则未命中时的模板兜底',
    covers: ['fallback'],
    prompt: '兜底入口不注册规则',
    example: '聊聊月球上的咖啡馆',
    when: () => false,
    whenCode: '() => false',
    ...literalExample('不会执行'),
  },
  {
    id: 'help',
    label: '列出全部演示场景',
    covers: ['catalog'],
    prompt: '帮助',
    example: '帮助',
    ...helpExample(() =>
      playgroundScenarios.map((item) => `${item.example}\n${item.label}`).join('\n\n'),
    ),
  },
];
/**
 * 从场景条目中剥离展示字段，只保留可交给 MockGPT 的规则字段。
 * @param scenario 页面场景定义，含示例源码与展示信息。
 * @returns 仅含 id、prompt、when、generator 等规则字段的对象。
 */
export function scenarioRule({
  example,
  label,
  covers,
  generatorCode,
  modules,
  imports,
  whenCode,
  ...rule
}: PlaygroundScenario): Rule {
  return rule;
}
/**
 * 组装页面的 MockGPT 配置：规则顺序与场景清单一致，未命中时使用兜底回复。
 * @returns 可直接传给 MockGPT 构造函数的选项。
 */
export function playgroundConfig(): MockGPTOptions {
  return { rules: playgroundScenarios.map(scenarioRule), fallback: fallbackReply };
}
