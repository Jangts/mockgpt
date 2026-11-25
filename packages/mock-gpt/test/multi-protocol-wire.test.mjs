/** Native assertions from OpenAI Responses streaming-events and Claude streaming docs,
 * checked 2026-11-25. No Agent Core decoder is used. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MockGPT, responses, findProtocol, protocolCatalog } from '../dist/esm/index.js';
const items = [{ type: 'text', text: '你好🙂' }, { type: 'function-call', id: 'stable', name: 'lookup', arguments: { city: '武汉' } }];
async function call(protocol, stream, extra = {}) {
  const mock = new MockGPT({ rules: [{ generator: responses.scenario({ items, chunkSize: 1, wireChunkSize: 1, ...extra }) }] });
  const body = { model: 'mock', stream, ...(protocol === 'responses' ? { input: 'hello' } : { messages: [{ role: 'user', content: 'hello' }], max_tokens: 128 }) };
  const response = await mock.fetch(`https://mock.invalid/v1/${protocol}`, { method: 'POST', body: JSON.stringify(body) });
  assert.equal(response.status, 200); return { mock, response };
}
function frames(text) { return text.trim().split('\n\n').map(frame => { const lines = frame.split('\n'); const data = JSON.parse(lines.find(line => line.startsWith('data: ')).slice(6)); assert.equal(lines[0], `event: ${data.type}`); return data; }); }
for (const protocol of ['responses','messages']) {
  test(`${protocol} HTTP has native text, tool identity and terminal`, async () => {
    const { mock, response } = await call(protocol, false); const body = await response.json();
    if (protocol === 'responses') { assert.equal(body.object, 'response'); assert.equal(body.status, 'completed'); assert.equal(body.output[0].content[0].text, '你好🙂'); assert.equal(body.output[1].call_id, 'stable'); assert.deepEqual(JSON.parse(body.output[1].arguments), { city: '武汉' }); }
    else { assert.equal(body.type, 'message'); assert.equal(body.stop_reason, 'tool_use'); assert.equal(body.content[0].text, '你好🙂'); assert.deepEqual(body.content[1], { type: 'tool_use', id: 'stable', name: 'lookup', input: { city: '武汉' } }); }
    assert.equal(mock.records[0].status, 'completed');
  });
  test(`${protocol} one-byte SSE reconstructs Unicode and native tool arguments`, async () => {
    const { mock, response } = await call(protocol, true); const events = frames(await response.text());
    if (protocol === 'responses') {
      assert.equal(events[0].type, 'response.created'); assert.equal(events.at(-1).type, 'response.completed'); assert.deepEqual(events.map(item => item.sequence_number), events.map((_, index) => index));
      assert.equal(events.filter(item => item.type === 'response.output_text.delta').map(item => item.delta).join(''), '你好🙂'); assert.deepEqual(JSON.parse(events.filter(item => item.type === 'response.function_call_arguments.delta').map(item => item.delta).join('')), { city: '武汉' });
    } else {
      assert.equal(events[0].type, 'message_start'); assert.equal(events.at(-1).type, 'message_stop'); assert.deepEqual(events.filter(item => item.type === 'content_block_stop').map(item => item.index), [0,1]);
      assert.equal(events.filter(item => item.delta?.type === 'text_delta').map(item => item.delta.text).join(''), '你好🙂'); assert.deepEqual(JSON.parse(events.filter(item => item.delta?.type === 'input_json_delta').map(item => item.delta.partial_json).join('')), { city: '武汉' });
    }
    assert.equal(mock.activeRequests, 0); assert.equal(mock.records[0].status, 'completed');
  });
  test(`${protocol} interruption is error and cancellation permits reset`, async () => {
    const fault = await call(protocol, true, { interruptAfter: 1 }); await assert.rejects(fault.response.text()); assert.equal(fault.mock.records[0].status, 'error');
    const normal = await call(protocol, true); const reader = normal.response.body.getReader(); await reader.read(); await reader.cancel(); assert.equal(normal.mock.records[0].status, 'cancelled'); assert.equal(normal.mock.activeRequests, 0); normal.mock.reset();
  });
}
test('Messages signature travels in its own delta and stays out of records', async () => {
  const { mock, response } = await call('messages', true, { items: [{ type: 'thinking', text: 'private', signature: 'opaque-signature' }, ...items] });
  const events = frames(await response.text()); const signatureIndex = events.findIndex(item => item.delta?.type === 'signature_delta');
  assert.equal(events[signatureIndex].delta.signature, 'opaque-signature'); assert.equal(events[signatureIndex + 1].type, 'content_block_stop');
  assert.equal(events[signatureIndex + 1].index, 0); assert.ok(!JSON.stringify(mock.records).includes('opaque-signature'));
});
for (const [protocol, path, input] of [
  ['generateContent', '/v1beta/models/mock:generateContent', { contents: [{ role: 'user', parts: [{ text: 'hello' }] }] }],
  ['interactions', '/v1beta/interactions', { model: 'mock', input: 'hello' }],
]) for (const stream of [false, true]) test(`${protocol} native ${stream ? 'SSE' : 'HTTP'} preserves signatures, functions and ordered media`, async () => {
  const mock = new MockGPT({ rules: [{ generator: responses.scenario({ items: [{ type: 'thinking', text: 'summary', signature: 'opaque' }, ...items, { type: 'media', modality: 'image', uri: 'https://example.invalid/image.png', mimeType: 'image/png' }], wireChunkSize: 1 }) }] });
  const response = await mock.fetch(`https://mock.invalid${stream && protocol === 'generateContent' ? path.replace(':generateContent', ':streamGenerateContent') + '?alt=sse' : path}`, { method: 'POST', body: JSON.stringify({ ...input, stream }) });
  assert.equal(response.status, 200);
  if (stream) {
    const text = await response.text(); const events = text.trim().split('\n\n').map(frame => JSON.parse(frame.split('\n').find(line => line.startsWith('data: ')).slice(6)));
    if (protocol === 'generateContent') { assert.ok(!text.includes('event:')); const parts = events.flatMap(item => item.candidates[0].content.parts); assert.equal(parts[0].thoughtSignature, 'opaque'); assert.equal(parts.at(-1).fileData.fileUri, 'https://example.invalid/image.png'); assert.equal(events.at(-1).candidates[0].finishReason, 'STOP'); }
    else { assert.equal(events[0].event_type, 'interaction.created'); assert.equal(events.at(-1).event_type, 'interaction.completed'); assert.equal(events.at(-1).interaction.status, 'requires_action'); assert.ok(!('steps' in events.at(-1).interaction)); assert.ok(events.some(event => event.delta?.type === 'thought_signature')); assert.deepEqual(JSON.parse(events.filter(event => event.delta?.type === 'arguments_delta').map(event => event.delta.arguments).join('')), { city: '武汉' }); }
  } else {
    const body = await response.json(); if (protocol === 'generateContent') { assert.equal(body.candidates[0].content.parts[0].thoughtSignature, 'opaque'); assert.equal(body.candidates[0].content.parts.at(-1).fileData.fileUri, 'https://example.invalid/image.png'); }
    else { assert.equal(body.steps[0].signature, 'opaque'); assert.equal(body.steps.at(-1).content[0].uri, 'https://example.invalid/image.png'); assert.equal(body.status, 'requires_action'); }
  }
  assert.equal(mock.activeRequests, 0); assert.ok(!JSON.stringify(mock.records).includes('opaque'));
});
for (const [protocol, tool] of [['responses','web_search'],['messages','web_search_20250305'],['interactions','google_search']]) test(`${protocol} explicit provider search has native events and references`, async () => {
  const mock = new MockGPT({ rules: [{ generator: responses.scenario({ items: [{ type: 'search', query: 'test', sources: [{ url: 'https://example.invalid', title: 'Synthetic' }] }, { type: 'text', text: 'Synthetic fact' }] }) }] });
  const body = { model: 'mock', stream: true, tools: [{ type: tool }], ...(protocol === 'messages' ? { messages: [{ role: 'user', content: 'test' }], max_tokens: 128 } : { input: 'test' }) };
  const path = protocol === 'interactions' ? '/v1beta/interactions' : `/v1/${protocol}`;
  const response = await mock.fetch(`https://mock.invalid${path}`, { method: 'POST', body: JSON.stringify(body) }); const wire = await response.text();
  assert.ok(wire.includes('https://example.invalid'));
  if (protocol === 'responses') assert.ok(wire.includes('response.web_search_call.searching') && wire.includes('url_citation'));
  else if (protocol === 'messages') assert.ok(wire.includes('server_tool_use') && wire.includes('citations_delta'));
  else assert.ok(wire.includes('google_search_call') && wire.includes('google_search_result'));
  assert.equal(mock.records.length, 1); assert.equal(mock.activeRequests, 0);
});
test('Messages tool_result projects to portable tool messages without leaking thinking into prompt', async () => {
  let seen;
  const mock = new MockGPT({ rules: [{ generator: context => { seen = context; return responses.text('ok'); } }] });
  const native = [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: 'https://example.invalid/image' } }, { type: 'text', text: 'hello' }] }, { role: 'assistant', content: [{ type: 'thinking', thinking: 'secret', signature: 'opaque' }, { type: 'tool_use', id: 'stable', name: 'lookup', input: {} }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'stable', content: 'found' }] }];
  const response = await mock.fetch('https://mock.invalid/v1/messages', { method: 'POST', body: JSON.stringify({ model: 'mock', messages: native, max_tokens: 128 }) });
  assert.equal(response.status, 200); assert.equal(seen.request.toolResults.length, 1); assert.equal(seen.request.messages.at(-1).role, 'tool'); assert.equal(seen.request.messages.at(-1).tool_call_id, 'stable'); assert.deepEqual(seen.request.orderedInput, native); assert.ok(!seen.prompt.includes('secret')); assert.ok(!seen.prompt.includes('opaque'));
});
for (const protocol of ['responses','messages']) test(`${protocol} truncation has native terminal and unrepresentable media fails explicitly`, async () => {
  const truncated = await call(protocol, false, { items: [{ type: 'text', text: 'partial' }], finishReason: 'length' }); const body = await truncated.response.json();
  if (protocol === 'responses') { assert.equal(body.status, 'incomplete'); assert.equal(body.incomplete_details.reason, 'max_output_tokens'); }
  else assert.equal(body.stop_reason, 'max_tokens');
  await assert.rejects(call(protocol, false, { items: [{ type: 'media', modality: 'image', uri: 'https://example.invalid/image' }] }), { code: 'MOCK_CAPABILITY' });
});

test('Chat keeps null for tool-only replies and rejects unrepresentable ordered interleaving', async () => {
  const mock = new MockGPT({rules:[{generator:responses.toolCalls([{name:'fn',arguments:{}}])}]});
  const reply = await mock.fetch('https://mock.invalid/v1/chat/completions',{method:'POST',body:JSON.stringify({model:'m',messages:[{role:'user',content:'x'}]})});
  assert.equal((await reply.json()).choices[0].message.content,null);
  const ordered = new MockGPT({rules:[{generator:responses.scenario({items:[{type:'text',text:'A'},{type:'function-call',name:'fn',arguments:{}},{type:'text',text:'B'}]})}]});
  await assert.rejects(ordered.fetch('https://mock.invalid/v1/chat/completions',{method:'POST',body:JSON.stringify({model:'m',messages:[{role:'user',content:'x'}]})}),{code:'MOCK_CAPABILITY'});
  assert.throws(()=>responses.scenario({items:[{type:'function-call',id:'same',name:'a',arguments:{}},{type:'function-call',id:'same',name:'b',arguments:{}}]}),{code:'MOCK_CONFIG'});
});
// Official Interactions API reference checked 2026-11-25: status enumerates failed/error,
// but neither Content.refusal nor a content_filter finish reason. Generic failure is not a
// native distinguishable refusal. Both wire modes must reject instead of completing as text.
for (const stream of [false, true]) for (const outcome of ['refusal', 'content_filter']) test(`Interactions ${stream ? 'SSE' : 'HTTP'} rejects unrepresentable ${outcome} before successful encoding`, async () => {
  const scenario = outcome === 'refusal' ? { items: [{ type: 'refusal', text: 'declined' }] } : { items: [{ type: 'text', text: 'filtered' }], finishReason: 'content_filter' };
  const mock = new MockGPT({ rules: [{ generator: responses.scenario(scenario) }] });
  await assert.rejects(mock.fetch('https://mock.invalid/v1beta/interactions', { method: 'POST', body: JSON.stringify({ model: 'mock', input: 'hello', stream }) }), error => {
    assert.equal(error.code, 'MOCK_CAPABILITY'); assert.ok(error.message.includes(outcome)); return true;
  });
  assert.equal(mock.activeRequests, 0); assert.equal(mock.records[0].status, 'error');
});
// https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons
// defines refusal as the distinct native stop reason (verified 2026-11-25).
for (const stream of [false, true]) test(`Messages ${stream ? 'SSE' : 'HTTP'} maps content_filter to native refusal terminal`, async () => {
  const { mock, response } = await call('messages', stream, { items: [{ type: 'text', text: 'declined' }], finishReason: 'content_filter' });
  if (stream) {
    const events = frames(await response.text()); assert.equal(events.at(-1).type, 'message_stop');
    assert.equal(events.find(event => event.type === 'message_delta').delta.stop_reason, 'refusal');
  } else assert.equal((await response.json()).stop_reason, 'refusal');
  assert.equal(mock.activeRequests, 0); assert.equal(mock.records[0].status, 'completed');
});

test('public codec metadata cannot alter instance routing', async () => {
  const codec = findProtocol('/v1/responses');
  assert.ok(protocolCatalog.includes(codec));
  assert.throws(() => { codec.match = () => false; }, TypeError);
  assert.throws(() => codec.capabilities.push('unsupported'), TypeError);
  assert.throws(() => codec.events.pop(), TypeError);
  const mock = new MockGPT({ rules: [{ generator: 'ok' }] });
  const reply = await mock.fetch('https://mock.invalid/v1/responses', {
    method: 'POST', body: JSON.stringify({ model: 'mock', input: 'hello' }),
  });
  assert.equal(reply.status, 200);
});
