/**
 * 组合生成器示例：用共享候选池和 SDK 生成器拼出用户资料、订单、推荐、待办、
 * 故事与工具调用等模拟数据，供 playground 场景和代码面板共同引用。
 */
import type { GenerationContext } from '@jangts/mock-gpt';
import { generators, responses } from '@jangts/mock-gpt';

// 共享候选池让 JSON、Markdown 与自然语言示例保持一致。
const names = [
  '林小雨',
  '陈星河',
  '许暖暖',
  '沈知夏',
  '陆清和',
  '苏晚晴',
  '周予安',
  '顾南风',
  '叶书宁',
  '宋云舟',
  '程亦然',
  '江听澜',
  '温以棠',
  '唐沐晨',
  '梁若溪',
  '夏望舒',
  '谢临川',
  '钟明月',
  '方景行',
  '韩晓棠',
  '孟初雪',
  '白映秋',
  '蒋思远',
  '秦乐言',
  '余嘉禾',
  '杜清欢',
  '罗星野',
  '徐念慈',
  '吴时雨',
  '赵青岚',
  '柳云舒',
  '郑子墨',
  '何小满',
  '丁一诺',
  '蔡若竹',
  '邵明溪',
  '邹见山',
  '袁朝露',
  '易书白',
  '高听雨',
];
const drinks = [
  { name: '燕麦拿铁', priceCents: 2800, category: 'coffee' },
  { name: '手冲咖啡', priceCents: 3200, category: 'coffee' },
  { name: '美式咖啡', priceCents: 2200, category: 'coffee' },
  { name: '意式浓缩', priceCents: 1800, category: 'coffee' },
  { name: '澳白咖啡', priceCents: 2700, category: 'coffee' },
  { name: '卡布奇诺', priceCents: 2600, category: 'coffee' },
  { name: '摩卡咖啡', priceCents: 3000, category: 'coffee' },
  { name: '焦糖玛奇朵', priceCents: 3100, category: 'coffee' },
  { name: '香草拿铁', priceCents: 2900, category: 'coffee' },
  { name: '榛果拿铁', priceCents: 3000, category: 'coffee' },
  { name: '椰乳拿铁', priceCents: 2800, category: 'coffee' },
  { name: '桂花拿铁', priceCents: 3200, category: 'coffee' },
  { name: '海盐拿铁', priceCents: 3100, category: 'coffee' },
  { name: '蜂蜜肉桂拿铁', priceCents: 3300, category: 'coffee' },
  { name: '冷萃咖啡', priceCents: 2800, category: 'coffee' },
  { name: '氮气冷萃', priceCents: 3500, category: 'coffee' },
  { name: '橙香美式', priceCents: 2700, category: 'coffee' },
  { name: '柚子气泡美式', priceCents: 3000, category: 'coffee' },
  { name: '浓缩通宁', priceCents: 2900, category: 'coffee' },
  { name: '阿芙佳朵', priceCents: 3400, category: 'coffee' },
  { name: '馥芮白', priceCents: 2800, category: 'coffee' },
  { name: 'Dirty 咖啡', priceCents: 3000, category: 'coffee' },
  { name: '瑰夏手冲', priceCents: 4800, category: 'coffee' },
  { name: '耶加雪菲手冲', priceCents: 3600, category: 'coffee' },
  { name: '热巧克力', priceCents: 2400, category: 'cocoa' },
  { name: '抹茶拿铁', priceCents: 2600, category: 'tea' },
  { name: '伯爵红茶', priceCents: 2000, category: 'tea' },
  { name: '茉莉花茶', priceCents: 1800, category: 'tea' },
  { name: '蜜桃乌龙', priceCents: 2300, category: 'tea' },
  { name: '柠檬气泡水', priceCents: 2200, category: 'soda' },
];
const biographies = [
  '喜欢在雨天读一本旧书。',
  '周末常去散步和拍照。',
  '正在学习烘焙和手冲咖啡。',
  '喜欢爵士乐与安静的角落。',
  '热衷记录旅途中的小店。',
  '最近开始练习水彩画。',
  '爱看科幻小说，也爱逛植物园。',
  '习惯用手账整理生活。',
  '喜欢骑行，偶尔参加读书会。',
  '正在收集不同城市的明信片。',
  '希望学会做一道新的家常菜。',
  '喜欢观察街边的猫和树。',
  '偏爱黑白摄影和独立电影。',
  '休息时喜欢拼图与桌游。',
  '准备尝试一次短途露营。',
  '喜欢古典音乐和博物馆。',
  '想把阳台布置成一个小花园。',
  '对天文学和地方历史感兴趣。',
  '正在练习写短篇故事。',
  '愿意分享旅行中的新发现。',
];
const cities = [
  '武汉',
  '上海',
  '北京',
  '杭州',
  '成都',
  '南京',
  '苏州',
  '广州',
  '深圳',
  '厦门',
  '青岛',
  '西安',
  '长沙',
  '昆明',
  '大理',
  '福州',
];
const bookTopics = [
  '旅行',
  '咖啡',
  '科幻',
  '摄影',
  '建筑',
  '心理学',
  '历史',
  '植物',
  '设计',
  '烘焙',
  '天文学',
  '音乐',
];
const taskTitles = [
  '整理阅读书单',
  '安排周末散步',
  '给阳台植物浇水',
  '练习手冲咖啡',
  '预订读书会座位',
  '备份本周照片',
  '记录旅行预算',
  '整理桌面文件',
  '练习一段新曲子',
  '挑选下个月的展览',
  '准备一份午餐',
  '回复活动邀请',
];
const replyTemplates = [
  '关于“{topic}”，可以先明确目标，再分步骤尝试，并根据结果调整。',
  '可以从“{topic}”里挑一个最关心的点，先做一次小尝试，再记录观察结果。',
  '聊到“{topic}”，不妨先写下期待的结果，再列出手边能用的条件。',
  '围绕“{topic}”，可以先收集几个例子，比较它们的共同点，再决定下一步。',
  '如果想推进“{topic}”，可以先定一个小目标，完成后再调整计划。',
  '对于“{topic}”，先列出已有信息和还不确定的部分，通常会更容易展开。',
];

