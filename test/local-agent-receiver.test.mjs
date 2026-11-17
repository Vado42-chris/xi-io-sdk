import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {localRuntimeStatus} from '../bin/xi-local-agent.mjs';
const bin=fileURLToPath(new URL('../bin/xi-local-agent.mjs',import.meta.url));
const listen=(server,port=0)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`));});
const stop=server=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});
function once(root){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[bin,'--once'],{cwd:root,env:{...process.env,XDG_STATE_HOME:path.join(root,'state'),XIIO_OLLAMA_MODEL:'receiver-test'}});let out='';child.stdout.on('data',x=>out+=x);child.on('error',reject);child.on('close',code=>{try{resolve({code,value:JSON.parse(out)});}catch(e){reject(e);}});child.stdin.end('Synthetic receiver continuity check.');});}
for(const status of [301,302,303,307,308,200,503])test(`SDK local-agent receiver continuity ${status}`,async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xi-local-receiver-'));
 let replacementRequests=0;
 const reply=(req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url==='/api/tags'?{models:[{name:'receiver-test'}]}:{message:{role:'assistant',content:'Hello.'}}));};
 const replacement=http.createServer((req,res)=>{replacementRequests++;reply(req,res);});
 const target=await listen(replacement);
 const origin=http.createServer((req,res)=>{res.setHeader('connection','close');if(status===200)reply(req,res);else if(status===503){res.writeHead(503);res.end('{}');}else{res.writeHead(status,{location:target+req.url});res.end();}});
 try{
  // Refuse an occupied port. Never contact or reconfigure an existing Ollama.
  await listen(origin,11434);
  const runtime=await localRuntimeStatus();
  const turn=await once(root);
  if(status===200){assert.match(runtime.ollama_state,/^READY_MODEL_/);assert.equal(turn.value.status,'PASS_LOCAL');}
  else if(status===503){assert.equal(runtime.ollama_state,'HTTP_503');assert.equal(turn.value.status,'BLOCKED');assert.equal(turn.value.first_red,'OLLAMA_HTTP_503');}
  else {assert.equal(runtime.ollama_state,'UNREACHABLE');assert.equal(turn.value.status,'BLOCKED');assert.equal(replacementRequests,0);assert.equal(fs.existsSync(path.join(root,'state','xi-io','cli')),false);}
  assert.equal(replacementRequests,0);
 }finally{await stop(origin);await stop(replacement);fs.rmSync(root,{recursive:true,force:true});}
});
