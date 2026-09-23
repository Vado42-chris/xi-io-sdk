import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  discoverRunnerServices,
  discoverRunnerListener,
} from '../recovery/aries-runner.mjs';

function run(command,args,{cwd,env=process.env,timeout=5000}={}){
  const result=spawnSync(command,args,{cwd,env:{...env,GIT_OPTIONAL_LOCKS:'0'},encoding:'utf8',timeout,maxBuffer:1024*1024});
  return {
    ok:!result.error && result.status===0,
    status:Number.isInteger(result.status)?result.status:null,
    stdout:String(result.stdout||'').trim(),
    stderr:String(result.stderr||'').trim(),
    error:result.error?String(result.error.message||result.error):null,
  };
}
function uniq(rows){return [...new Set(rows.filter(Boolean))];}
function real(value){
  if(!value)return null;
  try{return fs.realpathSync(value);}catch{return path.resolve(value);}
}
function dir(value){try{return fs.statSync(value).isDirectory();}catch{return false;}}
function file(value){try{return fs.statSync(value).isFile();}catch{return false;}}
function ancestorNamed(start,name){
  let cursor=real(start);
  if(!cursor)return null;
  while(cursor && cursor!==path.dirname(cursor)){
    if(path.basename(cursor)===name && dir(cursor))return cursor;
    cursor=path.dirname(cursor);
  }
  return null;
}
function volumeRoot(cwd,env=process.env){
  if(env.XIIO_VOLUME_ROOT && dir(env.XIIO_VOLUME_ROOT)) return real(env.XIIO_VOLUME_ROOT);
  const resolved=real(cwd);
  if(!resolved)return null;
  const user=env.USER||path.basename(os.homedir());
  const mediaPrefix=path.join('/media',user)+path.sep;
  if(resolved.startsWith(mediaPrefix)){
    const rest=resolved.slice(mediaPrefix.length).split(path.sep).filter(Boolean);
    return rest.length?path.join('/media',user,rest[0]):null;
  }
  if(resolved.startsWith('/mnt/')){
    const rest=resolved.slice('/mnt/'.length).split(path.sep).filter(Boolean);
    return rest.length?path.join('/mnt',rest[0]):'/mnt';
  }
  return null;
}
function firstExisting(candidates){
  const normalized=uniq(candidates.map(real));
  return {
    selected:normalized.find(dir)||null,
    candidates:normalized.map(value=>({path:value,exists:dir(value)})),
  };
}
function frameworkIdentity(candidate,{exec=run,env=process.env,providerRead=true}={}){
  if(!candidate || !dir(candidate)){
    return {state:'ABSENT',path:candidate||null,reason:'FRAMEWORK_DIRECTORY_NOT_FOUND'};
  }
  const inside=exec('git',['rev-parse','--is-inside-work-tree'],{cwd:candidate,env});
  const top=exec('git',['rev-parse','--show-toplevel'],{cwd:candidate,env});
  const origin=exec('git',['remote','get-url','origin'],{cwd:candidate,env});
  const head=exec('git',['rev-parse','HEAD'],{cwd:candidate,env});
  const branch=exec('git',['branch','--show-current'],{cwd:candidate,env});
  const dirty=exec('git',['status','--porcelain=v1'],{cwd:candidate,env});
  const canonicalOrigin=/github\.com[:/]Vado42-chris\/xi-io\.net(?:\.git)?$/i.test(origin.stdout);
  const markers={
    agents:file(path.join(candidate,'AGENTS.md')),
    bootstrap:file(path.join(candidate,'public','.well-known','xi-io.json')),
    installer:file(path.join(candidate,'scripts','install-xiio-cli')),
  };
  const markerCount=Object.values(markers).filter(Boolean).length;
  let provider_main=null;
  let provider_state='NOT_REQUESTED';
  if(providerRead){
    const remote=exec('git',['ls-remote','origin','refs/heads/main'],{cwd:candidate,env,timeout:8000});
    const match=remote.stdout.match(/^([0-9a-f]{40})\s+/);
    if(remote.ok && match){
      provider_main=match[1];
      provider_state='PASS';
    } else provider_state='WAIT_UNREADABLE';
  }
  const local_head=/^[0-9a-f]{40}$/.test(head.stdout)?head.stdout:null;
  const generation_state=provider_main&&local_head
    ? (provider_main===local_head?'EXACT_PROVIDER_MAIN':'DIFFERENT_FROM_PROVIDER_MAIN')
    : 'UNKNOWN';
  const valid=inside.stdout==='true' && canonicalOrigin && markerCount>=2;
  return {
    state:valid?'PASS':'FAIL',
    path:real(candidate),
    git_root:top.ok?real(top.stdout):null,
    branch:branch.stdout||null,
    local_head,
    provider_main,
    provider_state,
    generation_state,
    dirty_state:dirty.ok?(dirty.stdout?'DIRTY':'CLEAN'):'UNKNOWN',
    origin:origin.stdout||null,
    canonical_origin:canonicalOrigin,
    markers,
    marker_count:markerCount,
    hard:[
      'DECLARED_PATH != PHYSICAL_FRAMEWORK_ROOT',
      'OLD_FRAMEWORK_CLI_FILES != FRAMEWORK_IDENTITY',
      'LOCAL_HEAD != PROVIDER_MAIN_UNLESS_EXACT',
    ],
  };
}
async function probeJson(url,timeout=1500){
  try{
    const response=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(timeout)});
    const text=await response.text();
    let body=null;
    try{body=JSON.parse(text);}catch{}
    return {
      state:response.ok?'PASS':'FAIL',
      status:response.status,
      url,
      schema:body?.schema||null,
      operation_id:body?.operation_id||null,
    };
  }catch(error){
    return {state:'WAIT_UNREACHABLE',status:null,url,error:String(error?.message||error)};
  }
}

