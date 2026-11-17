import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const bin=fileURLToPath(new URL('../bin/xi-local-agent.mjs',import.meta.url));
const listen=(server,port=0)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`));});
const stop=server=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});
function invoke(root,origin,status=false){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,status?['--input-type=module','-e',`import {localRuntimeStatus} from ${JSON.stringify(new URL('../bin/xi-local-agent.mjs',import.meta.url).href)}; console.log(JSON.stringify(await localRuntimeStatus()));`]:[bin,'--once'],{cwd:root,env:{...process.env,XDG_STATE_HOME:path.join(root,'state'),XIIO_OLLAMA_MODEL:'receiver-test',OLLAMA_HOST:origin}});let out='';child.stdout.on('data',x=>out+=x);child.on('error',reject);child.on('close',code=>{try{resolve({code,value:JSON.parse(out)});}catch(e){reject(e);}});child.stdin.end('Synthetic receiver continuity check.');});}
for(const status of [301,302,303,307,308,200,503])test(`SDK local-agent receiver continuity ${status}`,async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xi-local-receiver-'));
 let replacementRequests=0; let originRequests=0;
 const reply=(req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url==='/api/tags'?{models:[{name:'receiver-test'}]}:{message:{role:'assistant',content:'Hello.'}}));};
 const replacement=http.createServer((req,res)=>{replacementRequests++;reply(req,res);});
 const target=await listen(replacement);
 const origin=http.createServer((req,res)=>{originRequests++;res.setHeader('connection','close');if(status===200)reply(req,res);else if(status===503){res.writeHead(503);res.end('{}');}else{res.writeHead(status,{location:target+req.url});res.end();}});
 try{
  const bound=await listen(origin);
  const runtime=(await invoke(root,bound,true)).value;
  const turn=await invoke(root,bound);
  assert.equal(originRequests,2,'both operations consume the bound deployment');
  if(status===200){assert.match(runtime.ollama_state,/^READY_MODEL_/);assert.equal(turn.value.status,'PASS_LOCAL');}
  else if(status===503){assert.equal(runtime.ollama_state,'HTTP_503');assert.equal(turn.value.status,'BLOCKED');assert.equal(turn.value.first_red,'OLLAMA_HTTP_503');}
  else {assert.equal(runtime.ollama_state,'UNREACHABLE');assert.equal(turn.value.status,'BLOCKED');assert.equal(replacementRequests,0);assert.equal(fs.existsSync(path.join(root,'state','xi-io','cli')),false);}
  assert.equal(replacementRequests,0);
 }finally{await stop(origin);await stop(replacement);fs.rmSync(root,{recursive:true,force:true});}
});
for(const endpoint of ['', 'not-a-url', 'https://127.0.0.1:11434', 'http://localhost:11434', 'http://example.invalid:11434', 'http://user:secret@127.0.0.1:11434', 'http://127.0.0.1:11434/path', 'http://127.0.0.1:11434/?token=secret', 'http://127.0.0.1:11434/#secret'])test(`invalid explicit model deployment refuses ${endpoint}`,async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xi-model-invalid-'));
 try{
  const status=(await invoke(root,endpoint,true)).value;
  const turn=(await invoke(root,endpoint)).value;
  assert.equal(status.ollama_state,'DEPLOYMENT_INVALID');
  assert.equal(status.ollama_endpoint,null);
  assert.equal(turn.status,'BLOCKED');
  assert.equal(turn.first_red,'OLLAMA_DEPLOYMENT_INVALID');
  assert.equal(JSON.stringify({status,turn}).includes('secret'),false);
  assert.equal(fs.existsSync(path.join(root,'state','xi-io','cli')),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('absent model setting preserves existing default without contacting a provider',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xi-model-default-'));
 try{
  const child=spawn(process.execPath,['--input-type=module','-e',`globalThis.fetch=async()=>{throw Error('TEST_NO_NETWORK');};const {localRuntimeStatus}=await import(${JSON.stringify(new URL('../bin/xi-local-agent.mjs',import.meta.url).href)});console.log(JSON.stringify(await localRuntimeStatus()));`],{cwd:root,env:Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='OLLAMA_HOST'))});
  let out='';for await(const chunk of child.stdout)out+=chunk;
  const result=JSON.parse(out);assert.equal(result.ollama_endpoint,'http://127.0.0.1:11434');assert.equal(result.ollama_state,'UNREACHABLE');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
