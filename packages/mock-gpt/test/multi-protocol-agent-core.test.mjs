import test from 'node:test';
import assert from 'node:assert/strict';
const { ModelRunner, Support } = process.env.MOCKGPT_AGENT_CORE ? await import(process.env.MOCKGPT_AGENT_CORE) : {};

const corePath = process.env.MOCKGPT_AGENT_CORE;
const peer = await import('../dist/esm/index.js');
const options = { skip: !corePath && 'Set MOCKGPT_AGENT_CORE to the optional built consumer entry' };
for (const protocol of ['chat-completions','responses','messages','generate-content','interactions']) {
for (const stream of [false, true]) {
  test(`real MockGPT.fetch integration: ${protocol} ${stream ? 'byte-fragmented SSE' : 'complete HTTP'} Unicode text`, options, async () => {
    const mock = new peer.MockGPT({ rules: [{ generator: peer.responses.text('你好🙂', { chunkSize: 1, wireChunkSize: 1 }) }] });
    const provider = Support.createModelProvider({
      protocol, baseUrl: 'https://mock.invalid/v1', apiKey: 'fixture', model: 'mock', stream, request: mock.fetch,
    });
    assert.equal((await new ModelRunner({ provider }).invoke('hello')).value, '你好🙂');
  });
}

test(`real MockGPT.fetch integration: ${protocol} one authorized tool execution and two model turns`, options, async () => {
  const mock = new peer.MockGPT({ rules: [{
    generator: ({ request }) => request.messages.some(message => message.role === 'tool')
      ? peer.responses.text('found')
      : peer.responses.toolCalls([{ name: 'lookup', arguments: { q: 'x' } }]),
  }] });
  const provider = Support.createModelProvider({ protocol, baseUrl: 'https://mock.invalid/v1', apiKey: 'fixture', model: 'mock', request: mock.fetch });
  const execution = { signal: new AbortController().signal };
  let executions = 0, authorizations = 0;
  const catalog = Support.defineToolCatalog([{
    id: 'lookup', description: 'Read a synthetic value', kind: 'read',
    inputSchema: { jsonSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] }, parse(value) {
      if (value?.q !== 'x') throw new TypeError('Expected synthetic query');
      return value;
    } },
    authorize(_input, context) { assert.equal(context.app.subject, 'synthetic-reader'); authorizations++; },
    execute() { executions++; return 'found'; },
    parseOutput(value) { assert.equal(value, 'found'); return value; },
  }]);
  const tools = catalog.bind({ app: { subject: 'synthetic-reader' }, execution });
  const transport = Support.createModelTransport({ id: 'session', response: 'session', tools: tools.tools });
  const runner = new ModelRunner({ provider, transports: [transport], maxCalls: 2 }).bind(execution);
  const first = await runner.invoke({ input: 'find x', transport });
  assert.equal(first.value.calls.length, 1);
  const call = first.value.calls[0];
  const result = await tools.invoke(call);
  const second = await runner.invoke({ input: [
    { role: 'user', content: 'find x' },
    { role: 'assistant', content: '', toolCalls: [{ id: call.id, name: call.name, arguments: call.arguments }] },
    { role: 'tool', content: result.value, toolCallId: call.id },
  ], transport });
  assert.equal(second.value.text, 'found');
  assert.equal(executions, 1);
  assert.equal(authorizations, 1);
  assert.equal(runner.totalCallCount, 2);
});


}

