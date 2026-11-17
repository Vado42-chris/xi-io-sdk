import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export const INSTALLED_LOCAL_WORKER_SCHEMA='xiio.sdk.installed-local-worker-observer/v1';
const REF=/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/;
const GIT=/^[a-f0-9]{40}$/;
const CRITICAL=Object.freeze([
  'bin/xi-local-agent.mjs',
  'src/cli/local-agent-http.mjs',
  'src/worker/connection.mjs',
  'src/worker/execution-route.mjs',
]);

function fail(code){
  const error=new TypeError(code);
  error.code=code;
  throw error;
}
function ref(value,code){
  if(typeof value!=='string'||!REF.test(value))fail(code);
  return value;
}
function regular(file,code){
  const st=fs.lstatSync(file,{throwIfNoEntry:false});
  if(!st||!st.isFile()||st.isSymbolicLink()||fs.realpathSync(file)!==file)fail(code);
  return st;
}
function safeRoot(raw){
  if(typeof raw!=='string'||!path.isAbsolute(raw))fail('INSTALLED_LOCAL_WORKER_SDK_ROOT_REQUIRED');
  const root=path.resolve(raw);
  const st=fs.lstatSync(root,{throwIfNoEntry:false});
  if(!st||!st.isDirectory()||st.isSymbolicLink()||fs.realpathSync(root)!==root)
    fail('INSTALLED_LOCAL_WORKER_SDK_ROOT_UNTRUSTED');
  if(typeof process.getuid==='function'&&st.uid!==process.getuid())
    fail('INSTALLED_LOCAL_WORKER_SDK_ROOT_UNOWNED');
  return root;
}
function readStableText(file,code){
  const st=regular(file,code);
  if(st.size<=0||st.size>65536)fail(code);
  const first=fs.readFileSync(file);
  const second=fs.readFileSync(file);
  if(!first.equals(second)||first.includes(0))fail(code);
  return first.toString('utf8').trim();
}
function canonicalOrigin(value,expectedRepo){
  const raw=String(value||'').trim();
  const allowed=new Set([
    `https://github.com/${expectedRepo}`,
    `https://github.com/${expectedRepo}.git`,
    `git@github.com:${expectedRepo}.git`,
  ]);
  if(!allowed.has(raw))fail('INSTALLED_LOCAL_WORKER_ORIGIN_MISMATCH');
  return raw;
}
function git(root,args,gitExec){
  let output;
  try{
    output=gitExec('git',['-C',root,...args],{
      encoding:'utf8',stdio:['ignore','pipe','pipe'],
    });
  }catch{
    fail('INSTALLED_LOCAL_WORKER_GIT_READBACK_FAILED');
  }
  return String(output).trim();
}
function digestCritical(root,generation){
  const files={};
  for(const relative of CRITICAL){
    const file=path.join(root,relative);
    const bytes=fs.readFileSync(regular(file,'INSTALLED_LOCAL_WORKER_CRITICAL_FILE_UNTRUSTED')&&file);
    files[relative]=createHash('sha256').update(bytes).digest('hex');
  }
  const canonical=JSON.stringify({generation,files});
  return createHash('sha256').update(canonical).digest('hex');
}
function sourceObservation({sdkPathFile,expectedRepo,expectedGeneration,gitExec}){
  const configured=readStableText(path.resolve(sdkPathFile),'INSTALLED_LOCAL_WORKER_SDK_PATH_UNTRUSTED');
  const root=safeRoot(configured);
  const actual=git(root,['rev-parse','HEAD'],gitExec);
  if(!GIT.test(actual)||actual!==expectedGeneration)fail('INSTALLED_LOCAL_WORKER_GENERATION_MISMATCH');
  canonicalOrigin(git(root,['remote','get-url','origin'],gitExec),expectedRepo);
  const dirty=git(root,['status','--porcelain=v1','--untracked-files=no','--',...CRITICAL],gitExec);
  if(dirty)fail('INSTALLED_LOCAL_WORKER_CRITICAL_BYTES_DIRTY');
  return Object.freeze({
    sdk_root:root,
    generation:actual,
    installation_sha256:digestCritical(root,actual),
  });
}
function loopbackUrl(raw){
  let url;
  try{url=new URL(raw)}catch{fail('INSTALLED_LOCAL_WORKER_STATUS_URL_INVALID')}
  if(url.protocol!=='http:'||url.username||url.password||url.search||url.hash||
     !['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/v1/status'){
    fail('INSTALLED_LOCAL_WORKER_STATUS_URL_INVALID');
  }
  return url.toString();
}

export function createInstalledLocalWorkerObserver({
  sdkPathFile,
  expectedGeneration,
  ownerPrincipalRef,
  expectedRepo='Vado42-chris/xi-io-sdk',
  statusUrl='http://127.0.0.1:3109/v1/status',
  fetchImpl=globalThis.fetch,
  gitExec=execFileSync,
  clock=()=>new Date().toISOString(),
}={}){
  if(typeof sdkPathFile!=='string'||!path.isAbsolute(sdkPathFile))
    fail('INSTALLED_LOCAL_WORKER_SDK_PATH_REQUIRED');
  if(!GIT.test(String(expectedGeneration||'')))
    fail('INSTALLED_LOCAL_WORKER_EXPECTED_GENERATION_REQUIRED');
  const owner=ref(ownerPrincipalRef,'INSTALLED_LOCAL_WORKER_OWNER_PRINCIPAL_INVALID');
  if(typeof expectedRepo!=='string'||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(expectedRepo))
    fail('INSTALLED_LOCAL_WORKER_EXPECTED_REPO_INVALID');
  if(typeof fetchImpl!=='function'||typeof gitExec!=='function'||typeof clock!=='function')
    fail('INSTALLED_LOCAL_WORKER_PORT_INVALID');
  const endpoint=loopbackUrl(statusUrl);

  function readInstalledWorker({worker_ref,device_ref}={}){
    const worker=ref(worker_ref,'INSTALLED_LOCAL_WORKER_REF_INVALID');
    const device=ref(device_ref,'INSTALLED_LOCAL_WORKER_DEVICE_INVALID');
    const source=sourceObservation({sdkPathFile,expectedRepo,expectedGeneration,gitExec});
    const bindingDigest=createHash('sha256')
      .update(JSON.stringify({worker_ref:worker,device_ref:device,generation:source.generation,
        owner_principal_ref:owner,installation_sha256:source.installation_sha256}))
      .digest('hex');
    return Object.freeze({
      schema:'xiio.sdk.installed-worker/v1',
      state:'INSTALLED_READBACK_VERIFIED',
      worker_ref:worker,
      device_ref:device,
      source_generation:source.generation,
      installed_generation:source.generation,
      owner_principal_ref:owner,
      installation_ref:'installation:local-sdk:'+source.generation,
      installation_sha256:source.installation_sha256,
      binding_ref:'binding:local-sdk:'+bindingDigest,
      authority_granted:false,
      provider_effect:false,
    });
  }

  async function observeWorker({worker_ref,device_ref}={}){
    const installed=readInstalledWorker({worker_ref,device_ref});
    let response;
    try{
      response=await fetchImpl(endpoint,{
        method:'GET',
        headers:{accept:'application/json'},
        redirect:'error',
      });
    }catch{
      fail('INSTALLED_LOCAL_WORKER_STATUS_UNREACHABLE');
    }
    if(!response||response.status!==200)fail('INSTALLED_LOCAL_WORKER_STATUS_UNREACHABLE');
    let status;try{status=await response.json()}catch{fail('INSTALLED_LOCAL_WORKER_STATUS_JSON_INVALID')}
    if(status?.schema!=='xiio.cli.local-agent-http/v1'||status.state!=='READY'||
       status.service_listener_observed!==true||status.installed_sdk_generation_verified!==true||
       status.runtime_verified!==true||status.installed_sdk_root!==safeRoot(
         readStableText(path.resolve(sdkPathFile),'INSTALLED_LOCAL_WORKER_SDK_PATH_UNTRUSTED'))||
       !Number.isSafeInteger(status.service_process_pid)||status.service_process_pid<=0){
      fail('INSTALLED_LOCAL_WORKER_STATUS_NOT_QUALIFIED');
    }
    const observedAt=clock();
    if(!Number.isFinite(Date.parse(observedAt)))fail('INSTALLED_LOCAL_WORKER_CLOCK_INVALID');
    const observationDigest=createHash('sha256').update(JSON.stringify({
      worker_ref:installed.worker_ref,device_ref:installed.device_ref,
      installed_generation:installed.installed_generation,
      installation_sha256:installed.installation_sha256,
      service_process_pid:status.service_process_pid,observed_at:observedAt,
    })).digest('hex');
    return Object.freeze({
      schema:'xiio.sdk.worker-liveness/v1',
      state:'READY',
      worker_ref:installed.worker_ref,
      device_ref:installed.device_ref,
      installed_generation:installed.installed_generation,
      installation_sha256:installed.installation_sha256,
      observation_ref:'observation:local-worker:'+observationDigest,
      service_active:true,
      installed_process_observed:true,
      observed_at:observedAt,
      authority_granted:false,
      provider_effect:false,
    });
  }

  return Object.freeze({readInstalledWorker,observeWorker});
}
