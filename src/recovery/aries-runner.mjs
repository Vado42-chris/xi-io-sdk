import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

function run(command,args,{cwd,env=process.env,timeout=15000}={}){
  const result=spawnSync(command,args,{cwd,env,encoding:'utf8',timeout,maxBuffer:4*1024*1024});
  return {
    ok:!result.error && result.status===0,
    status:Number.isInteger(result.status)?result.status:null,
    stdout:String(result.stdout||''),
    stderr:String(result.stderr||''),
    error:result.error?String(result.error.message||result.error):null,
  };
}
function sleep(ms){Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);}
function sha(value){return 'sha256:'+createHash('sha256').update(String(value||'')).digest('hex');}
function card(id,label,state,proof_ref=null,blocker=null){return {id,label,state,proof_ref,blocker};}
function uniq(rows){return [...new Set(rows.filter(Boolean))];}

function parseUnits(text,scope){
  const out=[];
  for(const line of String(text||'').split(/\r?\n/)){
    const unit=line.trim().split(/\s+/)[0];
    if(!unit || !unit.endsWith('.service')) continue;
    if(!unit.startsWith('actions.runner.') && unit!=='xiio-github-actions-runner.service') continue;
    out.push({scope,unit});
  }
  return out;
}

export function discoverRunnerServices({exec=run}={}){
  const system=exec('systemctl',['list-unit-files','actions.runner.*.service','xiio-github-actions-runner.service','--no-legend']);
  const user=exec('systemctl',['--user','list-unit-files','actions.runner.*.service','xiio-github-actions-runner.service','--no-legend']);
  const rows=[...parseUnits(system.stdout,'system'),...parseUnits(user.stdout,'user')];
  const keyed=new Map(rows.map(r=>[`${r.scope}:${r.unit}`,r]));
  const services=[...keyed.values()];
  for(const row of services){
    const args=row.scope==='user'?['--user','is-active',row.unit]:['is-active',row.unit];
    const state=exec('systemctl',args);
    row.state=state.stdout.trim()||'inactive';
  }
  return services;
}

export function discoverRunnerListener({exec=run}={}){
  const r=exec('pgrep',['-af','Runner.Listener']);
  const lines=r.stdout.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!lines.length) return null;
  const paths=[];
  for(const line of lines){
    const m=line.match(/\s(\/[^\s]*\/bin\/Runner\.Listener)(?:\s|$)/);
    if(m) paths.push(path.resolve(path.dirname(m[1]),'..'));
  }
  return {state:'RUNNING',lines:lines.length,runner_dirs:uniq(paths)};
}

export function runnerSearchRoots(env=process.env){
  const explicit=String(env.XIIO_RUNNER_SEARCH_ROOTS||'').split(':').map(x=>x.trim()).filter(Boolean);
  if(explicit.length) return uniq(explicit.filter(p=>fs.existsSync(p)));
  const user=env.USER||path.basename(os.homedir());
  return uniq([
    os.homedir(),
    path.join('/media',user),
    '/opt','/srv','/mnt',
  ].filter(p=>fs.existsSync(p)));
}

export function discoverRunnerDirs({env=process.env,exec=run}={}){
  const rows=[];
  for(const root of runnerSearchRoots(env)){
    const r=exec('find',[root,'-maxdepth','12','-type','f','-name','.runner','-print'],{timeout:30000});
    for(const marker of r.stdout.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)){
      const dir=path.dirname(marker);
      if(fs.existsSync(path.join(dir,'run.sh')) || fs.existsSync(path.join(dir,'bin','Runner.Listener'))) rows.push(dir);
    }
  }
  return uniq(rows);
}

function chooseRunner({services,listener,dirs}){
  const active=services.filter(s=>s.state==='active');
  if(active.length===1) return {kind:'service',...active[0]};
  if(active.length>1) return {kind:'blocked',first_red:'AMBIGUOUS_ACTIVE_RUNNER_SERVICES'};
  if(listener?.runner_dirs?.length===1) return {kind:'listener',runner_dir:listener.runner_dirs[0]};
  if(listener && listener.runner_dirs.length===0) return {kind:'listener',runner_dir:null};
  if(services.length===1) return {kind:'service',...services[0]};
  if(services.length>1) return {kind:'blocked',first_red:'AMBIGUOUS_RUNNER_SERVICES'};
  if(dirs.length===1) return {kind:'run_sh',runner_dir:dirs[0]};
  if(dirs.length>1) return {kind:'blocked',first_red:'AMBIGUOUS_RUNNER_REGISTRATIONS'};
  return {kind:'blocked',first_red:'RUNNER_SERVICE_AND_REGISTRATION_NOT_FOUND'};
}