for (const protocol of ['chat-completions','responses','messages','generate-content','interactions']) {
  test(`${protocol}: ToolRuntime rejects initial denial and revocation without side effects`, options, async () => {
    const mock = new peer.MockGPT({rules:[{generator:peer.responses.toolCalls([{name:'lookup',arguments:{q:'x'}}])}]});
    const provider = Support.createModelProvider({protocol,baseUrl:'https://mock.invalid/v1',apiKey:'fixture',model:'mock',request:mock.fetch});
    let allowed=false, executions=0, checks=0;
    const execution={signal:new AbortController().signal};
    const catalog=Support.defineToolCatalog([{id:'lookup',description:'Synthetic',kind:'read',inputSchema:{jsonSchema:{type:'object',properties:{q:{type:'string'}}},parse:x=>x},authorize(){checks++;if(!allowed)throw Error('revoked');},execute(){executions++;return 'found';},parseOutput:x=>x}]);
    const tools=catalog.bind({app:{},execution});
    const transport=Support.createModelTransport({id:'session',response:'session',tools:tools.tools});
    const runner=new ModelRunner({provider,transports:[transport],maxCalls:2}).bind(execution);
    const first=await runner.invoke({input:'find',transport});
    await assert.rejects(tools.invoke(first.value.calls[0]),/revoked/);
    assert.equal(executions,0);
    allowed=true;await tools.invoke(first.value.calls[0]);assert.equal(executions,1);
    const second=await runner.invoke({input:'find again',transport});
    allowed=false;await assert.rejects(tools.invoke(second.value.calls[0]),/revoked/);
    assert.equal(executions,1);assert.equal(checks,3);assert.deepEqual(tools.events.map(e=>e.status),['error','success','error']);assert.equal(new Set(tools.events.map(e=>e.invocationId)).size,3);assert.equal(runner.totalCallCount,2);assert.equal(mock.records.length,2);
    assert.ok(mock.records.every(x=>x.status==='completed'));
  });
  test(`${protocol}: public Runner continuation cannot cross scope or history`,options,async()=>{
    const mock=new peer.MockGPT({rules:[{generator:peer.responses.text('answer')}]});
    const make=scope=>Support.createModelProvider({protocol,baseUrl:'https://mock.invalid/v1',apiKey:'fixture',model:'mock',scope,request:mock.fetch});
    let continuation;
    const invoke = (provider,input,settings) => { const transport=Support.createModelTransport({id:'session',response:'session',tools:[],options:settings});return new ModelRunner({provider,transports:[transport]}).invoke({input,transport}); };
    await invoke(make('owner:a'),'hello',{onContinuation:x=>continuation=x});
    assert.ok(continuation);
    const history=[{role:'user',content:'hello'},{role:'assistant',content:'answer'},{role:'user',content:'next'}];
    await assert.rejects(invoke(make('owner:b'),history,{continuation}),/scope/i);
    assert.equal(mock.records.length,1);
    await assert.rejects(invoke(make('owner:a'),[{role:'user',content:'changed'},{role:'assistant',content:'different'},{role:'user',content:'next'}],{continuation}),/history|anchor|continuation/i);
    assert.equal(mock.records.length,1);
    await invoke(make('owner:a'),history,{continuation});
    assert.equal(mock.records.length,2);
    assert.equal(JSON.stringify(mock.records).includes('owner:a'),false);
  });
}

