/** Offline wire contracts plus actual loopback WS; no models, SDP, devices or media codecs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MockGPT, responses } from '../dist/esm/index.js';
import { createMockDuplex } from '../dist/esm/realtime/duplex.js';
import { bindMockDataChannel } from '../dist/esm/realtime/datachannel.js';
import { createMockWebSocketServer } from '../dist/esm/node/websocket.js';
import { WebSocket } from 'ws';
const abort = () => new AbortController().signal;
async function next(iterator) {
  return (await iterator.next()).value;
}
for (const protocol of ['openai-realtime','gemini-live']) {
  const oa = protocol === 'openai-realtime';
  const setup = oa ? {type:'session.update',session:{model:'mock'}} : {setup:{model:'mock'}};
  const input = (text) => oa ? {type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text}]}} : {clientContent:{turns:[{role:'user',parts:[{text}]}],turnComplete:false}};
  const start = oa ? {type:'response.create'} : {clientContent:{turnComplete:true}};
  const terminal = (frame) => oa ? frame.type === 'response.done' : frame.serverContent?.turnComplete;
  test(`${protocol}: setup, two turns, native tool correlation and close`,async () => {
    const mock = new MockGPT({rules:[{times:1,generator:responses.toolCalls([{id:'call-1',name:'lookup',arguments:{id:1}}])},{generator:responses.text('done')}]});
    const duplex = createMockDuplex(mock,{protocol});
    const iterator = duplex.frames[Symbol.asyncIterator]();
    await duplex.send(setup,abort());
    assert.ok(oa ? (await next(iterator)).type === 'session.updated' : (await next(iterator)).setupComplete);
    await duplex.send(input('hello'));await duplex.send(start);
    let frames = [];for (;;) {const frame = await next(iterator);frames.push(frame);if (terminal(frame) || (!oa && frame.toolCall)) break;}
    assert.ok(oa ? frames.some(f=>f.type === 'response.function_call_arguments.done' && f.call_id === 'call-1') : frames.some(f=>f.toolCall?.functionCalls[0].id === 'call-1'));
    const count = mock.records.length;
    await duplex.send(oa ? {type:'conversation.item.create',item:{type:'function_call_output',call_id:'call-1',output:'{}'}} : {toolResponse:{functionResponses:[{id:'call-1',name:'lookup',response:{}}]}});
    if (oa) {
      assert.equal(mock.records.length,count);
      await duplex.send(start);
    }
    frames=[];for (;;) {const frame=await next(iterator);frames.push(frame);if (terminal(frame))break;}
    assert.ok(oa ? frames.some(f=>f.type==='response.output_text.delta'&&f.delta==='done') : frames.some(f=>f.serverContent?.modelTurn?.parts[0].text==='done'));
    assert.equal(mock.records.length,2);duplex.close();assert.equal(duplex.closed,true);assert.equal((await iterator.next()).done,true);
  });
  test(`${protocol}: interrupt suppresses delayed old generation`,async () => {
    let release;
    const mock = new MockGPT({rules:[{times:1,generator:()=>new Promise(resolve=>{release=resolve;})},{generator:responses.text('new')}]});
    const duplex=createMockDuplex(mock,{protocol});const iterator=duplex.frames[Symbol.asyncIterator]();
    await duplex.send(setup);await next(iterator);await duplex.send(input('old'));await duplex.send(start);
    while(!release) await new Promise(resolve=>setImmediate(resolve));
    await duplex.send(oa ? {type:'response.cancel'} : {realtimeInput:{activityStart:{}}});
    release(responses.text('LATE'));await duplex.send(input('new'));await duplex.send(start);
    let frames=[];for (;;) {const frame=await next(iterator);frames.push(frame);if(terminal(frame)&&(!oa||frame.response.status==='completed'))break;}
    assert.equal(JSON.stringify(frames).includes('LATE'),false);await assert.rejects(duplex.send(oa ? {type:'conversation.item.create',item:{type:'function_call_output',call_id:'old',output:'{}'}} : {toolResponse:{functionResponses:[{id:'old',response:{}}]}}),/Unknown/);
    duplex.close();
  });
  test(`${protocol}: real WebSocket native frames and outbound bound`,async () => {
    const mock=new MockGPT({rules:[{generator:responses.text('socket')}]});
    const server=await createMockWebSocketServer(mock,{protocol});
    const socket=new WebSocket(server.url);const messages=[];let wake;
    socket.on('message',data=>{messages.push(JSON.parse(data.toString()));wake?.();});
    try {
      await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
      socket.send(JSON.stringify(setup));socket.send(JSON.stringify(input('hi')));socket.send(JSON.stringify(start));
      while(!messages.some(terminal)) await new Promise(resolve=>{wake=resolve;});
      assert.ok(JSON.stringify(messages).includes('socket'));assert.equal(mock.records.length,1);
    }finally{socket.terminate();await server.close();}
    const bounded=await createMockWebSocketServer(mock,{protocol,maxBufferedBytes:1});const slow=new WebSocket(bounded.url);
    try{await new Promise(resolve=>slow.once('open',resolve));const closed=new Promise(resolve=>slow.once('close',resolve));slow.send(JSON.stringify(setup));await closed;assert.equal(mock.activeRequests,0);}finally{slow.terminate();await bounded.close();}
  });
}
test('duplex output queue bound releases connection registration',async () => {
  let active=0;
  const mock={async generate(){return responses.text('x');},registerConnection(){active++;return()=>active--;}};
  const duplex=createMockDuplex(mock,{protocol:'openai-realtime',maxQueuedFrames:1});
  await duplex.send({type:'session.update',session:{}});await duplex.send({type:'response.create'});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(duplex.closed,true);assert.equal(active,0);
  await assert.rejects(duplex.frames[Symbol.asyncIterator]().next(),/limit/);
});
test('datachannel JSON contract uses same engine and detaches listeners',async () => {
  const handlers=new Map();const frames=[];
  const channel={bufferedAmount:0,readyState:'open',send(data){frames.push(JSON.parse(data));},close(){this.readyState='closed';},addEventListener(type,fn){handlers.set(type,fn);},removeEventListener(type){handlers.delete(type);}};
  const binding=bindMockDataChannel(new MockGPT({rules:[{generator:responses.text('channel')}]}),channel,{protocol:'gemini-live'});
  handlers.get('message')({data:JSON.stringify({setup:{}})});
  handlers.get('message')({data:JSON.stringify({clientContent:{turns:[{role:'user',parts:[{text:'hi'}]}],turnComplete:true}})});
  for(let i=0;i<20&&!frames.some(f=>f.serverContent?.turnComplete);i++) await new Promise(resolve=>setImmediate(resolve));
  assert.ok(frames.some(f=>f.serverContent?.modelTurn?.parts[0].text==='channel'));binding.close();assert.equal(handlers.size,0);assert.equal(channel.readyState,'closed');
});
test('actual MockGPT connection counters protect reset and return to zero',async()=>{
  const mock=new MockGPT({rules:[{generator:responses.text('ok')}]});
  const duplex=createMockDuplex(mock,{protocol:'openai-realtime'});
  assert.equal(mock.stats.activeConnections,1);assert.throws(()=>mock.reset(),/active|pending|progress/i);
  const iterator=duplex.frames[Symbol.asyncIterator]();await duplex.send({type:'session.update',session:{}});await next(iterator);await duplex.send({type:'response.create'});
  for(;;){if((await next(iterator)).type==='response.done')break;}
  assert.equal(mock.stats.realtimeTurns,1);duplex.close();assert.equal(mock.stats.activeConnections,0);mock.reset();
});
test('actual WS rejects inbound burst above bounded pending frame queue',async()=>{
  const mock=new MockGPT({rules:[{generator:responses.text('ok')}]});
  const server=await createMockWebSocketServer(mock,{protocol:'openai-realtime',maxInboundFrames:1});
  const socket=new WebSocket(server.url);
  try{
    await new Promise(resolve=>socket.once('open',resolve));
    const closed=new Promise(resolve=>socket.once('close',resolve));
    socket._socket.cork();
    socket.send(JSON.stringify({type:'session.update',session:{}}));
    for(let i=0;i<8;i++)socket.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:'burst'}]}}));
    socket._socket.uncork();
    await closed;assert.equal(mock.stats.activeConnections,0);assert.equal(mock.records.length,0);
  }finally{socket.terminate();await server.close();}
});
for(const protocol of ['openai-realtime','gemini-live'])test(`${protocol}: synthetic audio bytes are buffered without generation until commit`,async()=>{
  const oa=protocol==='openai-realtime';
  const mock=new MockGPT({rules:[{generator:ctx=>{assert.equal(ctx.request.messages[0].content[0].input_audio.data,'AAAA');return responses.text('synthetic');}}]});
  const duplex=createMockDuplex(mock,{protocol,maxAudioBytes:8});const iterator=duplex.frames[Symbol.asyncIterator]();
  await duplex.send(oa?{type:'session.update',session:{}}:{setup:{}});await next(iterator);
  await duplex.send(oa?{type:'input_audio_buffer.append',audio:'AAAA'}:{realtimeInput:{audio:{data:'AAAA',mimeType:'audio/pcm'}}});assert.equal(mock.records.length,0);
  await duplex.send(oa?{type:'input_audio_buffer.commit'}:{realtimeInput:{activityEnd:{}}});
  if(oa){assert.equal(mock.records.length,0);await duplex.send({type:'response.create'});}
  for(;;){const frame=await next(iterator);if(oa?frame.type==='response.done':frame.serverContent?.turnComplete)break;}
  assert.equal(mock.records.length,1);duplex.close();
});

test('Live resumes the same turn only after all blocking results arrive', { timeout: 3000 }, async () => {
  const mock = new MockGPT({ rules: [
    { times: 1, generator: responses.toolCalls([
      { id: 'one', name: 'lookup', arguments: {} },
      { id: 'two', name: 'lookup', arguments: {} },
    ]) },
    { generator: ({ request }) => {
      const results = request.messages.filter(message => message.role === 'tool');
      assert.deepEqual(results.map(message => message.tool_call_id), ['two', 'one']);
      return responses.text('both results received');
    } },
  ] });
  const duplex = createMockDuplex(mock, { protocol: 'gemini-live' });
  try {
    const iterator = duplex.frames[Symbol.asyncIterator]();
    const item = id => ({ id, name: 'lookup', response: { ok: true } });
    const send = (...functionResponses) => duplex.send({ toolResponse: { functionResponses } });
    await duplex.send({ setup: { model: 'mock' } });
    assert.ok((await next(iterator)).setupComplete);
    await duplex.send({ clientContent: { turns: [{ role: 'user', parts: [{ text: 'lookup' }] }], turnComplete: true } });
    const proposal = await next(iterator);
    assert.deepEqual(proposal.toolCall.functionCalls.map(call => call.id), ['one', 'two']);
    const generation = duplex.generation;
    await assert.rejects(send(item('two'), item('missing')), /Unknown/);
    await send(item('two'));
    assert.equal(mock.records.length, 1);
    await send(item('one'));
    assert.equal((await next(iterator)).serverContent.modelTurn.parts[0].text, 'both results received');
    assert.equal((await next(iterator)).serverContent.turnComplete, true);
    assert.equal(duplex.generation, generation);
    assert.equal(mock.records.length, 2);
    await assert.rejects(send(item('one')), /Unknown/);
    assert.equal(mock.records.length, 2);
  } finally {
    duplex.close();
  }
});

test('Live tool result continues through a real WebSocket without a new user frame', { timeout: 3000 }, async () => {
  const mock = new MockGPT({ rules: [
    { times: 1, generator: responses.toolCalls([{ id: 'lookup-1', name: 'lookup', arguments: {} }]) },
    { when: request => request.messages.some(message => message.role === 'tool' && message.content === '{"value":"42"}'),
      generator: responses.text('found 42') },
  ] });
  const server = await createMockWebSocketServer(mock, { protocol: 'gemini-live' });
  const socket = new WebSocket(server.url);
  try {
    const frames = [];
    const final = new Promise((resolve, reject) => {
      socket.once('error', reject);
      socket.once('close', () => reject(new Error('Socket closed before the final reply')));
      socket.on('open', () => socket.send(JSON.stringify({ setup: { model: 'mock' } })));
      socket.on('message', raw => {
        const frame = JSON.parse(raw.toString());
        frames.push(frame);
        if (frame.setupComplete) {
          socket.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: 'lookup' }] }], turnComplete: true } }));
        } else if (frame.toolCall) {
          const { id, name } = frame.toolCall.functionCalls[0];
          socket.send(JSON.stringify({ toolResponse: { functionResponses: [{ id, name, response: { value: '42' } }] } }));
        } else if (frame.serverContent?.turnComplete) resolve();
      });
    });
    await final;
    assert.deepEqual(frames.map(frame => Object.keys(frame)[0]), ['setupComplete', 'toolCall', 'serverContent', 'serverContent']);
    assert.equal(frames[2].serverContent.modelTurn.parts[0].text, 'found 42');
    assert.equal(mock.records.length, 2);
  } finally {
    socket.terminate();
    await server.close();
  }
});
