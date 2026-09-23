import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { inspectLocalHttpRuntime } from '../compass/local-truth.mjs';

function run(command,args,{cwd,env=process.env,timeout=15000}={}){
  const result=spawnSync(command,args,{cwd,env:{...env,GIT_OPTIONAL_LOCKS:'0'},encoding:'utf8',timeout,maxBuffer:4*1024*1024});
  return {
    ok:!result.error && result.status===0,
    status:Number.isInteger(result.status)?result.status:null,
    stdout:String(result.stdout||'').trim(),
    stderr:String(result.stderr||'').trim(),
    error:result.error?String(result.error.message||result.error):null,
  };
}
function sleep(ms){Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);}
function real(value){if(!value)return null;try{return fs.realpathSync(value);}catch{return path.resolve(value);}}
function isDir(value){try{return fs.statSync(value).isDirectory();}catch{return false;}}
function uniq(rows){return [...new Set(rows.filter(Boolean))];}
function volumeRoot(cwd,env=process.env){
  if(env.XIIO_VOLUME_ROOT && isDir(env.XIIO_VOLUME_ROOT)) return real(env.XIIO_VOLUME_ROOT);
  const resolved=real(cwd);
  if(!resolved)return null;
  const user=env.USER||path.basename(os.homedir());
  const mediaPrefix=path.join('/media',user)+path.sep;
  if(resolved.startsWith(mediaPrefix)){
    const rest=resolved.slice(mediaPrefix.length).split(path.sep).filter(Boolean);
    return rest.length?path.join('/media',user,rest[0]):null;
  }
  return null;
}
function originMatches(origin){
  const value=String(origin||'').replace(/\.git$/,'');
  return value==='https://github.com/Vado42-chris/xi-io-Inbox'
    || value==='git@github.com:Vado42-chris/xi-io-Inbox'
    || value.endsWith('github.com/Vado42-chris/xi-io-Inbox');
}
function inspectRepo(candidate,{exec=run,env=process.env,providerRead=true}={}){
  if(!candidate || !isDir(candidate)) return {state:'ABSENT',path:candidate||null};
  const inside=exec('git',['rev-parse','--is-inside-work-tree'],{cwd:candidate,env});
  if(inside.stdout!=='true') return {state:'NOT_GIT',path:real(candidate)};
  const top=exec('git',['rev-parse','--show-toplevel'],{cwd:candidate,env});
  const origin=exec('git',['remote','get-url','origin'],{cwd:candidate,env});
  const head=exec('git',['rev-parse','HEAD'],{cwd:candidate,env});
  const branch=exec('git',['branch','--show-current'],{cwd:candidate,env});
  const dirty=exec('git',['status','--porcelain=v1'],{cwd:candidate,env});
  const canonical=originMatches(origin.stdout);
  let provider_main=null;
  let provider_state='NOT_REQUESTED';
  if(providerRead && canonical){
    const remote=exec('git',['ls-remote','origin','refs/heads/main'],{cwd:candidate,env,timeout:8000});
    const m=remote.stdout.match(/^([0-9a-f]{40})\s+/);
    if(remote.ok&&m){provider_main=m[1];provider_state='PASS';}
    else provider_state='WAIT_UNREADABLE';
  }
  const local_head=/^[0-9a-f]{40}$/.test(head.stdout)?head.stdout:null;
  let relation='UNKNOWN';
  if(local_head&&provider_main){
    if(local_head===provider_main) relation='EXACT_PROVIDER_MAIN';
    else{
      const anc=exec('git',['merge-base','--is-ancestor',local_head,provider_main],{cwd:candidate,env});
      relation=anc.ok?'LOCAL_BEHIND_FAST_FORWARDABLE':'DIVERGED_OR_LOCAL_ONLY';
    }
  }
  const dirty_state=dirty.ok?(dirty.stdout?'DIRTY':'CLEAN'):'UNKNOWN';
  const state=!canonical?'WRONG_ORIGIN'
    :dirty_state!=='CLEAN'?'DIRTY'
    :relation==='EXACT_PROVIDER_MAIN'?'CURRENT_CLEAN'
    :relation==='LOCAL_BEHIND_FAST_FORWARDABLE'?'CLEAN_BEHIND'
    :relation==='DIVERGED_OR_LOCAL_ONLY'?'DIVERGED_OR_LOCAL_ONLY'
    :'UNKNOWN_CURRENTNESS';
  return {
    state,path:top.ok?real(top.stdout):real(candidate),origin:origin.stdout||null,
    branch:branch.stdout||null,local_head,provider_main,provider_state,relation,dirty_state,
  };
}
function candidateRepos({cwd=process.cwd(),env=process.env}={}){
  const volume=volumeRoot(cwd,env);
  const user=env.USER||path.basename(os.homedir());
  return uniq([
    env.XIIO_INBOX_REPO||null,
    volume?path.join(volume,'999_Work','003_Projects','017_xi-io_inbox'):null,
    volume?path.join(volume,'999_Work','003_Projects','003_xi-io-Inbox'):null,
    volume?path.join(volume,'999_Work','003_Projects','xi-io-Inbox'):null,
    path.join(os.homedir(),'.cache','xi-io-inbox-main-tip'),
    path.join('/media',user,'Storage 22','999_Work','003_Projects','017_xi-io_inbox'),
  ]);
}
function chooseRepo(rows){
  const current=rows.filter(r=>r.state==='CURRENT_CLEAN');
  if(current.length===1)return {kind:'CURRENT',row:current[0]};
  if(current.length>1)return {kind:'BLOCKED',first_red:'AMBIGUOUS_CURRENT_INBOX_REPOS',rows:current};
  const behind=rows.filter(r=>r.state==='CLEAN_BEHIND' && r.branch==='main');
  if(behind.length===1)return {kind:'FAST_FORWARDABLE',row:behind[0]};
  if(behind.length>1)return {kind:'BLOCKED',first_red:'AMBIGUOUS_FAST_FORWARDABLE_INBOX_REPOS',rows:behind};
  return {kind:'BLOCKED',first_red:'NO_CLEAN_CURRENT_INBOX_REPO'};
}
function ffOnly(row,{exec=run,env=process.env}={}){
  const fetch=exec('git',['fetch','--prune','origin','main'],{cwd:row.path,env,timeout:30000});
  if(!fetch.ok)return {ok:false,first_red:'INBOX_FETCH_FAILED',stderr:fetch.stderr};
  const remote=exec('git',['rev-parse','origin/main'],{cwd:row.path,env});
  const local=exec('git',['rev-parse','HEAD'],{cwd:row.path,env});
  if(!remote.ok||!local.ok)return {ok:false,first_red:'INBOX_HEAD_READ_FAILED'};
  if(local.stdout===remote.stdout)return {ok:true,mutation:'NONE',head:local.stdout};
  const anc=exec('git',['merge-base','--is-ancestor',local.stdout,remote.stdout],{cwd:row.path,env});
  if(!anc.ok)return {ok:false,first_red:'INBOX_REPO_DIVERGED_NO_FF'};
  const merge=exec('git',['merge','--ff-only',remote.stdout],{cwd:row.path,env,timeout:30000});
  if(!merge.ok)return {ok:false,first_red:'INBOX_FF_FAILED',stderr:merge.stderr};
  return {ok:true,mutation:'FAST_FORWARD_CURRENT_REPO',head:remote.stdout};
}
function startOwnerRuntime(repo,{env=process.env}={}){
  const script=path.join(repo,'scripts','owner-dogfood-8791.sh');
  if(!fs.existsSync(script))return {ok:false,first_red:'OWNER_DOGFOOD_SCRIPT_MISSING'};
  const stateRoot=path.join(env.XDG_STATE_HOME||path.join(os.homedir(),'.local','state'),'xi-io','inbox-runtime-recovery');
  fs.mkdirSync(stateRoot,{recursive:true,mode:0o700});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const log=path.join(stateRoot,`inbox-8791-${stamp}.log`);
  const fd=fs.openSync(log,'a',0o600);
  const nodeDir=path.dirname(process.execPath);
  const childEnv={
    ...env,
    XIIO_DOGFOOD_WORKTREE:repo,
    XIIO_MAIL_GMAIL_SEND_ENABLED:'0',
    PATH:`${nodeDir}:${env.PATH||''}`,
  };
  const child=spawn('bash',[script],{cwd:repo,env:childEnv,detached:true,stdio:['ignore',fd,fd]});
  child.unref();
  fs.closeSync(fd);
  return {ok:true,pid:child.pid,log,mutation:'START_EXISTING_OWNER_DOGFOOD_RUNTIME'};
}
function runHeadMatch(repo,expected,{env=process.env,exec=run}={}){
  const script=path.join(repo,'scripts','runtime-head-match-001-check.mjs');
  if(!fs.existsSync(script))return {state:'MISSING_CHECKER',status:null,stdout:'',stderr:''};
  const r=exec(process.execPath,[script],{
    cwd:repo,env:{...env,XIIO_LOCAL_WEB_PORT:'8791',XIIO_EXPECT_MAIN_SHA:expected},timeout:30000,
  });
  return {state:r.ok?'PASS':'FAIL',status:r.status,stdout:r.stdout,stderr:r.stderr};
}