function startExisting(choice,{exec=run,env=process.env}={}){
  if(choice.kind==='listener') return {ok:true,mutation:'NONE',state:'active-process'};
  if(choice.kind==='service'){
    if(choice.state==='active') return {ok:true,mutation:'NONE',state:'active'};
    if(choice.scope==='user'){
      const r=exec('systemctl',['--user','start',choice.unit],{env});
      const state=exec('systemctl',['--user','is-active',choice.unit],{env}).stdout.trim();
      return {ok:r.ok&&state==='active',mutation:'START_EXISTING_USER_SERVICE',state,stderr:r.stderr};
    }
    let r=exec('systemctl',['start',choice.unit],{env});
    if(!r.ok) r=exec('sudo',['-n','systemctl','start',choice.unit],{env});
    const state=exec('systemctl',['is-active',choice.unit],{env}).stdout.trim();
    return {ok:r.ok&&state==='active',mutation:'START_EXISTING_SYSTEM_SERVICE',state,stderr:r.stderr};
  }
  if(choice.kind==='run_sh'){
    const runSh=path.join(choice.runner_dir,'run.sh');
    if(!fs.existsSync(runSh)) return {ok:false,mutation:'NONE',state:'missing',stderr:'RUN_SH_MISSING'};
    const stateRoot=path.join(env.XDG_STATE_HOME||path.join(os.homedir(),'.local','state'),'xi-io','runner-recovery');
    fs.mkdirSync(stateRoot,{recursive:true,mode:0o700});
    const log=path.join(stateRoot,`runner-${Date.now()}.log`);
    const fd=fs.openSync(log,'a',0o600);
    const child=spawn(runSh,[],{cwd:choice.runner_dir,env,detached:true,stdio:['ignore',fd,fd]});
    child.unref();
    fs.closeSync(fd);
    sleep(1500);
    const listener=discoverRunnerListener({exec});
    return {ok:Boolean(listener),mutation:'START_EXISTING_RUN_SH',state:listener?'active-process':'failed',log_ref:log};
  }
  return {ok:false,mutation:'NONE',state:'blocked',stderr:choice.first_red||'UNKNOWN'};
}

function parseJson(text){try{return JSON.parse(text);}catch{return null;}}
function readTargetJob({repo,runId,jobId,headSha,exec=run}){
  if(!repo || !runId) return {state:'NOT_REQUESTED',provider_effect:false};
  const runRes=exec('gh',['api',`repos/${repo}/actions/runs/${runId}`],{timeout:15000});
  const runBody=parseJson(runRes.stdout);
  if(!runRes.ok || !runBody) return {state:'RUN_UNREADABLE',run_id:String(runId),provider_effect:false};
  if(headSha && runBody.head_sha!==headSha) return {state:'HEAD_MISMATCH',run_id:String(runId),observed_head:runBody.head_sha,expected_head:headSha,provider_effect:false};
  const jobsRes=exec('gh',['api',`repos/${repo}/actions/runs/${runId}/jobs`],{timeout:15000});
  const jobsBody=parseJson(jobsRes.stdout);
  if(!jobsRes.ok || !jobsBody) return {state:'JOBS_UNREADABLE',run_id:String(runId),provider_effect:false};
  const jobs=jobsBody.jobs||[];
  const job=jobId?jobs.find(j=>String(j.id)===String(jobId)):jobs[0];
  if(!job) return {state:'JOB_NOT_FOUND',run_id:String(runId),job_id:jobId?String(jobId):null,provider_effect:false};
  return {
    state:String(job.status||'UNKNOWN').toUpperCase(),
    run_id:String(runId),
    job_id:String(job.id),
    runner_id:job.runner_id||0,
    runner_name:job.runner_name||null,
    steps:Array.isArray(job.steps)?job.steps.length:0,
    conclusion:job.conclusion||null,
    head_sha:runBody.head_sha||null,
    provider_effect:false,
  };
}

