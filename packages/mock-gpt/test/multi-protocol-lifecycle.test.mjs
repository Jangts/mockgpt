/** Lifecycle resource, race and native HTTP contracts through actual MockGPT.fetch. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MockGPT, responses } from '../dist/esm/index.js';
import { LifecycleRuntime } from '../dist/esm/lifecycle/index.js';
const request = (mock, path, body, headers = {}) => mock.fetch('https://mock.invalid' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const settleImmediateGenerators = () => new Promise(resolve => setImmediate(resolve));
const background = { model: 'mock', input: 'hello', background: true };
const setup = (extra = {}) => { let now = 0; const mock = new MockGPT({ rules: [{ generator: responses.text('answer') }], clock: () => now, lifecycle: { delayMs: 10, ...extra } }); return { mock, tick: value => { now = value; } }; };
async function file(mock, rows, scope = 'default') { const form = new FormData(); form.set('purpose', 'batch'); form.set('file', new Blob([rows.map(r => JSON.stringify(r)).join('\n')]), 'input.jsonl'); const r = await mock.fetch('https://mock.invalid/v1/files', { method: 'POST', body: form, headers: { 'x-mock-scope': scope } }); assert.equal(r.status, 200); return (await r.json()).id; }
const row = id => ({ custom_id: id, method: 'POST', url: '/v1/responses', body: { model: 'mock', input: id } });
test('background accepted once, repeated same-clock reads do not generate or complete', async () => {
  const {mock,tick} = setup(); const accepted = await (await request(mock, '/v1/responses', background)).json();
  for(let i=0;i<3;i++) assert.equal((await (await request(mock, '/v1/responses/'+accepted.id)).json()).status, 'in_progress');
  await settleImmediateGenerators();tick(10); const done = await (await request(mock, '/v1/responses/'+accepted.id)).json(); assert.equal(done.status,'completed'); assert.equal(mock.records.length,1);
  await request(mock,'/v1/responses/'+accepted.id); assert.equal(mock.records.length,1);
});
test('acknowledgement loss retains accepted task and generation, no automatic retry', async () => {
  const {mock,tick} = setup({faults:[{kind:'lose-ack'}]}); await assert.rejects(request(mock,'/v1/responses',background), {code:'MOCK_NETWORK'});
  await settleImmediateGenerators();tick(10); const result = await (await request(mock,'/v1/responses/resp-mock-1')).json(); assert.equal(result.status,'completed'); assert.equal(mock.records.length,1);
});
test('rejection before acceptance consumes no generation and creates no resource', async () => {
  const {mock} = setup({faults:[{kind:'reject-before-accept'}]}); assert.equal((await request(mock,'/v1/responses',background)).status,503); assert.equal(mock.records.length,0); assert.equal(mock.stats.activeOperations,0);
});
test('cancel before ready wins and repeated cancel generates nothing', async () => {
  const {mock,tick} = setup(); const {id} = await (await request(mock,'/v1/responses',background)).json();
  assert.equal((await (await request(mock,`/v1/responses/${id}/cancel`,{})).json()).status,'cancelled'); tick(20);
  assert.equal((await (await request(mock,`/v1/responses/${id}/cancel`,{})).json()).status,'cancelled'); assert.equal(mock.records.length,1);
});
test('completion before cancellation remains completed', async () => {
  const {mock,tick}=setup(); const {id}=await(await request(mock,'/v1/responses',background)).json();await settleImmediateGenerators();tick(10);
  assert.equal((await(await request(mock,`/v1/responses/${id}/cancel`,{})).json()).status,'completed');
});
test('scope and instance isolation reject resource access', async()=>{
  const {mock}=setup(); const {id}=await(await request(mock,'/v1/responses',background,{'x-mock-scope':'a'})).json();
  assert.equal((await request(mock,`/v1/responses/${id}`,undefined,{'x-mock-scope':'b'})).status,404);
  assert.equal((await request(setup().mock,`/v1/responses/${id}`)).status,404);
});
test('TTL expires active operation atomically and reset can clear terminal resources',async()=>{
  const {mock,tick}=setup({limits:{ttlMs:5}}); const {id}=await(await request(mock,'/v1/responses',background)).json();tick(5);
  assert.equal((await request(mock,`/v1/responses/${id}`)).status,410); assert.equal(mock.stats.activeOperations,0); mock.reset();
});
test('file expiration and scope isolation return native HTTP errors',async()=>{
  const {mock,tick}=setup({limits:{ttlMs:5}});const id=await file(mock,[row('a')],'a');
  assert.equal((await request(mock,`/v1/files/${id}/content`)).status,404);tick(5);
  const r=await request(mock,`/v1/files/${id}/content`,undefined,{'x-mock-scope':'a'});assert.equal(r.status,410);
});
test('OpenAI batch input/output files preserve stable IDs with reverse results and partial failure',async()=>{
  const {mock,tick}=setup({faults:[{kind:'reverse-results'},{kind:'fail-item',itemId:'b'}]});const input=await file(mock,[row('a'),row('b')]);
  const {id}=await(await request(mock,'/v1/batches',{input_file_id:input,endpoint:'/v1/responses',completion_window:'24h'})).json();await settleImmediateGenerators();tick(10);
  const done=await(await request(mock,`/v1/batches/${id}`)).json();assert.equal(done.status,'completed');
  const output=await(await request(mock,`/v1/files/${done.output_file_id}/content`)).text();const errors=await(await request(mock,`/v1/files/${done.error_file_id}/content`)).text();
  assert.equal(JSON.parse(output).custom_id,'a');assert.equal(JSON.parse(errors).custom_id,'b');assert.equal(mock.records.length,2);
});
test('missing and duplicate result faults retain source IDs without extra generation',async()=>{
 const {mock,tick}=setup({faults:[{kind:'missing-item',itemId:'b'},{kind:'duplicate-item',itemId:'a'}]});const input=await file(mock,[row('a'),row('b')]);const {id}=await(await request(mock,'/v1/batches',{input_file_id:input})).json();await settleImmediateGenerators();tick(10);
 const done=await(await request(mock,`/v1/batches/${id}`)).json();const rows=(await(await request(mock,`/v1/files/${done.output_file_id}/content`)).text()).split('\n').map(JSON.parse);assert.deepEqual(rows.map(r=>r.custom_id),['a','a']);assert.equal(mock.records.length,2);
});
test('Anthropic batch results use custom_id and succeeded message JSONL',async()=>{
 const {mock,tick}=setup();const {id}=await(await request(mock,'/v1/messages/batches',{requests:[{custom_id:'a',params:{model:'mock',max_tokens:10,messages:[{role:'user',content:'hello'}]}}]})).json();await settleImmediateGenerators();tick(10);
 const result=JSON.parse(await(await request(mock,`/v1/messages/batches/${id}/results`)).text());assert.equal(result.custom_id,'a');assert.equal(result.result.type,'succeeded');assert.equal(result.result.message.type,'message');
});
test('resource count and duplicate item validation precede generation',async()=>{
 const {mock}=setup({limits:{maxOperations:1}});await request(mock,'/v1/responses',background);assert.equal((await request(mock,'/v1/responses',background)).status,413);
 const other=setup().mock;const input=await file(other,[row('same'),row('same')]);assert.equal((await request(other,'/v1/batches',{input_file_id:input})).status,400);assert.equal(other.records.length,0);
});
test('pending operation prevents reset; cancellation releases it',async()=>{
 const {mock}=setup();const {id}=await(await request(mock,'/v1/responses',background)).json();assert.throws(()=>mock.reset());await request(mock,`/v1/responses/${id}/cancel`,{});mock.reset();assert.equal(mock.records.length,0);
});
test('invalid fault plans fail at construction',()=>{assert.throws(()=>setup({faults:[{kind:'missing-handler'}]}),{code:'MOCK_CONFIG'});});
test('standalone lifecycle store retains submission after caller abort without linking remote cancellation',async()=>{
 let calls=0;let now=0;const runtime=new LifecycleRuntime({clock:()=>now,options:{delayMs:1},decode:body=>({model:body.model,messages:[{role:'user',content:body.input}]}),generate:async()=>{calls++;return 'ok';},encode:(_i,value)=>Response.json({output:value})});
 const signal=new AbortController();const accepted=await runtime.handle(new Request('https://mock.invalid/v1/responses',{method:'POST',body:JSON.stringify(background),signal:signal.signal}));const {id}=await accepted.json();signal.abort();await settleImmediateGenerators();now=1;
 const result=await runtime.handle(new Request(`https://mock.invalid/v1/responses/${id}`));assert.equal((await result.json()).status,'completed');assert.equal(calls,1);
});
test('Gemini resumable file upload supports start and one finalize, metadata, download, delete', async()=>{
 const {mock}=setup();const start=await mock.fetch('https://mock.invalid/upload/v1beta/files',{method:'POST',headers:{'content-type':'application/json','x-goog-upload-command':'start','x-goog-upload-protocol':'resumable'},body:JSON.stringify({file:{display_name:'synthetic'}})});assert.equal(start.status,200);
 const upload=start.headers.get('x-goog-upload-url');assert.ok(upload);const finalized=await mock.fetch(upload,{method:'POST',headers:{'x-goog-upload-command':'upload, finalize'},body:'{"key":"a"}'});const {file:stored}=await finalized.json();assert.equal(stored.sizeBytes,'11');
 const raw=await(await request(mock,`/download/v1beta/${stored.name}:download`)).text();assert.equal(raw,'{"key":"a"}');
 assert.equal((await mock.fetch('https://mock.invalid/v1beta/'+stored.name,{method:'DELETE'})).status,200);assert.equal((await request(mock,'/v1beta/'+stored.name)).status,404);
});
test('file read count is bounded without any generation',async()=>{
 const {mock}=setup({limits:{maxReads:1}});const id=await file(mock,[row('a')]);assert.equal((await request(mock,`/v1/files/${id}/content`)).status,200);assert.equal((await request(mock,`/v1/files/${id}/content`)).status,429);assert.equal(mock.records.length,0);
});
test('invalid lifecycle fault combination rejects before generation',async()=>{
 const {mock}=setup({faults:[{kind:'reverse-results'}]});const result=await request(mock,'/v1/responses',background);assert.equal(result.status,400);assert.equal(mock.records.length,0);
});
test('OpenAI file endpoint mismatch rejects batch before generation',async()=>{
 const {mock}=setup();const id=await file(mock,[row('a')]);const result=await request(mock,'/v1/batches',{input_file_id:id,endpoint:'/v1/chat/completions'});assert.equal(result.status,400);assert.equal(mock.records.length,0);
});
test('Interactions background retains steps and usage after one generation', async () => {
  const {mock,tick}=setup();const response=await request(mock,'/v1beta/interactions',background);assert.equal(response.status,200);const {id}=await response.json();await settleImmediateGenerators();tick(10);
  const done=await(await request(mock,`/v1beta/interactions/${id}`)).json();assert.equal(done.status,'completed');assert.equal(done.steps[0].type,'model_output');assert.equal(done.steps[0].content[0].text,'answer');assert.equal(mock.records.length,1);
});
test('Gemini inline Batch returns name, native job state and stable item keys', async () => {
 const {mock,tick}=setup({faults:[{kind:'reverse-results'}]});const payload={batch:{input_config:{requests:{requests:['a','b'].map(key=>({metadata:{key},request:{contents:[{role:'user',parts:[{text:key}]}]}}))}}}};
 const response=await request(mock,'/v1beta/models/mock:batchGenerateContent',payload);assert.equal(response.status,200);const {name}=await response.json();await settleImmediateGenerators();tick(10);
 const done=await(await request(mock,'/v1beta/'+name)).json();assert.equal(done.metadata.state,'JOB_STATE_SUCCEEDED');assert.deepEqual(done.response.inlinedResponses.inlinedResponses.map(r=>r.key),['b','a']);
 const results=(await(await request(mock,'/download/v1beta/'+done.response.responsesFile+':download')).text()).split('\n').map(JSON.parse);assert.deepEqual(results.map(r=>r.key),['b','a']);assert.equal(results[0].response.candidates[0].content.parts[0].text,'answer');assert.equal(mock.records.length,2);
});
test('Gemini file input batch and native cancel use retained file key identities',async()=>{
 const {mock}=setup();const id=await file(mock,[{key:'a',request:{contents:[{role:'user',parts:[{text:'hello'}]}]}}]);const response=await request(mock,'/v1beta/models/mock:batchGenerateContent',{batch:{input_config:{file_name:'files/'+id}}});assert.equal(response.status,200);const {name}=await response.json();
 const canceled=await(await request(mock,'/v1beta/'+name+':cancel',{})).json();assert.equal(canceled.metadata.state,'JOB_STATE_CANCELLED');assert.equal(mock.records.length,1);
});
test('OpenAI Batch cancellation and pending result lookup have no extra generation',async()=>{
 const {mock}=setup();const input=await file(mock,[row('a')]);const {id}=await(await request(mock,'/v1/batches',{input_file_id:input})).json();const before=mock.records.length;
 const canceled=await(await request(mock,`/v1/batches/${id}/cancel`,{})).json();assert.equal(canceled.status,'cancelled');await request(mock,`/v1/batches/${id}`);assert.equal(mock.records.length,before);
});
test('Anthropic pending results fail explicitly and cancel completes native ended state',async()=>{
 const {mock}=setup();const {id}=await(await request(mock,'/v1/messages/batches',{requests:[{custom_id:'a',params:{model:'mock',max_tokens:10,messages:[{role:'user',content:'hello'}]}}]})).json();assert.equal((await request(mock,`/v1/messages/batches/${id}/results`)).status,409);
 const cancel=await(await request(mock,`/v1/messages/batches/${id}/cancel`,{})).json();assert.equal(cancel.processing_status,'ended');assert.equal(cancel.request_counts.canceled,1);
});
test('real loopback HTTP transports background and batch files without synthetic fetch responses',async t=>{
 const {createMockServer}=await import('../dist/esm/node.js');const {mock,tick}=setup();const server=createMockServer({mock});const {url}=await server.listen({host:'127.0.0.1',port:0});t.after(()=>server.close());
 const submit=await fetch(url+'/v1/responses',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(background)});assert.equal(submit.status,200);const {id}=await submit.json();await settleImmediateGenerators();tick(10);const done=await(await fetch(url+'/v1/responses/'+id)).json();assert.equal(done.status,'completed');assert.equal(done.output[0].content[0].text,'answer');
 const form=new FormData();form.set('file',new Blob([JSON.stringify(row('a'))]),'input.jsonl');const uploaded=await(await fetch(url+'/v1/files',{method:'POST',body:form})).json();const batch=await(await fetch(url+'/v1/batches',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({input_file_id:uploaded.id})})).json();await settleImmediateGenerators();tick(20);const result=await(await fetch(url+'/v1/batches/'+batch.id)).json();const content=await(await fetch(url+'/v1/files/'+result.output_file_id+'/content')).text();assert.equal(JSON.parse(content).custom_id,'a');assert.equal(mock.records.length,2);
});
test('background keeps native incomplete terminal rather than relabeling it completed',async()=>{
 let now=0;const mock=new MockGPT({clock:()=>now,lifecycle:{delayMs:1},rules:[{generator:responses.text('partial',{finishReason:'length'})}]});const {id}=await(await request(mock,'/v1/responses',background)).json();await settleImmediateGenerators();now=1;const result=await(await request(mock,'/v1/responses/'+id)).json();assert.equal(result.status,'incomplete');
});
test('cancel of a pending generator releases generation through its signal',async()=>{
 let cancelled=0;const mock=new MockGPT({lifecycle:{delayMs:100},rules:[{generator:({signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{cancelled++;reject(signal.reason);},{once:true});})}]});const {id}=await(await request(mock,'/v1/responses',background)).json();await request(mock,`/v1/responses/${id}/cancel`,{});await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,1);assert.equal(mock.activeRequests,0);assert.equal(mock.stats.activeOperations,0);
});
// Optional consumer contract; the production package never imports Agent Core.
if (process.env.MOCKGPT_AGENT_CORE_MODULE) {
 const Core=await import(process.env.MOCKGPT_AGENT_CORE_MODULE);
 for(const protocol of ['responses','interactions','openai-batch','anthropic-batch','gemini-batch']) test(`optional Core Runner lifecycle consumer: ${protocol}`,async()=>{
  const {mock,tick}=setup();const endpoint='https://mock.invalid/'+(['interactions','gemini-batch'].includes(protocol)?'v1beta':'v1');
  const runner=new Core.ModelRunner({provider:{async *stream(){yield 'unused';}},maxCalls:2}).bind({signal:new AbortController().signal});
  const itemIds=protocol.endsWith('-batch')?['a','b']:['a'];const handle={operationId:'consumer-operation',scope:'scope:1',protocol,endpoint,model:'mock',itemIds};
  const saved=[];let reserved=false,authorizations=0;const ports={run:runner.runOperation.bind(runner),authorize(){authorizations++;},reserve:async()=>{if(reserved)return false;reserved=true;return true;},save:async value=>{saved.push(value);}};
  const config={protocol,baseUrl:endpoint,apiKey:'fixture-only',model:'mock',request:mock.fetch};const provider=protocol.endsWith('-batch')?Core.Support.createBatchModelProvider(config):Core.Support.createBackgroundModelProvider(config);
  const payload=protocol.endsWith('-batch')?{items:itemIds.map(id=>({id,messages:[{role:'user',content:'hello'}]}))}:{messages:[{role:'user',content:'hello'}]};
  const queued=await Core.runModelOperation(provider,{action:'submit',handle,payload},ports);assert.ok(queued.handle.remoteId);await settleImmediateGenerators();tick(10);
  const completed=await Core.runModelOperation(provider,{action:'read',handle:queued.handle},ports);assert.equal(completed.status,'completed');
  if(protocol.endsWith('-batch')){assert.deepEqual(completed.value.map(item=>item.id),itemIds);assert.ok(completed.value.every(item=>item.status==='completed'&&item.value.includes('answer')));}else assert.deepEqual(completed.value,['answer']);
  assert.equal(mock.records.length,itemIds.length);assert.equal(runner.remainingCalls,2-itemIds.length);assert.ok(authorizations>=2);assert.equal(saved.at(-1).status,'completed');
 });
 test('optional Core unknown ledger after MockGPT accepts then loses confirmation',async()=>{
  const {mock}=setup({faults:[{kind:'lose-ack'}]});const runner=new Core.ModelRunner({provider:{async *stream(){}},maxCalls:1}).bind({signal:new AbortController().signal});
  const provider=Core.Support.createBackgroundModelProvider({protocol:'responses',baseUrl:'https://mock.invalid/v1',apiKey:'fixture-only',model:'mock',request:mock.fetch});const saved=[];let reserved=false;
  const ports={run:runner.runOperation.bind(runner),authorize(){},reserve:async()=>{if(reserved)return false;reserved=true;return true;},save:async value=>saved.push(value)};const handle={operationId:'unknown-op',scope:'scope:1',protocol:'responses',endpoint:'https://mock.invalid/v1',model:'mock',itemIds:['a']};
  await assert.rejects(Core.runModelOperation(provider,{action:'submit',handle,payload:{messages:[{role:'user',content:'hello'}]}},ports),{code:'MOCK_NETWORK'});assert.equal(saved.at(-1).status,'unknown');assert.equal(mock.records.length,1);assert.equal(runner.remainingCalls,0);
  await assert.rejects(Core.runModelOperation(provider,{action:'submit',handle,payload:{messages:[{role:'user',content:'hello'}]}},ports));assert.equal(mock.records.length,1);
 });
}
for (const [name,path,body] of [
 ['Responses background','/v1/responses',background],
 ['Interactions background','/v1beta/interactions',background],
 ['OpenAI Batch','/v1/batches',{input_file_id:'file-input'}],
 ['Anthropic Batch','/v1/messages/batches',{requests:[{custom_id:'a',params:{model:'mock',messages:[{role:'user',content:'hello'}]}}]}],
 ['Gemini Batch','/v1beta/models/mock:batchGenerateContent',{batch:{input_config:{requests:{requests:[]}}}}],
]) test(`lifecycle ${name} obeys maxBodyBytes before generation`,async()=>{
 const mock=new MockGPT({rules:[{generator:'answer'}],maxBodyBytes:8,lifecycle:{}});
 const response=await request(mock,path,body);assert.equal(response.status,413);assert.equal((await response.json()).error.code,'MOCK_BODY_LIMIT');assert.equal(mock.records.length,0);assert.equal(mock.stats.activeOperations,0);
});
for(const path of ['/v1/files','/v1beta/files','/upload/v1beta/files']) test(`raw upload ${path} obeys maxBodyBytes without resource creation`,async()=>{
 const mock=new MockGPT({rules:[{generator:'answer'}],maxBodyBytes:8,lifecycle:{}});
 const response=await mock.fetch('https://mock.invalid'+path,{method:'POST',body:'123456789'});assert.equal(response.status,413);assert.equal((await response.json()).error.code,'MOCK_BODY_LIMIT');assert.equal(mock.records.length,0);
 const listed=await(await request(mock,'/v1/files')).json();assert.deepEqual(listed.data,[]);
});
test('multipart file upload counts complete wire body against maxBodyBytes',async()=>{
 const mock=new MockGPT({rules:[{generator:'answer'}],maxBodyBytes:8,lifecycle:{}});const form=new FormData();form.set('file',new Blob(['x']),'a.jsonl');
 const response=await mock.fetch('https://mock.invalid/v1/files',{method:'POST',body:form});assert.equal(response.status,413);assert.equal(mock.records.length,0);
 assert.deepEqual((await(await request(mock,'/v1/files')).json()).data,[]);
});
test('standalone lifecycle default request limit is 1 MiB, independent of resource budget',async()=>{
 let calls=0;const runtime=new LifecycleRuntime({options:{limits:{maxBytes:4*1024*1024}},decode:()=>{throw Error('must not decode');},generate:async()=>{calls++;return 'x';},encode:()=>Response.json({})});
 const response=await runtime.handle(new Request('https://mock.invalid/v1/files',{method:'POST',body:'x'.repeat(1_048_577)}));assert.equal(response.status,413);assert.equal(calls,0);assert.equal(runtime.store.files.size,0);
});
test('resumable finalize obeys body limit and leaves accepted upload unchanged',async()=>{
 const mock=new MockGPT({rules:[{generator:'answer'}],maxBodyBytes:8,lifecycle:{}});
 const start=await mock.fetch('https://mock.invalid/upload/v1beta/files',{method:'POST',headers:{'x-goog-upload-command':'start','content-type':'application/json'},body:'{}'});assert.equal(start.status,200);
 const url=start.headers.get('x-goog-upload-url');const response=await mock.fetch(url,{method:'POST',headers:{'x-goog-upload-command':'upload, finalize'},body:'123456789'});assert.equal(response.status,413);assert.equal(mock.records.length,0);
 const id=new URL(url).pathname.split('/').at(-1);assert.equal(await(await request(mock,`/v1/files/${id}/content`)).text(),'');
});

test('query and cancel remain responsive after the visibility delay while generation is pending', { timeout: 1000 }, async () => {
  let now = 0;
  let generationSignal;
  const mock = new MockGPT({
    clock: () => now, lifecycle: { delayMs: 5 },
    rules: [{ generator: ({ signal }) => {
      generationSignal = signal;
      return new Promise(resolve => signal.addEventListener('abort', () => resolve('late'), { once: true }));
    } }],
  });
  try {
    const { id } = await (await request(mock, '/v1/responses', background)).json();
    now = 6;
    assert.equal((await (await request(mock, `/v1/responses/${id}`)).json()).status, 'in_progress');
    assert.equal((await (await request(mock, `/v1/responses/${id}/cancel`, {})).json()).status, 'cancelled');
    assert.equal(generationSignal.aborted, true);
    assert.equal(mock.stats.activeOperations, 0);
  } finally {
    now = 61_000;
    void mock.stats;
  }
});
