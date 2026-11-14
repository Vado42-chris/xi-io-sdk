import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const sourceUrl=new URL('../src/cli/local-agent-http.mjs',import.meta.url);
const source=fs.readFileSync(sourceUrl,'utf8');
const owner=process.env.EXPECTED_HTTP_OWNER||'198';
assert.ok(['198','179'].includes(owner));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));
async function fixture({timeout=1000,throwTurn=false}={}){
 let listener;const server={address(){return {port:3109};},once(){return this;},listen(_port,_host,ready){ready();}};
 const context=vm.createContext({Buffer,process,console,AbortController,setTimeout,clearTimeout});
 const imports={'node:http':{default:{createServer(fn){listener=fn;return server;}}},'node:fs':{default:fs},'node:fs/promises':{default:fsp},'node:os':{default:os},'node:path':{default:path},'node:url':{fileURLToPath}};
 const module=new vm.SourceTextModule(source,{context,identifier:sourceUrl.href,initializeImportMeta(meta){meta.url=sourceUrl.href;}});
 await module.link(name=>{const values=imports[name];assert.ok(values,name);return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context});});await module.evaluate();
 const turn=deferred();let calls=0,active=0,maxActive=0,generation={ok:true},lastOptions,statusThrows=false;const requests=[];
 await module.namespace.startLocalAgentServer({port:3109,turnTimeoutMs:timeout,handleTurn:async(_message,options)=>{calls++;active++;lastOptions=options;maxActive=Math.max(maxActive,active);try{if(throwTurn)throw Error('TURN_FAILED');await turn.promise;return 'fixture reply';}finally{active--;}} ,status:async()=>{if(statusThrows)throw Error('STATUS_FAILED');return {};},observeInstalledGeneration:()=>generation});
 function call({body={message:'hello'},raw=null,bodyError=null,method='POST',url='/v1/turn',headers={}}={}){
  const entered=deferred(),release=deferred();let reads=0;
  const req={method,url,headers:{host:'127.0.0.1:3109','content-type':'application/json',...headers},async *[Symbol.asyncIterator](){reads++;entered.resolve();await release.promise;if(bodyError)throw bodyError;yield Buffer.from(raw===null?JSON.stringify(body):raw);}};
  const res={status:null,body:null,writeHead(status){this.status=status;},end(body){this.body=JSON.parse(body);}};const pending={entered,release,res,get reads(){return reads;},done:listener(req,res)};requests.push(pending);return pending;
 }
 async function immediate(options){const r=call(options);r.release.resolve();await r.done;return r;}
 return {call,immediate,turn,get calls(){return calls;},get maxActive(){return maxActive;},get lastOptions(){return lastOptions;},set generation(v){generation=v;},set statusThrows(v){statusThrows=v;},async cleanup(){for(const r of requests)r.release.resolve();turn.resolve();await Promise.all(requests.map(r=>r.done));}};
}
async function expectBusy(f){const r=f.call();await tick();assert.equal(r.res.status,409);assert.equal(r.res.body.reason,'ONE_TURN_AT_A_TIME');}
test('pending body reserves existing one-turn slot before another body is read',async()=>{const f=await fixture();try{const a=f.call();await a.entered.promise;const b=f.call();await tick();assert.equal(b.res.status,409);assert.equal(b.res.body.reason,'ONE_TURN_AT_A_TIME');assert.equal(b.reads,0);assert.equal(f.calls,0);}finally{await f.cleanup();}});
test('overlapping bodies do not dispatch two simultaneous turns',async()=>{const f=await fixture();try{const a=f.call();await a.entered.promise;const b=f.call();a.release.resolve();b.release.resolve();await tick();assert.equal(f.maxActive,1);assert.equal(f.calls,1);}finally{await f.cleanup();}});
for(const [label,options,expected] of [['malformed',{raw:'{'},400],['empty',{body:{message:' '}},400],['oversized',{raw:'x'.repeat(65537)},413],['aborted',{bodyError:Error('REQUEST_ABORTED')},500]]){
 test(`${label} body releases only its reservation before the next valid turn`,async()=>{const f=await fixture();try{const a=await f.immediate(options);assert.equal(a.res.status,expected);assert.equal(f.calls,0);f.turn.resolve();const b=await f.immediate();assert.equal(b.res.status,200);assert.equal(f.calls,1);}finally{await f.cleanup();}});
}
test('handler rejection releases its own turn slot',async()=>{const f=await fixture({throwTurn:true});try{assert.equal((await f.immediate()).res.status,500);assert.equal((await f.immediate()).res.status,500);assert.equal(f.calls,2);}finally{await f.cleanup();}});
test('timeout aborts signal but keeps slot until actual turn settles',async()=>{const f=await fixture({timeout:10});try{const a=await f.immediate();assert.equal(a.res.status,504);assert.equal(f.lastOptions.signal.aborted,true);await expectBusy(f);assert.equal(f.calls,1);f.turn.resolve();await tick();assert.equal((await f.immediate()).res.status,200);}finally{await f.cleanup();}});
test('status and UI requests cannot release another pending body slot',async()=>{const f=await fixture();try{const a=f.call();await a.entered.promise;const status=await f.immediate({method:'GET',url:'/v1/status'});assert.equal(status.res.status,200);assert.equal(status.res.body.busy,true);assert.equal((await f.immediate({method:'GET',url:'/'})).res.status,404);await expectBusy(f);}finally{await f.cleanup();}});
test('failed status request cannot release another pending body slot',async()=>{const f=await fixture();try{const a=f.call();await a.entered.promise;f.statusThrows=true;assert.equal((await f.immediate({method:'GET',url:'/v1/status'})).res.status,500);await expectBusy(f);}finally{await f.cleanup();}});
test('foreign admission refusal cannot release an active slot',async()=>{const f=await fixture();try{const a=f.call();await a.entered.promise;assert.equal((await f.immediate({headers:{origin:'https://foreign.invalid'}})).res.status,403);await expectBusy(f);}finally{await f.cleanup();}});
test('32 overlapping callers still dispatch at most one turn',async()=>{const f=await fixture();try{const a=f.call();await a.entered.promise;const rest=Array.from({length:31},()=>f.call());a.release.resolve();for(const r of rest)r.release.resolve();await tick();assert.equal(f.calls,1);assert.equal(f.maxActive,1);assert.equal(rest.filter(r=>r.res.status===409).length,31);}finally{await f.cleanup();}});
if(owner==='198')test('installed-generation refusal does not release an admitted caller slot',async()=>{const f=await fixture();try{const a=f.call();await a.entered.promise;f.generation={ok:false,first_red:'FIXTURE_STALE'};const b=await f.immediate();assert.equal(b.res.status,503);assert.equal(b.res.body.reason,'INSTALLED_GENERATION_REQUIRED');assert.equal(b.reads,0);f.generation={ok:true};await expectBusy(f);}finally{await f.cleanup();}});
if(owner==='179'){
 test('validated conversation context is still passed to the handler',async()=>{const f=await fixture();try{f.turn.resolve();const r=await f.immediate({body:{message:'hello',conversation_ref:'thread:fixture',context:[{role:'user',content:'prior'}]}});assert.equal(r.res.status,200);assert.equal(f.lastOptions.conversationRef,'thread:fixture');assert.equal(JSON.stringify(f.lastOptions.context),JSON.stringify([{role:'user',content:'prior'}]));}finally{await f.cleanup();}});
 test('invalid conversation reference releases only its rejected request slot',async()=>{const f=await fixture();try{const r=await f.immediate({body:{message:'hello',conversation_ref:'bad space'}});assert.equal(r.res.status,400);assert.equal(r.res.body.reason,'CONVERSATION_REF_INVALID');assert.equal(f.calls,0);f.turn.resolve();assert.equal((await f.immediate()).res.status,200);}finally{await f.cleanup();}});
 test('invalid conversation context releases only its rejected request slot',async()=>{const f=await fixture();try{const r=await f.immediate({body:{message:'hello',context:[{role:'system',content:'not accepted'}]}});assert.equal(r.res.status,400);assert.equal(r.res.body.reason,'CONVERSATION_CONTEXT_INVALID');assert.equal(f.calls,0);f.turn.resolve();assert.equal((await f.immediate()).res.status,200);}finally{await f.cleanup();}});
}

// Combined-owner guard uses the same strict boolean rule as its status route.
for (const value of ['false', 'true', 1]) {
  test(`truthy nonboolean generation ${JSON.stringify(value)} cannot admit a turn`, async () => {
    const f = await fixture();
    try {
      f.generation = { ok: value };
      f.turn.resolve();
      const result = await f.immediate();
      assert.equal(result.res.status, 503);
      assert.equal(result.res.body.reason, 'INSTALLED_GENERATION_REQUIRED');
      assert.equal(f.calls, 0);
    } finally { await f.cleanup(); }
  });
}