export function recoverAriesRunner({
  execute=false,
  env=process.env,
  host=os.hostname().split('.')[0].toLowerCase(),
  targetRepo=env.XIIO_RUNNER_RECOVERY_REPO||null,
  targetRunId=env.XIIO_RUNNER_RECOVERY_RUN_ID||null,
  targetJobId=env.XIIO_RUNNER_RECOVERY_JOB_ID||null,
  targetHeadSha=env.XIIO_RUNNER_RECOVERY_HEAD_SHA||null,
  waitSeconds=Number(env.XIIO_RUNNER_RECOVERY_WAIT_SECONDS||120),
  exec=run,
}={}){
  const observed_at=new Date().toISOString();
  const services=discoverRunnerServices({exec});
  const listener=discoverRunnerListener({exec});
  const dirs=listener?[]:discoverRunnerDirs({env,exec});
  const choice=chooseRunner({services,listener,dirs});
  const hostPass=host==='aries';
  const identityPass=choice.kind!=='blocked';
  const punchcards=[
    card('PC01','HUMAN_CLI_ENTRY','PASS','xi-io recover aries-runner'),
    card('PC02','HOST_IS_ARIES',hostPass?'PASS':'BLOCKED',host,hostPass?null:'WRONG_HOST'),
    card('PC03','EXISTING_RUNNER_IDENTITY',identityPass?'PASS':'BLOCKED',identityPass?choice.kind:null,identityPass?null:choice.first_red),
    card('PC04','NO_NEW_REGISTRATION','PASS','hard-boundary'),
    card('PC05','NO_TOKEN_MINT','PASS','hard-boundary'),
    card('PC06','ATTEMPT',execute&&hostPass&&identityPass?'READY':'WAIT',null,execute?'PREFLIGHT_BLOCKED':'EXECUTE_NOT_REQUESTED'),
    card('PC07','RUNNER_LISTENER','WAIT'),
    card('PC08','PROVIDER_JOB','WAIT'),
    card('PC09','RESULT','WAIT'),
    card('PC10','RETURN_APPLY_REAP','WAIT'),
  ];
  const first_red=!hostPass?'WRONG_HOST':!identityPass?choice.first_red:null;
  const base={
    schema:'xiio.cli.aries-runner-recovery/v2',observed_at,mode:execute?'EXECUTE':'PLAN',
    host,choice,services,listener_observed:Boolean(listener),search_roots:runnerSearchRoots(env),
    authority:{existing_runner_start:execute&&hostPass&&identityPass,new_registration:false,token:false,source_mutation:false,provider_effect:false},
    punchcards,
    provider_effect:false,
  };
  if(first_red || !execute){
    return {...base,state:first_red?'BLOCKED':'PLAN_READY',first_red:first_red||'EXECUTE_NOT_REQUESTED',next:first_red?'FIX_FIRST_RED':'RE-RUN_WITH_--execute'};
  }

  const start=startExisting(choice,{exec,env});
  punchcards[5]=card('PC06','ATTEMPT',start.ok?'PASS':'BLOCKED',start.mutation,start.ok?null:'RUNNER_START_FAILED');
  if(!start.ok) return {...base,state:'BLOCKED',first_red:'RUNNER_START_FAILED',start,punchcards,next:'FIX_EXISTING_RUNNER_START'};

  let provider=readTargetJob({repo:targetRepo,runId:targetRunId,jobId:targetJobId,headSha:targetHeadSha,exec});
  const deadline=Date.now()+Math.max(0,waitSeconds)*1000;
  while(targetRunId && provider.state==='QUEUED' && Date.now()<deadline){
    sleep(2500);
    provider=readTargetJob({repo:targetRepo,runId:targetRunId,jobId:targetJobId,headSha:targetHeadSha,exec});
  }
  const listenerAfter=discoverRunnerListener({exec});
  punchcards[6]=card('PC07','RUNNER_LISTENER',listenerAfter?'PASS':'BLOCKED',listenerAfter?'Runner.Listener':null,listenerAfter?null:'RUNNER_LISTENER_NOT_OBSERVED');
  const providerPass=['IN_PROGRESS','COMPLETED'].includes(provider.state) && Number(provider.runner_id||0)>0 && Number(provider.steps||0)>0;
  const providerWait=provider.state==='QUEUED';
  punchcards[7]=card('PC08','PROVIDER_JOB',providerPass?'PASS':providerWait?'WAIT':'BLOCKED',provider.state,providerPass||providerWait?null:`PROVIDER_${provider.state}`);
  punchcards[8]=card('PC09','RESULT',listenerAfter&&(providerPass||!targetRunId)?'PASS':providerWait?'WAIT':'BLOCKED',start.mutation);
  punchcards[9]=card('PC10','RETURN_APPLY_REAP',providerPass?'PASS':providerWait?'WAIT':'WAIT',provider.job_id||null,providerPass?null:'WAIT_PROVIDER_EXECUTION');

  if(!listenerAfter) return {...base,state:'BLOCKED',first_red:'RUNNER_LISTENER_NOT_OBSERVED',start,provider,punchcards,next:'INSPECT_EXISTING_RUNNER_LOG'};
  if(targetRunId && !providerPass){
    return {...base,state:providerWait?'WAIT_PROVIDER':'BLOCKED',first_red:providerWait?'PROVIDER_JOB_STILL_QUEUED':`PROVIDER_${provider.state}`,start,provider,punchcards,next:'REOBSERVE_PROVIDER_JOB'};
  }
  return {...base,state:'PASS_RUNTIME_RECOVERY',first_red:null,start,provider,punchcards,return_apply_reap:'COMPLETE_FOR_RUNNER_RECOVERY',next:'REOBSERVE_DEPENDENT_ROTFL_RUNTIME'};
}
