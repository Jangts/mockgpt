/**
 * 校验组合生成器的业务一致性：字段类型与范围、金额小计、推荐文案结构，
 * 以及候选池在多次调用和 reset 后的分布与可重放性。
 * 断言同时约束示例展示质量和 seed 确定性，属于场景数据回归测试。
 */
import { createPlaygroundFetch } from '../src/simulated-fetch.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockGPT } from '@jangts/mock-gpt';
import { playgroundConfig } from '../src/scenarios/playground-config.ts';

const create = () => new MockGPT({ ...playgroundConfig(), seed: 42, clock: () => 1000 });
// 走完整的 HTTP 适配层，确保断言覆盖传输后的最终正文。
const reply = async (mock, prompt) => {
  const response = await createPlaygroundFetch(mock, {
    chunkSize: 8,
    intervalMs: 0,
    wireChunkSize: 7,
  })('https://mock.invalid/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ model: 'demo', messages: [{ role: 'user', content: prompt }] }),
  });
  return (await response.json()).choices[0].message.content;
};

test('composed examples return user fields, consistent order totals and complete recommendations', async () => {
  const mock = create();
  const { users } = JSON.parse(await reply(mock, '生成用户资料'));
  assert.equal(users.length, 3);
  for (const user of users) {
    assert.match(user.id, /^user-/);
    assert.ok(user.age >= 18 && user.age <= 60);
    assert.equal(typeof user.verified, 'boolean');
    assert.ok(user.score >= 0 && user.score <= 1);
    assert.equal(user.createdAt, '1970-01-01T00:00:01.000Z');
    assert.match(user.avatar, /^data:image\/svg\+xml/);
    assert.ok(user.bio.length);
  }
  const { orders } = JSON.parse(await reply(mock, '生成订单'));
  assert.equal(orders.length, 4);
  for (const order of orders) {
    assert.equal(order.total, order.unitPrice * order.quantity);
    assert.ok(Number.isInteger(order.quantity) && order.quantity > 0);
  }
  assert.match(await reply(mock, '推荐一杯咖啡'), /^今天推荐.+参考价格为 \d+ 元/);
});

test('composed fields change across calls and replay after reset with the same seed and clock', async () => {
  // 同一 seed 下连续调用应产生新内容，reset 后才能逐字重放。
  const mock = create();
  const first = await reply(mock, '生成用户资料');
  assert.notEqual(await reply(mock, '生成用户资料'), first);
  mock.reset();
  assert.equal(await reply(mock, '生成用户资料'), first);
});

test('candidate pools give varied batches, recommendations, stories, tasks and tool arguments', async () => {
  const mock = create();
  // 多轮采样用于确认候选池足够大，避免示例内容退化成固定模板。
  const names = new Set(),
    drinks = new Set(),
    bios = new Set(),
    coffee = new Set();
  const tasks = new Set(),
    stories = new Set(),
    cities = new Set(),
    topics = new Set(),
    limits = new Set();
  for (let index = 0; index < 40; index++) {
    const users = JSON.parse(await reply(mock, '生成用户资料')).users;
    assert.equal(new Set(users.map((user) => user.name)).size, users.length);
    users.forEach((user) => {
      names.add(user.name);
      bios.add(user.bio);
    });
    const orders = JSON.parse(await reply(mock, '生成订单')).orders;
    assert.equal(new Set(orders.map((order) => order.item)).size, orders.length);
    orders.forEach((order) => {
      drinks.add(order.item);
      assert.equal(order.total, order.unitPrice * order.quantity);
    });
    const recommended = await reply(mock, '推荐一杯咖啡');
    assert.doesNotMatch(recommended, /热巧克力|抹茶拿铁|伯爵红茶|茉莉花茶|蜜桃乌龙|柠檬气泡水/);
    coffee.add(recommended.match(/^今天推荐(.+)，参考价格/)[1]);
    const list = JSON.parse(await reply(mock, '生成待办')).tasks;
    assert.equal(new Set(list.map((task) => task.title)).size, list.length);
    list.forEach((task) => {
      tasks.add(task.title);
      assert.equal(typeof task.done, 'boolean');
    });
    stories.add(await reply(mock, '讲个小故事'));
    const response = await createPlaygroundFetch(mock, {
      chunkSize: 8,
      intervalMs: 0,
      wireChunkSize: 7,
    })('https://mock.invalid/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'demo', messages: [{ role: 'user', content: '模拟双工具' }] }),
    });
    const calls = (await response.json()).choices[0].message.tool_calls;
    const weather = JSON.parse(calls[0].function.arguments),
      books = JSON.parse(calls[1].function.arguments);
    cities.add(weather.city);
    topics.add(books.topic);
    limits.add(books.limit);
  }
  for (const [name, values, minimum] of [
    ['names', names, 20],
    ['drinks', drinks, 15],
    ['bios', bios, 15],
    ['coffee', coffee, 10],
    ['tasks', tasks, 8],
    ['stories', stories, 15],
    ['cities', cities, 8],
    ['topics', topics, 6],
    ['limits', limits, 4],
  ]) {
    assert.ok(values.size >= minimum, `${name}: only ${values.size} distinct values`);
  }
});

test('varied fallback replies preserve the menu link and reproduce after reset', async () => {
  // 兜底回复同样要带示例入口链接，并在 reset 后稳定复现。
  const mock = create();
  const outputs = [];
  for (let index = 0; index < 24; index++) {
    const text = await reply(mock, '聊聊月球上的咖啡馆');
    assert.match(text, /\[查看示例\]\(#playground-examples\)/);
    outputs.push(text);
  }
  assert.ok(new Set(outputs).size >= 4);
  mock.reset();
  for (const expected of outputs) assert.equal(await reply(mock, '聊聊月球上的咖啡馆'), expected);
});