function processLink(pid,name,{procRoot='/proc'}={}){
  try{return fs.realpathSync(path.join(procRoot,String(pid),name));}catch{return null;}
}
function processCmdline(pid,{procRoot='/proc'}={}){
  try{return fs.readFileSync(path.join(procRoot,String(pid),'cmdline'),'utf8').split('\0').filter(Boolean).join(' ').trim();}catch{return null;}
}
function parseListenerPid(text){
  const match=String(text||'').match(/pid=(\d+)/);
  return match?Number(match[1]):null;
}
function repoOriginMatches(origin,expectedRepo){
  const value=String(origin||'').replace(/\.git$/,'');
  return value===`https://github.com/${expectedRepo}`
    || value===`git@github.com:${expectedRepo}`
    || value.endsWith(`github.com/${expectedRepo}`);
}
export function inspectLocalHttpRuntime({
  port=8791,
  expectedRepo='Vado42-chris/xi-io-Inbox',
  exec=run,
  env=process.env,
  procRoot='/proc',
  providerRead=true,
}={}){
  const ss=exec('ss',['-ltnpH',`sport = :${port}`],{env,timeout:3000});
  const pid=parseListenerPid(ss.stdout);
  if(!pid){
    return {
      schema:'xiio.cli.runtime-observation/v1',state:'ABSENT_LISTENER',port,pid:null,
      executable:null,cwd:null,command:null,repo_state:'UNKNOWN',
      local_head:null,provider_main:null,generation_state:'UNKNOWN',effect_authority:0,
    };
  }
  const executable=processLink(pid,'exe',{procRoot});
  const cwd=processLink(pid,'cwd',{procRoot});
  const command=processCmdline(pid,{procRoot});
  if(!cwd || !dir(cwd)){
    return {
      schema:'xiio.cli.runtime-observation/v1',state:'LISTENER_PATH_UNREADABLE',
      port,pid,executable,cwd,command,repo_state:'UNKNOWN',
      local_head:null,provider_main:null,generation_state:'UNKNOWN',effect_authority:0,
    };
  }
  const inside=exec('git',['rev-parse','--is-inside-work-tree'],{cwd,env});
  if(inside.stdout!=='true'){
    return {
      schema:'xiio.cli.runtime-observation/v1',state:'LISTENER_NOT_GIT_CHECKOUT',
      port,pid,executable,cwd:real(cwd),command,repo_state:'NOT_GIT',
      local_head:null,provider_main:null,generation_state:'UNKNOWN',effect_authority:0,
    };
  }
  const top=exec('git',['rev-parse','--show-toplevel'],{cwd,env});
  const head=exec('git',['rev-parse','HEAD'],{cwd,env});
  const origin=exec('git',['remote','get-url','origin'],{cwd,env});
  const dirty=exec('git',['status','--porcelain=v1'],{cwd,env});
  const canonicalOrigin=repoOriginMatches(origin.stdout,expectedRepo);
  let provider_main=null;
  let provider_state='NOT_REQUESTED';
  if(providerRead && canonicalOrigin){
    const remote=exec('git',['ls-remote','origin','refs/heads/main'],{cwd,env,timeout:8000});
    const match=remote.stdout.match(/^([0-9a-f]{40})\s+/);
    if(remote.ok && match){provider_main=match[1];provider_state='PASS';}
    else provider_state='WAIT_UNREADABLE';
  }
  const local_head=/^[0-9a-f]{40}$/.test(head.stdout)?head.stdout:null;
  const generation_state=provider_main&&local_head
    ? (provider_main===local_head?'EXACT_PROVIDER_MAIN':'DIFFERENT_FROM_PROVIDER_MAIN')
    : 'UNKNOWN';
  const repo_state=canonicalOrigin?'PASS':'WRONG_ORIGIN';
  const state=repo_state!=='PASS'?'WRONG_REPO'
    :generation_state==='EXACT_PROVIDER_MAIN'?'PASS_CURRENT'
    :generation_state==='DIFFERENT_FROM_PROVIDER_MAIN'?'RED_STALE_OR_NONPROVIDER'
    :'UNKNOWN_CURRENTNESS';
  return {
    schema:'xiio.cli.runtime-observation/v1',state,port,pid,executable,cwd:real(cwd),
    git_root:top.ok?real(top.stdout):null,command,repo_state,origin:origin.stdout||null,
    expected_repo:expectedRepo,local_head,provider_main,provider_state,generation_state,
    dirty_state:dirty.ok?(dirty.stdout?'DIRTY':'CLEAN'):'UNKNOWN',
    process_identity_state:'BOUND',effect_authority:0,
    hard:[
      'LISTENER_HEALTH != GENERATION_CURRENT',
      'PROCESS_CWD != PROVIDER_CURRENT',
      'LOCAL_HEAD != PROVIDER_MAIN_UNLESS_EXACT',
      'BOUND_RUNTIME != CURRENT_RUNTIME',
    ],
  };
}