export function recoverInboxRuntime({
  execute=false,
  cwd=process.cwd(),
  env=process.env,
  exec=run,
  runtimeInspect=inspectLocalHttpRuntime,
  waitSeconds=45,
}={}){
  const observed_at=new Date().toISOString();
  const before=runtimeInspect({port:8791,expectedRepo:'Vado42-chris/xi-io-Inbox',exec,env,providerRead:true});
  const repos=candidateRepos({cwd,env}).map(p=>inspectRepo(p,{exec,env,providerRead:true}));
  const choice=chooseRepo(repos);
  const base={
    schema:'xiio.cli.inbox-runtime-recovery/v1',observed_at,mode:execute?'EXECUTE':'PLAN',
    before,repositories:repos,choice,provider_effect:false,external_send:false,
    hard:[
      'DIRTY_RUNTIME_CHECKOUT != DISPOSABLE',
      'LOCAL_ONLY_ARCHAEOLOGY != CURRENT_RUNTIME_SOURCE',
      'TRACKED_DELTA_ALREADY_UPSTREAM != RESET_AUTHORITY',
      'SOURCE_CURRENT != RUNTIME_CURRENT',
      'RUNTIME_HEALTH != GENERATION_CURRENT',
      'GMAIL_SEND_DEFAULT_OFF',
    ],
  };
  if(choice.kind==='BLOCKED'){
    return {...base,state:'BLOCKED',first_red:choice.first_red,next:'RESOLVE_CLEAN_CURRENT_INBOX_REPO'};
  }
  if(!execute){
    return {...base,state:'PLAN_READY',first_red:before.state==='PASS_CURRENT'?null:'INBOX_RUNTIME_NOT_CURRENT',next:'xi-io recover inbox-runtime --execute'};
  }

  let selected=choice.row;
  let sourceMutation={ok:true,mutation:'NONE',head:selected.local_head};
  if(choice.kind==='FAST_FORWARDABLE'){
    sourceMutation=ffOnly(selected,{exec,env});
    if(!sourceMutation.ok)return {...base,state:'BLOCKED',first_red:sourceMutation.first_red,sourceMutation,next:'FIX_INBOX_CURRENT_REPO'};
    selected=inspectRepo(selected.path,{exec,env,providerRead:true});
  }
  if(selected.state!=='CURRENT_CLEAN'){
    return {...base,state:'BLOCKED',first_red:'INBOX_REPO_NOT_CURRENT_CLEAN_AFTER_PREP',selected,sourceMutation,next:'FIX_INBOX_CURRENT_REPO'};
  }

  const start=startOwnerRuntime(selected.path,{env});
  if(!start.ok)return {...base,state:'BLOCKED',first_red:start.first_red,selected,sourceMutation,start,next:'FIX_OWNER_RUNTIME_START'};

  const deadline=Date.now()+Math.max(1,Number(waitSeconds))*1000;
  let after=runtimeInspect({port:8791,expectedRepo:'Vado42-chris/xi-io-Inbox',exec,env,providerRead:true});
  while(after.state!=='PASS_CURRENT' && Date.now()<deadline){
    sleep(1000);
    after=runtimeInspect({port:8791,expectedRepo:'Vado42-chris/xi-io-Inbox',exec,env,providerRead:true});
  }
  const headMatch=runHeadMatch(selected.path,selected.provider_main,{env,exec});
  const pass=after.state==='PASS_CURRENT' && headMatch.state==='PASS';
  return {
    ...base,
    state:pass?'PASS_RUNTIME_CURRENT':'BLOCKED',
    first_red:pass?null:(after.state!=='PASS_CURRENT'?'INBOX_RUNTIME_GENERATION_MISMATCH':'RUNTIME_HEAD_MATCH_FAILED'),
    selected,sourceMutation,start,after,head_match:headMatch,
    return_apply_reap:pass?'COMPLETE_FOR_INBOX_RUNTIME_RECOVERY':'WAIT',
    next:pass?'REOBSERVE_COMPASS_AND_OWNER_UI':'INSPECT_RECOVERY_LOG_AND_RUNTIME_HEAD',
  };
}