for(const protocol of ['openai-realtime','gemini-live'])for(const wire of ['duplex','ws'])test(`public Core ${protocol} over actual MockGPT ${wire}: two turns, revoke and release`,{...options,timeout:5000},async()=>{
  const mock=new peer.MockGPT({rules:[{generator:peer.responses.text('round')}]});
  let server;
  const execution={signal:new AbortController().signal};
  const runner=new ModelRunner({provider:Support.createModelProvider({protocol:'responses',model:'mock',apiKey:'fixture',baseUrl:'https://mock.invalid/v1',request:mock.fetch}),maxCalls:3}).bind(execution);
  let allowed=true,authorized=0;
  let connect=async()=>peer.createMockDuplex(mock,{protocol});
  if(wire==='ws'){
    const {createMockWebSocketServer}=await import('../dist/esm/node/websocket.js');
    const {WebSocket}=await import('ws');
    server=await createMockWebSocketServer(mock,{protocol});
    connect=context=>Support.connectModelWebSocket(server.url,context,{create:url=>new WebSocket(url),maxQueuedFrames:64,maxBufferedBytes:100000,maxFrameChars:100000});
  }
  let session;
  try{
    session=await Support.openProtocolRealtime({protocol,setup:{model:'mock'},connect},{run:runner.runOperation.bind(runner),maxFrames:40,maxFrameChars:100000,authorize(){authorized++;if(!allowed)throw Error('revoked');}});
    const events=session.events()[Symbol.asyncIterator]();
    for(let turn=0;turn<2;turn++){
      await session.text(`turn ${turn}`);
      const received=[];
      for(;;){const {value}=await events.next();received.push(value);if(value.type==='completed')break;}
      assert.equal(received.filter(e=>e.type==='text').map(e=>e.text).join(''),'round');
      assert.ok(received.every(e=>e.generation===session.generation));
    }
    assert.equal(runner.totalCallCount,2);assert.equal(mock.records.length,2);
    allowed=false;await assert.rejects(session.text('denied'),/revoked/);
    assert.equal(mock.records.length,2);assert.equal(runner.totalCallCount,2);assert.ok(authorized>=4);
  }finally{allowed=true;await session?.close();await server?.close();}
  assert.equal(mock.stats.activeConnections,0);assert.equal(mock.activeRequests,0);
});
for (const protocol of ['openai-realtime', 'gemini-live']) {
  for (const wire of ['duplex', 'ws']) {
    test(`public Core ${protocol} over actual MockGPT ${wire}: authorized tool result reaches final reply`,
      { ...options, timeout: 5000 }, async () => {
        const mock = new peer.MockGPT({ rules: [
          { times: 1, generator: peer.responses.toolCalls([
            { id: 'call-1', name: 'lookup', arguments: { q: 'x' } },
          ]) },
          { generator: ({ request }) => {
            assert.equal(request.messages.filter(message => message.role === 'user').length, 1);
            const results = request.messages.filter(message => message.role === 'tool');
            assert.equal(results.length, 1);
            assert.equal(results[0].tool_call_id, 'call-1');
            assert.match(results[0].content, /found/);
            return peer.responses.text('lookup complete');
          } },
        ] });
        const execution = { signal: new AbortController().signal };
        let executions = 0;
        let allowed = true;
        const catalog = Support.defineToolCatalog([{
          id: 'lookup',
          description: 'Synthetic',
          kind: 'read',
          inputSchema: {
            jsonSchema: { type: 'object', properties: { q: { type: 'string' } } },
            parse: value => value,
          },
          authorize() { if (!allowed) throw Error('revoked'); },
          execute() { executions++; return 'found'; },
          parseOutput: value => value,
        }]);
        const tools = catalog.bind({ app: {}, execution });
        const runner = new ModelRunner({
          provider: Support.createModelProvider({
            protocol: 'responses', model: 'mock', apiKey: 'fixture',
            baseUrl: 'https://mock.invalid/v1', request: mock.fetch,
          }),
          maxCalls: 2,
        }).bind(execution);
        const frames = [];
        let server;
        let session;
        try {
          let open = async () => peer.createMockDuplex(mock, { protocol });
          if (wire === 'ws') {
            const { createMockWebSocketServer } = await import('../dist/esm/node.js');
            const { WebSocket } = await import('ws');
            server = await createMockWebSocketServer(mock, { protocol });
            open = context => Support.connectModelWebSocket(server.url, context, {
              create: url => new WebSocket(url), maxQueuedFrames: 64,
              maxBufferedBytes: 100000, maxFrameChars: 100000,
            });
          }
          session = await Support.openProtocolRealtime({
            protocol, setup: { model: 'mock' },
            connect: async context => {
              const duplex = await open(context);
              return {
                frames: duplex.frames,
                close: () => duplex.close(),
                send(frame, signal) {
                  frames.push(frame);
                  return duplex.send(frame, signal);
                },
              };
            },
          }, { run: runner.runOperation.bind(runner), maxFrames: 40, maxFrameChars: 100000, authorize() {} });
          await session.text('lookup');
          let proposal;
          let historyResult;
          let reply = '';
          let waits = 0;
          for await (const event of session.events()) {
            if (event.type === 'tool') {
              assert.equal(proposal, undefined);
              proposal = event;
              const call = { toolId: proposal.name, input: JSON.parse(proposal.arguments) };
              allowed = false;
              await assert.rejects(tools.invoke(call), /revoked/);
              assert.equal(executions, 0);
              allowed = true;
              historyResult = (await tools.invoke(call)).value;
              await session.tool(proposal.id, proposal.name, historyResult, proposal.generation);
            }
            if (event.type === 'tool-wait') waits++;
            if (event.type === 'text') reply += event.text;
            if (event.type === 'completed') {
              assert.equal(reply, 'lookup complete');
              await assert.rejects(session.tool(proposal.id, proposal.name, historyResult, proposal.generation), /generation|proposal/);
              break;
            }
          }
          assert.ok(proposal);
          assert.equal(reply, 'lookup complete');
          assert.equal(waits, 1);
          assert.equal(executions, 1);
          assert.deepEqual(tools.events.map(event => event.status), ['error', 'success']);
          assert.equal(mock.records.length, 2);
          assert.equal(runner.totalCallCount, 2);
          if (protocol === 'openai-realtime') {
            const starts = frames.flatMap((frame, index) => frame.type === 'response.create' ? [index] : []);
            const output = frames.findIndex(frame => frame.item?.type === 'function_call_output');
            assert.equal(starts.length, 2);
            assert.ok(starts[0] < output && output < starts[1]);
          } else {
            assert.equal(frames.filter(frame => frame.toolResponse).length, 1);
            assert.equal(frames.filter(frame => frame.clientContent || frame.realtimeInput?.text).length, 1);
          }
        } finally {
          await session?.close();
          await server?.close();
        }
        assert.equal(mock.stats.activeConnections, 0);
      });
  }
}


