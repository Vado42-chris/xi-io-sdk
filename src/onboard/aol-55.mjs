import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
const SERVICES={ollama:11434,ai_mail:8795,zed_acp:3100};
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function probe(port,timeout=350){return new Promise(resolve=>{const socket=net.createConnection({host:'127.0.0.1',port});let done=false;const finish=state=>{if(done)return;done=true;socket.destroy();resolve(state)};socket.setTimeout(timeout,()=>finish('UNREACHABLE'));socket.on('connect',()=>finish('LISTENING_UNVERIFIED'));socket.on('error',()=>finish('UNREACHABLE'));});}
export async function compileAolOnboard({node_id='@node_aries_pc',context='HOME',ingress=[],domain=null,lane=null,probeService=probe}={}){
 if(!/^@[a-z0-9_:-]+$/i.test(node_id))throw Error('NODE_ID_INVALID');
 if(!['WORK','PRIVACY','HOME'].includes(context))throw Error('CONTEXT_INVALID');
 if(!Array.isArray(ingress)||ingress.some(x=>!['gmail','outlook','cloud_storage'].includes(x)))throw Error('INGRESS_INVALID');
 if(domain!==null&&!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain))throw Error('DOMAIN_INVALID');
 if(lane!==null&&!['A','B'].includes(lane))throw Error('LANE_INVALID');
 const services={};for(const [name,port] of Object.entries(SERVICES))services[name]={host:'127.0.0.1',port,state:await probeService(port)};
 const steps=[
 {step:'1',state:ingress.length?'WAIT_READONLY_OAUTH':'OPTIONAL_NOT_CONNECTED',providers:ingress,read_only:true},
 {step:'2',state:'LOCAL_CONTEXT_BOUND',node_id,context},
 {step:'3',state:domain?'WAIT_TUNNEL_AUTH':'SKIPPED_OPTIONAL',domain},
 {step:'4',state:'AUDITED',services},
 {step:'5',state:lane?'LANE_SELECTED':'WAIT_SELECTION',lane},
 {step:'5.5',state:'SUGGESTION_ONLY_NO_AGENT_EFFECT'}
 ];
 const packet={schema:'xiio.aol.onboard.55/v1',node_id,context,steps,authority:'NONE',provider_effect:false,mail_server_built:false,service_readiness_proven:false};
 return {...packet,digest:sha(packet)};
}
export function appendAolSuggestion(packet,{ledgerPath}={}){
 if(!ledgerPath)throw Error('LEDGER_PATH_REQUIRED');
 if(packet?.schema!=='xiio.aol.onboard.55/v1')throw Error('INVALID_PACKET');
 const resolved=path.resolve(ledgerPath);
 const base=path.resolve(os.homedir(),'.xiio');
 if(resolved!==base&&!resolved.startsWith(base+path.sep))throw Error('LEDGER_OUTSIDE_PRIVATE_HOME');
 fs.mkdirSync(path.dirname(resolved),{recursive:true,mode:0o700});
 fs.appendFileSync(resolved,JSON.stringify(packet)+'\n',{mode:0o600,flag:'a'});
 return {state:'LOCAL_SUGGESTION_WRITTEN',path:resolved,bytes:Buffer.byteLength(JSON.stringify(packet)+'\n'),provider_effect:false,worker_consumed:false};
}
