import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const bin=fileURLToPath(new URL('../bin/xi.mjs',import.meta.url));
const listen=(server,port=0)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`));});
const stop=server=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});
function install(root){return new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[bin,'install'],{env:{...process.env,HOME:root,XDG_STATE_HOME:path.join(root,'state'),PATH:path.join(root,'fixtures')+path.delimiter+process.env.PATH}});let out='';let err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('error',reject);child.on('close',code=>{try{assert.equal(code,0,err);resolve(JSON.parse(out));}catch(e){reject(e);}});
});}
for(const status of [301,302,303,307,308,200,503])test(`installed service status receiver ${status}`,async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xi-install-status-'));
 fs.mkdirSync(path.join(root,'fixtures'));
 // Disposable process fixture only. Never start/stop the host's systemd services.
 fs.writeFileSync(path.join(root,'fixtures','systemctl'),'#!/bin/sh\ncase "$*" in *is-active*) echo active;; esac\nexit 0\n',{mode:0o755});
 let replacements=0;let originalRequests=0;
 const reply=res=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({schema:'xiio.cli.local-agent-http/v1',service_listener_observed:true,runtime_verified:false,installed_sdk_generation_verified:false}));};
 const replacement=http.createServer((req,res)=>{replacements++;reply(res);});
 const target=await listen(replacement);
 const original=http.createServer((req,res)=>{originalRequests++;res.setHeader('connection','close');if(status===200)reply(res);else if(status===503){res.writeHead(503);res.end('{}');}else{res.writeHead(status,{location:target+'/substitute'});res.end();}});
 try{
  // An occupied port is a test-environment refusal; do not touch its service.
  await listen(original,3109);
  const receipt=await install(root);const service=receipt.local_agent_service;
  assert.equal(originalRequests,1);
  assert.equal(service.active,true,'explicit systemctl fixture, not physical proof');
  assert.equal(service.state,status===200?'ACTIVE_STATUS_VERIFIED':'ACTIVE_STATUS_UNVERIFIED');
  assert.equal(service.status_readback,status===200);
  assert.equal(service.runtime_verified,false);
  assert.equal(service.installed_sdk_generation_verified,false);
  assert.equal(replacements,0);
 }finally{await stop(original);await stop(replacement);fs.rmSync(root,{recursive:true,force:true});}
});