for(const protocol of ['chat-completions','responses','messages','generate-content','interactions'])for(const stream of [false,true])test(`${protocol} JSON/schema public transport ${stream?'SSE':'HTTP'} validates success and rejects invalid value`,options,async()=>{
  const schema={jsonSchema:{type:'object',properties:{count:{type:'integer'}},required:['count'],additionalProperties:false},parse(value){if(!value||typeof value!=='object'||!Number.isInteger(value.count)||Object.keys(value).length!==1)throw Error('count schema rejected');return value;}};
  const mock=new peer.MockGPT({rules:[{times:1,generator:peer.responses.text('{"count":2}',{wireChunkSize:1})},{times:1,generator:peer.responses.text('{"count":"wrong"}',{wireChunkSize:1})},{generator:peer.responses.text('{broken',{wireChunkSize:1})}]});
  const provider=Support.createModelProvider({protocol,baseUrl:'https://mock.invalid/v1',apiKey:'fixture',model:'mock',stream,request:mock.fetch});
  const transport=Support.createJsonTransport({id:'json',outputSchema:schema});
  const runner=new ModelRunner({provider,transports:[transport],maxCalls:3}).bind({signal:new AbortController().signal});
  assert.deepEqual((await runner.invoke({input:'count',transport})).value,{count:2});
  await assert.rejects(runner.invoke({input:'invalid shape',transport}),/count schema rejected/);
  await assert.rejects(runner.invoke({input:'invalid json',transport}),/JSON|validation/i);
  assert.equal(mock.records.length,3);assert.equal(runner.totalCallCount,3);
});

