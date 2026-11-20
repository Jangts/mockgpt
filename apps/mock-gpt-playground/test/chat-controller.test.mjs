/**
 * 覆盖 ChatController 的会话状态边界：完成时刻的停止、完成后的迟到分片、
 * 流式更新触发 Lit 重新渲染，以及用户取消时保留可见的停止提示。
 * 请求实现由桩函数注入，不启动浏览器或真实网络。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatController } from '../src/chat-controller.ts';

test('a stop at the completion boundary cannot add a successful round to history', async () => {
  let chat,
    first = true;
  const request = async (history, _stream, _signal, consume) => {
    if (first) {
      first = false;
      // 收到首个分片后立即停止，模拟完成边界附近的竞态。
      consume({ choices: [{ delta: { content: 'partial' } }] });
      chat.stop();
    } else {
      // 被取消的轮次不能进入下一次请求的历史。
      assert.deepEqual(
        history.map((item) => item.content),
        ['new question'],
      );
      consume({ choices: [{ delta: { content: 'new answer' } }] });
    }
  };
  chat = new ChatController({ addController() {}, requestUpdate() {} }, request);
  assert.equal(await chat.send('cancelled question'), false);
  assert.equal(chat.messages.at(-1).state, 'cancelled');
  assert.equal(chat.messages.at(-1).complete, false);
  assert.equal(await chat.send('new question'), true);
});
test('late chunks after completion cannot rewrite a previous reply', async () => {
  let consume,
    updates = 0;
  const chat = new ChatController(
    {
      addController() {},
      requestUpdate() {
        updates++;
      },
    },
    async (_history, _stream, _signal, callback) => {
      consume = callback;
      callback({ choices: [{ delta: { content: 'finished' } }] });
    },
  );
  await chat.send('hello');
  const before = updates;
  // 结束后的分片应被丢弃，既不改正文也不触发宿主更新。
  consume({ choices: [{ delta: { content: 'late mutation' } }] });
  assert.equal(chat.messages.at(-1).content, 'finished');
  assert.equal(updates, before);
});

test('stream updates publish new message arrays so Lit child components keep updating', async (t) => {
  const request = async (_messages, _stream, _signal, consume) => {
    consume({ choices: [{ delta: { content: '第一段' } }] });
    consume({ choices: [{ delta: { content: '第二段' } }] });
    consume({ choices: [{ delta: {}, finish_reason: 'stop' }] });
  };
  const snapshots = [];
  let chat;
  const host = {
    addController() {},
    requestUpdate() {
      snapshots.push({ messages: chat.messages, content: chat.messages.at(-1)?.content });
    },
  };
  chat = new ChatController(host, request);
  assert.equal(await chat.send('你好'), true);
  const first = snapshots.find((item) => item.content === '第一段');
  const second = snapshots.find((item) => item.content === '第一段第二段');
  assert.ok(first && second);
  // Lit 依靠引用变化感知更新，因此每次流式增量都必须换新数组。
  assert.notEqual(first.messages, second.messages);
  assert.equal(chat.messages.at(-1).complete, true);
  assert.equal(chat.busy, false);
  assert.equal(chat.messages.at(-1).state, 'complete');
});

test('stopping a reply exits the generating state and preserves a visible cancellation result', async (t) => {
  const request = async (_messages, _stream, signal) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  const chat = new ChatController({ addController() {}, requestUpdate() {} }, request);
  // 请求一直挂起，只有 abort 才能让它结束。
  const pending = chat.send('慢速长文');
  chat.stop();
  assert.equal(await pending, false);
  assert.equal(chat.busy, false);
  assert.equal(chat.messages.at(-1).state, 'cancelled');
  assert.match(chat.messages.at(-1).content, /已停止/);
});
