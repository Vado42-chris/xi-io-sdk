import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
const bin=fileURLToPath(new URL('../bin/xi-zed-mcp.mjs',import.meta.url));
const server=http.createServer(async(req,res)=>{
 let json={};
 if(req.url==='/api/control-loop/status')json={schema:'xiio.control-loop/v1',status:'RUNNING'};
 else if(req.url.startsWith('/api/control-loop/sim-mail'))json={schema:'xiio.inbox.sim-mail-crm-projection/v1',address_filter:'agent+yin@xi-io.net',event_count:1,events:[{event_uuid:'evt:1',source_generation:'g1',consumer_ref:'agent:yin',producer_ref:'agent:yang',subject:'PRIVATE',card:{what:'SECRET'},transport_projections:{local_agent_inbox:{state:'ADDRESS_SUPPLIED_UNVERIFIED'}}}]};
 else if(req.url==='/api/control-loop/agent-mail/qualify-consumption'&&req.method==='POST'){
  const data=await new Promise(resolve=>{let s='';req.on('data',x=>s+=x);req.on('end',()=>resolve(JSON.parse(s)));});
  if(data.source_generation==='stale'){res.writeHead(409,{'content-type':'application/json'});res.end(JSON.stringify({error:'STALE'}));return;}
  json={qualified:true,code:'ELIGIBLE_FOR_WORKER_ACK',effect_authority:false};
 } else {res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(json));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const addr=server.address();
const child=spawn(process.execPath,[bin],{env:{...process.env,XIIO_INBOX_LOOPBACK_URL:'http://127.0.0.1:'+addr.port,XIIO_ZED_ALLOWED_MAILBOX:'agent+yin@xi-io.net',XIIO_ZED_CONSUMER_REF:'agent:yin',XIIO_ZED_OBSERVER_ID:'yin'},stdio:['pipe','pipe','pipe']});
let next=0;const pending=new Map();
createInterface({input:child.stdout}).on('line',line=>{const msg=JSON.parse(line);const p=pending.get(msg.id);if(p){pending.delete(msg.id);p(msg);}});
const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(Error('MCP timeout '+method));},3000);pending.set(id,msg=>{clearTimeout(timer);resolve(msg);});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
let checks=0;const check=x=>{assert.ok(x);checks++;};
try{
 const init=await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'hostile',version:'1'}});
 check(init.result.serverInfo.name==='xiio-inbox-zed');
 const list=await rpc('tools/list');check(list.result.tools.length===3);
 const health=await rpc('tools/call',{name:'xiio_inbox_health'});
 check(health.result.isError===false);check(JSON.parse(health.result.content[0].text).effect_performed===false);
 const invalid=await rpc('tools/call',{name:'xiio_agent_mail_list',arguments:{address:'person@example.com'}});
 check(invalid.result.isError===true);
 const forbidden=await rpc('tools/call',{name:'xiio_agent_mail_list',arguments:{address:'agent+yang@xi-io.net'}});
 check(forbidden.result.isError===true);
 const mail=await rpc('tools/call',{name:'xiio_agent_mail_list',arguments:{address:'agent+yin@xi-io.net'}});
 const projection=JSON.parse(mail.result.content[0].text);
 check(projection.event_count===1);check(!JSON.stringify(projection).includes('SECRET'));check(projection.provider_effect===false);
 const stale=await rpc('tools/call',{name:'xiio_agent_mail_qualify',arguments:{consumer_ref:'agent:yin',source_generation:'stale',observer_id:'yin'}});
 check(stale.result.isError===true);
 const accepted=await rpc('tools/call',{name:'xiio_agent_mail_qualify',arguments:{consumer_ref:'agent:yin',source_generation:'g1',observer_id:'yin'}});
 const ack=JSON.parse(accepted.result.content[0].text);check(ack.qualified===true&&ack.work_executed===false&&ack.level9===false);
 check(ack.effect_authority===false&&ack.qualification_source==='LOCAL_CRM_REPORTED_UNVERIFIED');
 const foreign=await rpc('tools/call',{name:'xiio_agent_mail_qualify',arguments:{consumer_ref:'agent:yang',source_generation:'g1',observer_id:'yin'}});
 check(foreign.result.isError===true);
 const missing=await rpc('tools/call',{name:'xiio_agent_mail_qualify',arguments:{source_generation:'g1',observer_id:'yin'}});
 check(missing.result.isError===true);
}finally{child.kill();await new Promise(resolve=>server.close(resolve));}
const denied=spawn(process.execPath,[bin],{env:{...process.env,XIIO_INBOX_LOOPBACK_URL:'https://example.com/mcp'},stdio:['pipe','pipe','pipe']});
const code=await new Promise(resolve=>denied.once('exit',resolve));check(code===78);
console.log(JSON.stringify({schema:'xiio.sdk.zed-mcp-hostile/v1',checks,failed:0,provider_effect:false,ward_write:false,scope:'local mocked Inbox API'}));