// 局部 Fisher-Yates 抽样避免同一批内重复，并且只使用带种子的上下文。
function drawDistinct<T>(items: readonly T[], count: number, context: GenerationContext): T[] {
  const remaining = [...items];
  return Array.from({ length: Math.min(count, remaining.length) }, (_, index) => {
    const next = index + Math.floor(context.random() * (remaining.length - index));
    [remaining[index], remaining[next]] = [remaining[next], remaining[index]];
    return remaining[index];
  });
}
const userId = generators.id('user');
const age = generators.integer(18, 60);
const verified = generators.boolean();
const score = generators.float(0, 1);
const createdAt = generators.date();
const sentence = generators.sentence();
const biography = generators.pick(biographies);
const avatar = generators.imageUrl({ width: 128, height: 128 });
const orderId = generators.id('order');
const quantity = generators.integer(1, 4);
const coffee = generators.pick(drinks.filter((item) => item.category === 'coffee'));
const orderStatus = generators.pick([
  'paid',
  'pending',
  'completed',
  'preparing',
  'ready',
  'cancelled',
]);
const occasion = generators.pick([
  '适合带着书慢慢品尝。',
  '可以作为午后休息时的一杯。',
  '不妨配一小块饼干。',
  '适合在散步结束后点上一杯。',
  '可以搭配今天的阅读时间。',
  '也适合与朋友聊天时分享。',
]);
const city = generators.pick(cities);
const bookTopic = generators.pick(bookTopics);
const bookLimit = generators.integer(2, 8);
const taskDone = generators.boolean();
const replyTemplate = generators.pick(replyTemplates);
const storyPlace = generators.pick([
  '海边的小镇',
  '山脚下的街角',
  '旧车站旁',
  '安静的小巷',
  '河堤边',
  '银杏树下',
  '图书馆对面',
  '午后的集市',
]);
const storyObject = generators.pick([
  '一张手绘地图',
  '一本旧诗集',
  '一封没有署名的信',
  '一张音乐会票根',
  '一枚木质书签',
  '一幅未完成的速写',
  '一张明信片',
  '一册旅行笔记',
]);
const storyEnding = generators.pick([
  '他们约好下周再来交换一个故事。',
  '临走前，旅人为下一位客人留了一杯咖啡。',
  '店主把这个小故事记在了柜台旁的本子里。',
  '从那天起，窗边多了一个交换故事的小盒子。',
  '雨停的时候，他们已经成为了新朋友。',
  '第二天，一张新的留言出现在了同一个位置。',
]);

/**
 * 生成 3 位互不重复的虚构用户资料，字段覆盖编号、年龄、验证状态与头像等示例能力。
 * @param context 生成上下文，提供种子随机数，同一场景内保持可复现。
 * @returns 带来源标记与 users 数组的普通对象。
 */