for(const [protocol,hostedTools] of [
  ['responses',[{type:'web_search'}]],
  ['messages',[{type:'web_search_20250305',name:'web_search',max_uses:1}]],
  ['interactions',[{type:'google_search'}]],
])for(const stream of [false,true])test(`${protocol} public hosted search ${stream?'SSE':'HTTP'} authorization and private observations`,options,async()=>{
  const query='private-query-canary';const url='https://source.invalid/private-canary';
  const mock=new peer.MockGPT({rules:[{generator:peer.responses.scenario({items:[{type:'search',query,sources:[{url,title:'Synthetic'}]},{type:'text',text:'answer'}],wireChunkSize:1})}]});
  const execution={signal:new AbortController().signal};let localExecutions=0,allowed=true,authorizations=0;
  const tools=Support.defineToolCatalog([{id:'lookup',kind:'read',description:'Synthetic',inputSchema:{jsonSchema:{type:'object'},parse:x=>x},authorize(){},execute(){localExecutions++;return 'unused';},parseOutput:x=>x}]).bind({app:{},execution});
  const observations=[];
  const provider=Support.createModelProvider({protocol,baseUrl:'https://mock.invalid/v1',apiKey:'fixture',model:'mock',scope:'search-owner',stream,request:mock.fetch,hostedTools,authorizeHostedTools(){authorizations++;return allowed;},onHostedToolEvent:event=>observations.push(event)});
  const transport=Support.createModelTransport({id:'session',response:'session',tools:tools.tools});
  const runner=new ModelRunner({provider,transports:[transport],maxCalls:3}).bind(execution);
  const result=await runner.invoke({input:'search synthetic',transport});
  assert.equal(result.value.text,'answer');assert.deepEqual(result.value.calls,[]);
  assert.ok(observations.length>0);assert.ok(observations.every(e=>e.source==='provider'));assert.ok(observations.some(e=>e.phase==='completed'));assert.ok(JSON.stringify(observations).includes(url));
  assert.equal(localExecutions,0);assert.deepEqual(tools.events,[]);
  assert.equal(JSON.stringify(result.value).includes(query),false);assert.equal(JSON.stringify(result.value).includes(url),false);
  assert.equal(JSON.stringify(mock.records).includes(query),false);assert.equal(JSON.stringify(mock.records).includes(url),false);
  allowed=false;await assert.rejects(runner.invoke({input:'denied',transport}),/denied|authorization/i);
  assert.equal(mock.records.length,1);assert.equal(authorizations,2);assert.equal(localExecutions,0);assert.deepEqual(tools.events,[]);
});

for(const protocol of ['messages','generate-content','interactions'])for(const stream of [false,true])test(`${protocol} public continuation ${stream?'SSE':'HTTP'} preserves signature and ordered input references`,options,async()=>{
  const signature='opaque-signature-canary';const uri='https://media.invalid/synthetic.png';
  let calls=0;
  const mock=new peer.MockGPT({rules:[{generator:context=>{
    calls++;assert.equal(context.prompt.includes(signature),false);
    const native=JSON.stringify(context.request.native);
    if(calls===1){const a=native.indexOf('ordered-before');const b=native.indexOf(uri);const c=native.indexOf('ordered-after');assert.ok(a>=0&&b>a&&c>b);return peer.responses.scenario({items:[{type:'thinking',text:'private-summary',signature},{type:'text',text:'visible'}],wireChunkSize:1});}
    assert.ok(native.includes(signature),'opaque signature replayed in native request');return peer.responses.text('continued');
  }}]});
  const provider=Support.createModelProvider({protocol,baseUrl:'https://mock.invalid/v1',apiKey:'fixture',model:'mock',scope:'signed-owner',stream,request:mock.fetch});
  const initial={role:'user',content:'',parts:[{type:'text',text:'ordered-before'},{type:'image',url:uri,mimeType:'image/png'},{type:'text',text:'ordered-after'}]};
  let continuation;
  const invoke=async(input,settings)=>{const transport=Support.createModelTransport({id:'signed',response:'session',tools:[],options:settings});return new ModelRunner({provider,transports:[transport]}).invoke({input,transport});};
  const first=await invoke([initial],{onContinuation:value=>continuation=value});
  assert.equal(first.value.text,'visible');assert.ok(continuation);assert.ok(JSON.stringify(continuation).includes(signature));
  const second=await invoke([initial,{role:'assistant',content:'visible'},{role:'user',content:'continue'}],{continuation});
  assert.equal(second.value.text,'continued');assert.equal(calls,2);
  assert.equal(JSON.stringify(mock.records).includes(signature),false);assert.equal(JSON.stringify([first.value,second.value]).includes(signature),false);
});
