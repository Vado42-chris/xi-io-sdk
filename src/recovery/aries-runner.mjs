import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const EXPECTED_ORIGIN=/^(?:git@github\.com:|https:\/\/github\.com\/)Vado42-chris\/xi-io-Inbox(?:\.git)?$/;
const RECOVERY_REL='scripts/aries-runner-local-recovery.sh';

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
function sha(value){return 'sha256:'+createHash('sha256').update(String(value||'')).digest('hex');}
function card(id,label,state,proof_ref=null,blocker=null){
  return {id,label,state,proof_ref,blocker};
}
function git(repo,...args){return run('git',['-C',repo,...args]);}
function roots(env){
  const user=env.USER||path.basename(os.homedir());
  return [...new Set([path.join('/media',user),os.homedir()].filter(p=>fs.existsSync(p)))];
}
function findMatches(searchRoots,pattern){
  const rows=[];
  for(const root of searchRoots){
    const r=run('find',[root,'-maxdepth','12','-type','f','-path',pattern,'-print'],{timeout:20000});
    if(!r.ok && !r.stdout) continue;
    for(const line of r.stdout.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)) rows.push(line);
  }
  return rows;
}
function inspectCandidate(script){
  const repo=path.resolve(path.dirname(script),'..');
  const top=git(repo,'rev-parse','--show-toplevel');
  if(!top.ok) return null;
  const resolved=top.stdout.trim();
  const origin=git(resolved,'remote','get-url','origin');
  if(!origin.ok || !EXPECTED_ORIGIN.test(origin.stdout.trim())) return null;
  const head=git(resolved,'rev-parse','HEAD');
  const branch=git(resolved,'branch','--show-current');
  const dirty=git(resolved,'status','--porcelain');
  return {
    repo:resolved,
    script,
    origin:origin.stdout.trim(),
    head:head.ok?head.stdout.trim():'UNKNOWN',
    branch:branch.ok?branch.stdout.trim():'UNKNOWN',
    dirty:dirty.ok && Boolean(dirty.stdout.trim()),
    source:path.basename(path.dirname(path.dirname(script)))==='dogfood-runtime-main'?'DOGFOOD_WORKTREE':'INBOX_CHECKOUT',
  };
}
export function discoverInboxRecovery({env=process.env}={}){
  const candidates=[];
  const explicit=env.XIIO_DOGFOOD_WORKTREE;
  if(explicit){
    const script=path.join(explicit,RECOVERY_REL);
    if(fs.isFileSync(script)) candidates.push(script);
  }
  candidates.push(...findMatches(roots(env),'*/.tmp/worktrees/dogfood-runtime-main/'+RECOVERY_REL));
  if(!candidates.length) candidates.push(...findMatches(roots(env),'*/xi-io-Inbox/'+RECOVERY_REL));
  const inspected=[...new Set(candidates)].map(inspectCandidate).filter(Boolean);
  if(!inspected.length) return {state:'BLOCKED',first_red:'INBOX_RECOVERY_CHECKOUT_NOT_FOUND',candidates:[]};
  const explicitResolved=explicit?fs.realpathSync(explicit):null;
  const preferred=inspected.find(x=>explicitResolved && x.repo===explicitResolved)
    || inspected.find(x=>x.script.includes('/.tmp/worktrees/dogfood-runtime-main/'))
    || (inspected.length===1?inspected[0]:null);
  if(!preferred) return {state:'BLOCKED',first_red:'AMBIGUOUS_INBOX_RECOVERY_CHECKOUT',candidates:inspected};
  return {state:'PASS',first_red:null,selected:preferred,candidates:inspected};
}
function parseRecoveryOutput(output){
  const map={};
  for(const line of String(output||'').split(/\r?\n/)){
    const m=line.match(/^([A-Z0-9_]+)=(.*)$/);
    if(m) map[m[1]]=m[2];
  }
  return map;
}
export function recoverAriesRunner({execute=false,env=process.env,host=os.hostname().split('.')[0].toLowerCase()}={}){
  const observed_at=new Date().toISOString();
  const discovery=discoverInboxRecovery({env});
  const punchcards=[
    card('PC01','HUMAN_CLI_ENTRY','PASS','xi-io recover aries-runner'),
    card('PC02','HOST_IS_ARIES',host==='aries'?'PASS':'BLOCKED',host,host==='aries'?null:'WRONG_HOST'),
    card('PC03','INBOX_CHECKOUT_DISCOVERED',discovery.state==='PASS'?'PASS':'BLOCKED',discovery.selected?.repo||null,discovery.first_red),
    card('PC04','INBOX_ORIGIN_IDENTITY',discovery.selected&&EXPECTED_ORIGIN.test(discovery.selected.origin)?'PASS':'BLOCKED',discovery.selected?.origin||null,discovery.selected?'WRONG_ORIGIN':'NO_CHECKOUT'),
    card('PC05','CURRENT_RECOVERY_PRIMITIVE_RESOLVABLE','UNPROVEN',null,'PROVIDER_CURRENT_SCRIPT_NOT_YET_BOUND'),
    card('PC06','EFFECT_BOUNDARY_EXISTING_RUNNER_ONLY','PASS','scripts/aries-runner-local-recovery.sh'),
    card('PC07','ATTEMPT','WAIT',null,execute?'PREFLIGHT_NOT_COMPLETE':'EXECUTE_NOT_REQUESTED'),
    card('PC08','RESULT','WAIT',null,'NO_ATTEMPT_RESULT'),
    card('PC09','PROVIDER_READBACK','WAIT',null,'NO_RUNTIME_RESULT'),
    card('PC10','RETURN_APPLY_REAP','WAIT',null,'NO_RUNTIME_RESULT'),
  ];
  const checklist={
    host_is_aries:host==='aries',
    inbox_checkout_discovered:discovery.state==='PASS',
    correct_origin:Boolean(discovery.selected&&EXPECTED_ORIGIN.test(discovery.selected.origin)),
    destructive_git_operations:false,
    new_runner_registration:false,
    runner_token_creation:false,
    provider_mutation:false,
    path_owner_input_required:false,
  };
  let first_red=punchcards.find(x=>x.state==='BLOCKED')?.blocker||null;
  if(first_red || !execute){
    return {
      schema:'xiio.cli.aries-runner-recovery/v1',
      observed_at,
      mode:execute?'EXECUTE_BLOCKED':'PLAN',
      state:first_red?'BLOCKED':'PLAN_READY',
      first_red:first_red||'EXECUTE_NOT_REQUESTED',
      checklist,
      punchcards,
      scorecard:{micro:'PASS',meso:first_red?'BLOCKED':'PASS',macro:'WAIT',meta:'WAIT',closure:false},
      discovery,
      authority:{start_existing_runner:execute && !first_red,new_registration:false,token:false,source_mutation:false,provider_effect:false},
      next:first_red?'FIX_FIRST_RED':'RE-RUN_WITH_--execute',
    };
  }

  const repo=discovery.selected.repo;
  const fetch=git(repo,'fetch','origin','main','--quiet');
  if(!fetch.ok){
    punchcards[4]=card('PC05','CURRENT_RECOVERY_PRIMITIVE_RESOLVABLE','BLOCKED',null,'ORIGIN_MAIN_FETCH_FAILED');
    return {
      schema:'xiio.cli.aries-runner-recovery/v1',observed_at,mode:'EXECUTE',state:'BLOCKED',
      first_red:'ORIGIN_MAIN_FETCH_FAILED',checklist,punchcards,
      scorecard:{micro:'PASS',meso:'BLOCKED',macro:'WAIT',meta:'WAIT',closure:false},
      discovery,fetch:{status:fetch.status,stderr_digest:sha(fetch.stderr)},next:'RESTORE_GIT_PROVIDER_READ_THEN_RETRY'
    };
  }
  const show=git(repo,'show','origin/main:'+RECOVERY_REL);
  if(!show.ok || !show.stdout.includes('ARIES_RUNNER_RECOVERY=')){
    punchcards[4]=card('PC05','CURRENT_RECOVERY_PRIMITIVE_RESOLVABLE','BLOCKED',null,'PROVIDER_CURRENT_RECOVERY_PRIMITIVE_MISSING');
    return {
      schema:'xiio.cli.aries-runner-recovery/v1',observed_at,mode:'EXECUTE',state:'BLOCKED',
      first_red:'PROVIDER_CURRENT_RECOVERY_PRIMITIVE_MISSING',checklist,punchcards,
      scorecard:{micro:'PASS',meso:'BLOCKED',macro:'WAIT',meta:'WAIT',closure:false},
      discovery,next:'RECOVER_ACCEPTED_INBOX_PRIMITIVE'
    };
  }
  punchcards[4]=card('PC05','CURRENT_RECOVERY_PRIMITIVE_RESOLVABLE','PASS','origin/main:'+RECOVERY_REL);

  const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-aries-runner-recovery-'));
  const tempScript=path.join(tempRoot,'aries-runner-local-recovery.sh');
  fs.writeFileSync(tempScript,show.stdout,{encoding:'utf8',mode:0o700});
  let attempt;
  try{
    attempt=run('bash',[tempScript],{
      cwd:repo,
      env:{...env,XIIO_DOGFOOD_WORKTREE:repo},
      timeout:180000,
    });
  } finally {
    try{fs.rmSync(tempRoot,{recursive:true,force:true});}catch{}
  }
  punchcards[6]=card('PC07','ATTEMPT','PASS','bash provider-current recovery primitive');
  const parsed=parseRecoveryOutput(attempt.stdout+'\n'+attempt.stderr);
  if(!attempt.ok || parsed.ARIES_RUNNER_RECOVERY!=='PASS'){
    punchcards[7]=card('PC08','RESULT','BLOCKED',null,parsed.first_red||parsed.FIRST_RED||'RECOVERY_SCRIPT_FAILED');
    return {
      schema:'xiio.cli.aries-runner-recovery/v1',observed_at,mode:'EXECUTE',state:'BLOCKED',
      first_red:parsed.first_red||parsed.FIRST_RED||'RECOVERY_SCRIPT_FAILED',checklist,punchcards,
      scorecard:{micro:'PASS',meso:'PASS',macro:'BLOCKED',meta:'WAIT',closure:false},
      discovery,result:{exit_code:attempt.status,stdout_digest:sha(attempt.stdout),stderr_digest:sha(attempt.stderr),parsed},
      next:'FIX_RETURNED_FIRST_RED_AND_RETRY'
    };
  }
  punchcards[7]=card('PC08','RESULT','PASS',parsed.RECEIPT||'ARIES_RUNNER_RECOVERY=PASS');
  const providerState=parsed.PROVIDER_STATE||'UNPROVEN';
  const providerGood=/EXECUTING|COMPLETED_/.test(providerState);
  punchcards[8]=card('PC09','PROVIDER_READBACK',providerGood?'PASS':'WAIT',providerState,providerGood?null:'PROVIDER_JOB_NOT_YET_EXECUTING');
  punchcards[9]=card('PC10','RETURN_APPLY_REAP',providerGood?'PASS':'WAIT',parsed.RECEIPT||null,providerGood?null:'WAIT_PROVIDER_EXECUTION');

  return {
    schema:'xiio.cli.aries-runner-recovery/v1',
    observed_at,
    mode:'EXECUTE',
    state:providerGood?'PASS_RUNTIME_RECOVERY':'WAIT_PROVIDER',
    first_red:providerGood?null:'PROVIDER_JOB_NOT_YET_EXECUTING',
    checklist,
    punchcards,
    scorecard:{micro:'PASS',meso:'PASS',macro:providerGood?'PASS':'WAIT',meta:providerGood?'PASS':'WAIT',closure:providerGood},
    discovery,
    result:{exit_code:attempt.status,parsed,stdout_digest:sha(attempt.stdout),stderr_digest:sha(attempt.stderr)},
    return_apply_reap:providerGood?'COMPLETE_FOR_RUNNER_RECOVERY':'WAIT_PROVIDER_EXECUTION',
    authority:{start_existing_runner:true,new_registration:false,token:false,source_mutation:false,provider_effect:false},
    next:providerGood?'REOBSERVE_DEPENDENT_ROTFL_RUNTIME':'REOBSERVE_PROVIDER_JOB'
  };
}