export function userProfiles(context: GenerationContext) {
  return {
    source: 'fictional-test-data',
    users: drawDistinct(names, 3, context).map((name) => ({
      id: userId(context),
      name,
      age: age(context),
      verified: verified(context),
      score: Number(score(context).toFixed(2)),
      createdAt: createdAt(context),
      bio: biography(context) + sentence(context),
      avatar: avatar(context),
    })),
  };
}
/**
 * 生成 4 笔饮品订单，单价与总价以元为单位，用于演示金额一致性。
 * @param context 生成上下文，提供种子随机数与请求信息。
 * @returns 带币种与 orders 数组的普通对象。
 */
export function orders(context: GenerationContext) {
  return {
    source: 'fictional-test-data',
    currency: 'CNY',
    orders: drawDistinct(drinks, 4, context).map((item) => {
      const count = quantity(context);
      return {
        id: orderId(context),
        item: item.name,
        quantity: count,
        unitPrice: item.priceCents / 100,
        total: (item.priceCents * count) / 100,
        status: orderStatus(context),
        createdAt: createdAt(context),
      };
    }),
  };
}
/**
 * 从候选饮品中挑一款，生成含价格与饮用场景的自然语言推荐。
 * @param context 生成上下文，提供种子随机数。
 * @returns 单条中文推荐文案，结尾注明这是模拟内容。
 */
export function recommendation(context: GenerationContext) {
  const item = coffee(context);
  return `今天推荐${item.name}，参考价格为 ${item.priceCents / 100} 元。${occasion(context)}\n\n这是模拟推荐，供测试交互使用。`;
}
/**
 * 抽取 3 条不重复的待办事项并随机标记完成状态。
 * @param context 生成上下文，提供种子随机数。
 * @returns 含 tasks 数组（title、done）的普通对象。
 */
export function taskList(context: GenerationContext) {
  return {
    tasks: drawDistinct(taskTitles, 3, context).map((title) => ({
      title,
      done: taskDone(context),
    })),
  };
}
/**
 * 组合地点、人物、物件与结局候选，生成一段短故事文本。
 * @param context 生成上下文，提供种子随机数。
 * @returns 多段中文故事正文。
 */
export function shortStory(context: GenerationContext) {
  const name = generators.pick(names)(context);
  return `${storyPlace(context)}的咖啡馆刚刚开门，${name}在窗边坐了下来。\n\n桌上放着${storyObject(context)}，上面写着：“如果还没遇到好事，就先喝杯咖啡。”店主说，那是上一位旅人留下的礼物。\n\n${storyEnding(context)}`;
}
/**
 * 生成单个 get_weather 工具调用提议，参数包含随机城市与摄氏度单位。
 * @param context 生成上下文，提供种子随机数。
 * @returns 工具调用生成器的执行结果（model 描述符）。
 */
export function weatherTool(context: GenerationContext) {
  const generator = generators.toolCall(
    'get_weather',
    { city: city(context), unit: 'celsius' },
    { chunkSize: 2 },
  );
  return typeof generator === 'function' ? generator(context) : generator;
}
/**
 * 一次响应返回两个工具调用：天气查询与按主题检索图书。
 * @param context 生成上下文，提供种子随机数。
 * @returns 含两个工具调用的 model 描述符。
 */
export function pairedTools(context: GenerationContext) {
  return responses.toolCalls(
    [
      { name: 'get_weather', arguments: { city: city(context) } },
      { name: 'search_books', arguments: { topic: bookTopic(context), limit: bookLimit(context) } },
    ],
    { chunkSize: 3 },
  );
}
/**
 * 用本轮提问或上一轮话题填充回复模板；"继续"一类短句沿用上一轮文本。
 * @param context 生成上下文，提供用户提问与历史消息。
 * @param includeExamples 是否在句尾追加 playground 示例链接。
 * @returns 回复生成器的执行结果。
 */
function reply(context: GenerationContext, includeExamples: boolean) {
  const template = replyTemplate(context);
  const generator = generators.reply({
    template: ({ text, previous }) => {
      const topic = /^(继续|换个说法)[。！!\s]*$/.test(text) && previous ? previous : text;
      const result = template.replace('{topic}', Array.from(topic).slice(0, 80).join(''));
      return includeExamples ? `${result} [查看示例](#playground-examples)` : result;
    },
  });
  return typeof generator === 'function' ? generator(context) : generator;
}
/**
 * 普通聊天回复：按模板组织，不附带示例链接。
 * @param context 生成上下文，提供用户提问与历史消息。
 * @returns 一条中文回复文本。
 */
export function chatReply(context: GenerationContext) {
  return reply(context, false);
}
/**
 * 规则未命中时的兜底回复：与普通聊天同模板，并在句尾指引示例链接。
 * @param context 生成上下文，提供用户提问与历史消息。
 * @returns 一条中文回复文本。
 */
export function fallbackReply(context: GenerationContext) {
  return reply(context, true);
}