function chooseFramework({cwd,env,volume,exec,providerRead}){
  const gitTop=exec('git',['rev-parse','--show-toplevel'],{cwd,env});
  const candidates=[
    env.XIIO_FRAMEWORK_ROOT||null,
    gitTop.ok?gitTop.stdout:null,
    volume?path.join(volume,'999_Work','003_Projects','003_xi-io_net'):null,
  ];
  const unique=uniq(candidates.map(real));
  const observations=unique.map(candidate=>frameworkIdentity(candidate,{exec,env,providerRead}));
  const selected=observations.find(row=>row.state==='PASS')||null;
  return {selected,observations};
}

export async function compileLocalCompass({
  cwd=process.cwd(),
  env=process.env,
  sdkRoot=null,
  hostname=os.hostname().split('.')[0].toLowerCase(),
  exec=run,
  probe=probeJson,
  providerRead=env.XIIO_COMPASS_PROVIDER_READ!=='0',
  runtimeInspect=inspectLocalHttpRuntime,
}={}){
  const observed_at=new Date().toISOString();
  const home=real(env.HOME||os.homedir());
  const workspace=real(cwd);
  const volume=volumeRoot(workspace,env);

  const common=firstExisting([
    env.XIIO_COMMON_ROOT||null,
    ancestorNamed(workspace,'xi-io_common'),
    volume?path.join(volume,'002_Work','xi-io_common'):null,
  ]);
  const studio=firstExisting([
    env.XIIO_STUDIO_FINAL_ROOT||null,
    ancestorNamed(workspace,'xi-io-studio'),
    volume?path.join(volume,'001_Flatpack_installs','xi-io-studio'):null,
  ]);
  const framework=chooseFramework({cwd:workspace,env,volume,exec,providerRead});
  const services=discoverRunnerServices({exec});
  const listener=discoverRunnerListener({exec});
  const runner={
    state:listener?'PASS':services.length?'PARTIAL':'UNKNOWN_NOT_DEEP_SCANNED',
    listener_count:listener?.lines||0,
    listener_dirs:listener?.runner_dirs||[],
    services:services.map(({scope,unit,state})=>({scope,unit,state})),
    next:listener?'OBSERVE_PROVIDER_JOB':services.length?'START_OR_INSPECT_EXISTING_SERVICE':'xi-io runner discover',
  };
  const ollama=await probe(env.OLLAMA_HOST?String(env.OLLAMA_HOST).replace(/\/$/,'')+'/api/tags':'http://127.0.0.1:11434/api/tags');
  const glass=await probe(env.XIIO_API_GLASS_BOX_READ_URL||'http://127.0.0.1:4390/api/v1/studio/local-truth/read');
  const inboxRuntime=runtimeInspect({
    port:Number(env.XIIO_INBOX_RUNTIME_PORT||8791),
    expectedRepo:env.XIIO_INBOX_RUNTIME_REPO||'Vado42-chris/xi-io-Inbox',
    exec,env,providerRead,
  });

  const frameworkRow=framework.selected;
  const cells=[
    {id:'HOME',state:home&&dir(home)?'PASS':'FAIL',value:home},
    {id:'WORKSPACE',state:workspace&&dir(workspace)?'PASS':'FAIL',value:workspace},
    {id:'VOLUME',state:volume&&dir(volume)?'PASS':'UNKNOWN',value:volume},
    {id:'COMMON',state:common.selected?'PASS':'UNKNOWN',value:common.selected},
    {id:'STUDIO',state:studio.selected?'PASS':'UNKNOWN',value:studio.selected},
    {id:'FRAMEWORK',state:frameworkRow?'PASS':'FAIL',value:frameworkRow?.path||null},
    {id:'FRAMEWORK_CURRENTNESS',state:frameworkRow?.generation_state==='EXACT_PROVIDER_MAIN'?'PASS':frameworkRow?.provider_state==='PASS'?'RED':'UNKNOWN',value:frameworkRow?.generation_state||'UNKNOWN'},
    {id:'SDK',state:sdkRoot&&dir(sdkRoot)?'PASS':'FAIL',value:sdkRoot?real(sdkRoot):null},
    {id:'RUNNER',state:runner.state==='PASS'?'PASS':runner.state==='PARTIAL'?'RED':'UNKNOWN',value:runner.state},
    {id:'OLLAMA',state:ollama.state==='PASS'?'PASS':'RED',value:ollama.state},
    {id:'API_GLASS_BOX',state:glass.state==='PASS'?'PASS':'RED',value:glass.state},
    {id:'INBOX_RUNTIME',state:inboxRuntime.state==='PASS_CURRENT'?'PASS':inboxRuntime.state==='ABSENT_LISTENER'?'UNKNOWN':'RED',value:inboxRuntime.state},
  ];
  const firstRed=cells.find(row=>row.state==='FAIL'||row.state==='RED')||cells.find(row=>row.state==='UNKNOWN')||null;
  const pass=cells.filter(row=>row.state==='PASS').length;
  const red=cells.filter(row=>row.state==='RED'||row.state==='FAIL').length;
  const unknown=cells.filter(row=>row.state==='UNKNOWN').length;
  return {
    schema:'xiio.cli.compass/v1',
    observed_at,
    node_ref:`node.${hostname}`,
    state:red===0&&unknown===0?'PASS':'MAP_WITH_REDS',
    denominator:cells.length,
    pass,red,unknown,
    first_red:firstRed?.id||null,
    cells,
    machine:{home,workspace,volume_root:volume,user:env.USER||path.basename(home||'')},
    roots:{
      common:{state:common.selected?'PASS':'UNKNOWN',path:common.selected,candidates:common.candidates},
      studio:{state:studio.selected?'PASS':'UNKNOWN',path:studio.selected,candidates:studio.candidates},
      framework:{state:frameworkRow?'PASS':'FAIL',selected:frameworkRow,observations:framework.observations},
      sdk:{state:sdkRoot&&dir(sdkRoot)?'PASS':'FAIL',path:sdkRoot?real(sdkRoot):null},
    },
    runtime:{runner,ollama,api_glass_box:glass,inbox:inboxRuntime},
    provider_effect:false,
    authority_granted:false,
    local_state_effect:'RECEIPT_ONLY',
    hard:[
      'NODE_REF != AGENT_REF != PERSONA_REF',
      'DECLARED_PATH != PHYSICAL_PATH',
      'PHYSICAL_PATH != CURRENT_GENERATION',
      'LOCAL_HEAD != PROVIDER_MAIN_UNLESS_EXACT',
      'RUNNER_SERVICE != RUNNER_LISTENER != PROVIDER_JOB',
      'HTTP_2XX != EFFECT_AUTHORITY',
      'UNKNOWN != ABSENT',
    ],
    next:firstRed?.id==='FRAMEWORK'?'FIX_OR_DISCOVER_PHYSICAL_FRAMEWORK_ROOT'
      :firstRed?.id==='FRAMEWORK_CURRENTNESS'?'REJOIN_FRAMEWORK_TO_PROVIDER_CURRENT'
      :firstRed?.id==='RUNNER'?'xi-io runner discover'
      :firstRed?.id==='API_GLASS_BOX'?'RECOVER_DEV_API_GLASS_BOX'
      :firstRed?.id==='OLLAMA'?'RECOVER_LOCAL_OLLAMA'
      :firstRed?.id==='INBOX_RUNTIME'?'REJOIN_INBOX_RUNTIME_TO_PROVIDER_CURRENT'
      :firstRed?'RESOLVE_FIRST_RED':'READY',
  };
}

export function writeCompassReceipt(compass,{env=process.env}={}){
  const home=env.HOME||os.homedir();
  const stateRoot=path.join(env.XDG_STATE_HOME||path.join(home,'.local','state'),'xi-io','compass');
  fs.mkdirSync(stateRoot,{recursive:true,mode:0o700});
  const current=path.join(stateRoot,'current.json');
  const history=path.join(stateRoot,'history.ndjson');
  const payload=JSON.stringify(compass,null,2)+'\n';
  fs.writeFileSync(current,payload,{encoding:'utf8',mode:0o600});
  fs.appendFileSync(history,JSON.stringify(compass)+'\n',{encoding:'utf8',mode:0o600});
  return {current,history};
}
