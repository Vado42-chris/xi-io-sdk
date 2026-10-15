import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const binary=(name)=>{const r=spawnSync('which',[name],{encoding:'utf8',timeout:1500});return r.status===0?r.stdout.trim():null};
const probe=(url)=>{const r=spawnSync('curl',['-fsS','--max-time','2',url],{encoding:'utf8',timeout:3000});return r.status===0};
export function inspectFirstRun({mode='auto',home=homedir(),detectBinary=binary,detectEndpoint=probe,hasPath=existsSync}={}){
 if(!['auto','single-machine','split-aries-loki','virtual'].includes(mode))throw Error('INVALID_MODE');
 const bins={node:detectBinary('node'),ollama:detectBinary('ollama'),zed:detectBinary('zed'),git:detectBinary('git'),docker:detectBinary('docker')};
 const ollama=detectEndpoint('http://127.0.0.1:11434/api/tags');
 const crm=detectEndpoint('http://127.0.0.1:8794/api/control-loop/status');
 const ingress=detectEndpoint('http://127.0.0.1:8795/health');
 const selected=mode==='auto'?(ollama?'single-machine':'virtual'):mode;
 const checks=[
  {id:'HOME_DIRECTORY',pass:hasPath(home)},
  {id:'GIT_AVAILABLE',pass:!!bins.git},
  {id:'OLLAMA_BINARY',pass:!!bins.ollama},
  {id:'OLLAMA_LOCAL_API',pass:ollama},
  {id:'ZED_BINARY',pass:!!bins.zed},
  {id:'INBOX_CRM_LOCAL',pass:crm},
  {id:'INBOX_INGRESS_LOCAL',pass:ingress},
  {id:'SABLE_RUNNING',pass:false,reason:'NO_REGISTERED_SABLE_RUNTIME_PROBE'},
  {id:'DOMAIN_OWNERSHIP',pass:false,reason:'NOT_VERIFIED'},
  {id:'EXTERNAL_ACCOUNTS_READ_ONLY',pass:false,reason:'CONSENT_AND_PROVIDER_PROOF_REQUIRED'},
  {id:'LOKI_RELEASE_TARGET',pass:false,reason:'REMOTE_READBACK_REQUIRED'},
 ];
 return {schema:'xiio.sdk.first-run-diagnostic/v1',mode:selected,home,checks,ready:checks.every(c=>c.pass),effect_performed:false,account_mutation:false,domain_mutation:false,server_mutation:false};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const mode=process.argv[2]||'auto';console.log(JSON.stringify(inspectFirstRun({mode}),null,2));
}
