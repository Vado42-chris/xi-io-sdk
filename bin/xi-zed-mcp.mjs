#!/usr/bin/env node
// XI-IO SDK Zed MCP front door. Effect ceiling zero; Inbox CRM remains canonical.
import { createInterface } from 'node:readline';
const VERSION='2025-03-26';
const SERVER='xiio-inbox-zed';
const FALLBACK='http://127.0.0.1:8794';
const configured=process.env.XIIO_INBOX_LOOPBACK_URL||FALLBACK;
const allowedMailbox=(process.env.XIIO_ZED_ALLOWED_MAILBOX||'').toLowerCase();
const allowedConsumer=process.env.XIIO_ZED_CONSUMER_REF||'';
const allowedObserver=process.env.XIIO_ZED_OBSERVER_ID||'';
let origin;
try {
  const url=new URL(configured);
  if(url.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('HOST_NOT_LOOPBACK');
  origin=url.origin;
} catch(error) {
  process.stderr.write('XIIO_INBOX_ENDPOINT_REJECTED: '+error.message+'\n');
  process.exit(78);
}
const declarations=[
  {name:'xiio_inbox_health',description:'Inspect local Inbox control-loop source/runtime status. Read only, not worker ACK or delivery.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'xiio_agent_mail_list',description:'Inspect an internal agent mailbox metadata projection on Inbox loopback. No message-body disclosure or delivery proof.',inputSchema:{type:'object',properties:{address:{type:'string',description:'Exact internal agent mailbox address'}} ,required:['address'],additionalProperties:false}},
  {name:'xiio_agent_mail_qualify',description:'Ask canonical Inbox CRM whether an exact message generation is eligible for worker ACK. No worker execution or effect authority.',inputSchema:{type:'object',properties:{consumer_ref:{type:'string'},source_generation:{type:'string'},observer_id:{type:'string'}},required:['consumer_ref','source_generation','observer_id'],additionalProperties:false}}
];
const err=(code,message)=>({code,message});
const text=(x)=>({content:[{type:'text',text:JSON.stringify(x)}],isError:false});
const failed=(code,detail)=>({content:[{type:'text',text:JSON.stringify({ok:false,code,detail,effect_performed:false})}],isError:true});
function valid(s,max=256){return typeof s==='string'&&s.trim()===s&&s.length>0&&s.length<=max&&!/[\x00-\x1f\x7f]/.test(s);}
async function localApi(route,method='GET',body){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),4000);
  try{
    const res=await fetch(origin+route,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,redirect:'error'});
    const raw=await res.text();
    let json;
    try{json=JSON.parse(raw);}catch{throw err('INBOX_RESPONSE_NOT_JSON','HTTP '+res.status);}
    if(!res.ok)throw err('INBOX_HTTP_'+res.status,json.error||json.code||'API rejected');
    return json;
  }catch(e){if(e.code)throw e;throw err('INBOX_UNREACHABLE',e.name==='AbortError'?'timeout':String(e.message||e));}
  finally{clearTimeout(timeout);}
}
function mailboxProjection(input){
 const events=Array.isArray(input.events)?input.events:[];
 return {schema:'xiio.zed.mailbox-metadata/v1',source_schema:input.schema||null,endpoint:input.address_filter||null,event_count:input.event_count??events.length,
   events:events.map(e=>({event_uuid:e.event_uuid,source_generation:e.source_generation,consumer_ref:e.consumer_ref,producer_ref:e.producer_ref,generation_currentness:e.generation_currentness,currentness_proof:e.currentness_proof,transport_state:e.transport_projections?.local_agent_inbox?.state||'UNKNOWN'})),
   provider_effect:false,worker_executed:false,level9:false};
}
async function call(name,args){
 if(name==='xiio_inbox_health'){
   if(Object.keys(args).length)return failed('INVALID_ARGS','Unexpected arguments');
   const r=await localApi('/api/control-loop/status');
   return text({schema:'xiio.zed.inbox-health/v1',reachable:true,source_schema:r.schema||null,status:typeof r.status==='string'?r.status:typeof r.state==='string'?r.state:'SOURCE_RESPONSE',delivery_verified:false,effect_performed:false});
 }
 if(name==='xiio_agent_mail_list'){
   if(!valid(args.address,254)||!/^agent\+[a-z0-9-]+@xi-io\.net$/i.test(args.address))return failed('INVALID_AGENT_ADDRESS','Expected agent+name@xi-io.net');
   if(!allowedMailbox||args.address.toLowerCase()!==allowedMailbox)return failed('MAILBOX_SCOPE_DENIED','Host-bound mailbox identity required');
   const r=await localApi('/api/control-loop/sim-mail?address='+encodeURIComponent(args.address));
   return text(mailboxProjection(r));
 }
 if(name==='xiio_agent_mail_qualify'){
   const {consumer_ref,source_generation,observer_id}=args;
   if(![consumer_ref,source_generation,observer_id].every(v=>valid(v,128)))return failed('INVALID_IDENTITY','Missing or invalid exact identity');
   if(!allowedConsumer||!allowedObserver||consumer_ref!==allowedConsumer||observer_id!==allowedObserver)return failed('ACTOR_SCOPE_DENIED','Host-bound consumer and observer identity required');
   const r=await localApi('/api/control-loop/agent-mail/qualify-consumption','POST',{consumer_ref,source_generation,observer_id});
   return text({schema:'xiio.zed.agent-mail-qualification/v1',...r,effect_authority:false,work_executed:false,provider_effect:false,level9:false,qualification_source:'LOCAL_CRM_REPORTED_UNVERIFIED'});
 }
 return failed('UNKNOWN_TOOL',name);
}
function send(message){process.stdout.write(JSON.stringify({jsonrpc:'2.0',...message})+'\n');}
async function receive(line){
 let request;
 try{request=JSON.parse(line);}catch{send({id:null,error:err(-32700,'Parse error')});return;}
 if(!request||request.jsonrpc!=='2.0'||typeof request.method!=='string'){send({id:request?.id??null,error:err(-32600,'Invalid Request')});return;}
 if(request.id===undefined)return; // Notifications are unidirectional.
 const {id,method,params={}}=request;
 try{
  if(method==='initialize'){send({id,result:{protocolVersion:VERSION,capabilities:{tools:{listChanged:false}},serverInfo:{name:SERVER,version:'0.1.0'}}});return;}
  if(method==='ping'){send({id,result:{}});return;}
  if(method==='tools/list'){send({id,result:{tools:declarations}});return;}
  if(method==='tools/call'){
    if(!params||typeof params.name!=='string'||(params.arguments!==undefined&&(typeof params.arguments!=='object'||params.arguments===null||Array.isArray(params.arguments)))){send({id,error:err(-32602,'Invalid params')});return;}
    send({id,result:await call(params.name,params.arguments??{})});return;
  }
  send({id,error:err(-32601,'Method not found')});
 }catch(e){send({id,result:failed(e.code||'INTERNAL_FAILURE',e.message||'Unknown failure')});}
}
const rl=createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of rl){if(line.trim())await receive(line);}
