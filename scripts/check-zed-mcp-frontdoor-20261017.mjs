import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
const child=spawn(process.execPath,['bin/xi-zed-mcp.mjs'],{env:{...process.env,XIIO_INBOX_LOOPBACK_URL:'http://127.0.0.1:8794',XIIO_ZED_ALLOWED_MAILBOX:'agent+yin@xi-io.net',XIIO_ZED_CONSUMER_REF:'agent:yin',XIIO_ZED_OBSERVER_ID:'seat:yin'},stdio:['pipe','pipe','pipe']});
const pending=new Map();let n=0;
const lines=createInterface({input:child.stdout});
lines.on('line',line=>{const msg=JSON.parse(line);const p=pending.get(msg.id);if(p){pending.delete(msg.id);p.resolve(msg);}});
function rpc(id,method,params={}){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('MCP_TIMEOUT:'+method));},3000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)}});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
try{
 const init=await rpc(1,'initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'xiio-hostile',version:'1'}});
 assert.equal(init.result.serverInfo.name,'xiio-inbox-zed');n++;
 const list=await rpc(2,'tools/list');assert.deepEqual(list.result.tools.map(x=>x.name),['xiio_inbox_health','xiio_agent_mail_list','xiio_agent_mail_qualify']);n++;
 const invalid=await rpc(3,'tools/call',{name:'xiio_agent_mail_list',arguments:{address:'someone@gmail.com'}});assert.equal(invalid.result.isError,true);n++;
 const denied=await rpc(4,'tools/call',{name:'xiio_agent_mail_list',arguments:{address:'agent+yang@xi-io.net'}});assert.match(denied.result.content[0].text,/MAILBOX_SCOPE_DENIED/);n++;
 const deniedActor=await rpc(5,'tools/call',{name:'xiio_agent_mail_qualify',arguments:{consumer_ref:'agent:yang',source_generation:'G1',observer_id:'seat:yin'}});assert.match(deniedActor.result.content[0].text,/ACTOR_SCOPE_DENIED/);n++;
 const unknown=await rpc(6,'tools/call',{name:'xiio_execute_workspace_write',arguments:{}});assert.match(unknown.result.content[0].text,/UNKNOWN_TOOL/);n++;
 console.log(JSON.stringify({schema:'xiio.sdk.zed-mcp-preflight/v1',checks:n,failed:0,live_mail_delivery:false,source_write:false}));
}finally{child.stdin.end();child.kill();}
