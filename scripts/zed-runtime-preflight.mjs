#!/usr/bin/env node
// Read-only local host readiness: no installs, agent spawning, writes, or provider sends.
import {accessSync,constants} from 'node:fs';
import {delimiter,join} from 'node:path';
const names=['zed','node','npm','rea','nigel','cursor','ollama','cargo','git','python3'];
const dirs=(process.env.PATH||'').split(delimiter).filter(Boolean);
function available(name){
 const variants=process.platform==='win32'?[name+'.exe',name+'.cmd',name+'.bat',name]:[name];
 for(const dir of dirs)for(const variant of variants){
  try{accessSync(join(dir,variant),constants.X_OK);return true;}catch{}
 }
 return false;
}
const tools=Object.fromEntries(names.map(name=>[name,{on_path:available(name),executed:false}]));
const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),2500);
let inbox;
try{
 const response=await fetch('http://127.0.0.1:8794/api/control-loop/status',{signal:controller.signal,redirect:'error'});
 const body=await response.text();
 let data={};try{data=JSON.parse(body);}catch{}
 inbox={reachable:response.ok,http_status:response.status,schema:typeof data.schema==='string'?data.schema:null,authoritative_currentness:false,agent_delivery_verified:false};
}catch(e){inbox={reachable:false,code:e.name==='AbortError'?'TIMEOUT':'LOCAL_CRM_UNREACHABLE',authoritative_currentness:false,agent_delivery_verified:false};}
finally{clearTimeout(timeout);}
const result={schema:'xiio.sdk.zed-readiness/v1',tools,inbox,zed_mcp_live:false,external_agents_qualified:false,source_mutation_authorized:false};
console.log(JSON.stringify(result,null,2));
if(process.argv.includes('--require-live')&&(!inbox.reachable||!tools.zed.on_path))process.exitCode=2;
