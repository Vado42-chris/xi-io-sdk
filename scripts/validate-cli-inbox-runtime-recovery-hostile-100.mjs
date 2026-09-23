#!/usr/bin/env node
import assert from 'node:assert/strict';
import { recoverInboxRuntime } from '../src/recovery/inbox-runtime.mjs';

let hostileCount=0;
let expected=0;
let falseGreen=0;
const failures=[];

function row(state,path,head='a'.repeat(40),provider='a'.repeat(40)){
  return {
    state,path,
    origin:'https://github.com/Vado42-chris/xi-io-Inbox.git',
    branch:'main',
    local_head:head,
    provider_main:provider,
    provider_state:'PASS',
    relation:head===provider?'EXACT_PROVIDER_MAIN':'LOCAL_BEHIND_FAST_FORWARDABLE',
    dirty_state:state==='DIRTY'?'DIRTY':'CLEAN',
  };
}
function runtime(state,head='a'.repeat(40),provider='a'.repeat(40)){
  return {
    schema:'xiio.cli.runtime-observation/v1',
    state,
    port:8791,
    pid:1534869,
    executable:'/home/tester/.nvm/versions/node/v24.11.1/bin/node',
    cwd:'/home/tester/.cache/xi-io-inbox-main-tip',
    git_root:'/home/tester/.cache/xi-io-inbox-main-tip',
    command:'node server/local-web-runtime.mjs',
    repo_state:'PASS',
    origin:'https://github.com/Vado42-chris/xi-io-Inbox.git',
    expected_repo:'Vado42-chris/xi-io-Inbox',
    local_head:head,
    provider_main:provider,
    provider_state:'PASS',
    generation_state:head===provider?'EXACT_PROVIDER_MAIN':'DIFFERENT_FROM_PROVIDER_MAIN',
    dirty_state:'CLEAN',
    process_identity_state:'BOUND',
    effect_authority:0,
  };
}
function record(id,fn){
  hostileCount++;
  try{fn();expected++;}
  catch(error){falseGreen++;failures.push({id,error:String(error?.message||error)});}
}

for(let i=0;i<100;i++){
  const group=Math.floor(i/10);
  const variant=i%10;
  const id=`INBOX_RECOVERY_${String(i+1).padStart(3,'0')}`;
  record(id,()=>{
    const current=row('CURRENT_CLEAN',`/repo/current-${variant}`);
    const dirty=row('DIRTY',`/repo/donor-${variant}`,'d'.repeat(40),'a'.repeat(40));
    const behind=row('CLEAN_BEHIND',`/repo/behind-${variant}`,'b'.repeat(40),'a'.repeat(40));
    let rows=[current,dirty];
    let before=runtime('RED_STALE_OR_NONPROVIDER','f'.repeat(40),'a'.repeat(40));
    let after=runtime('PASS_CURRENT');
    let execute=true;
    let prepApplied=false;
    let sourcePrep=()=>{prepApplied=true;return {ok:true,mutation:'FAST_FORWARD_CURRENT_REPO',head:'a'.repeat(40)};};
    let startRuntime=()=>({ok:true,pid:5000+variant,log:`/tmp/log-${variant}`,mutation:'START_EXISTING_OWNER_DOGFOOD_RUNTIME'});
    let headMatchCheck=()=>({state:'PASS',status:0,stdout:'8 PASS / 0 FAIL',stderr:''});
    let expectedState='PASS_RUNTIME_CURRENT';
    let expectedFirst=null;
    let expectedSelected=current.path;

    if(group===0){
      // golden: dirty donor coexists with one clean current repo; donor must not be selected
    }else if(group===1){
      rows=[dirty];
      expectedState='BLOCKED';
      expectedFirst='NO_CLEAN_CURRENT_INBOX_REPO';
      expectedSelected=null;
    }else if(group===2){
      rows=[current,row('CURRENT_CLEAN',`/repo/current2-${variant}`)];
      expectedState='BLOCKED';
      expectedFirst='AMBIGUOUS_CURRENT_INBOX_REPOS';
      expectedSelected=null;
    }else if(group===3){
      rows=[behind,dirty];
      sourcePrep=()=>{prepApplied=true;return {ok:true,mutation:'FAST_FORWARD_CURRENT_REPO',head:'a'.repeat(40)};};
      expectedSelected=behind.path;
    }else if(group===4){
      rows=[behind];
      sourcePrep=()=>({ok:false,first_red:'INBOX_FETCH_FAILED',stderr:'offline'});
      expectedState='BLOCKED';
      expectedFirst='INBOX_FETCH_FAILED';
      expectedSelected=behind.path;
    }else if(group===5){
      startRuntime=()=>({ok:false,first_red:'OWNER_DOGFOOD_SCRIPT_MISSING'});
      expectedState='BLOCKED';
      expectedFirst='OWNER_DOGFOOD_SCRIPT_MISSING';
    }else if(group===6){
      after=runtime('RED_STALE_OR_NONPROVIDER','e'.repeat(40),'a'.repeat(40));
      expectedState='BLOCKED';
      expectedFirst='INBOX_RUNTIME_GENERATION_MISMATCH';
    }else if(group===7){
      headMatchCheck=()=>({state:'FAIL',status:1,stdout:'7 PASS / 1 FAIL',stderr:''});
      expectedState='BLOCKED';
      expectedFirst='RUNTIME_HEAD_MATCH_FAILED';
    }else if(group===8){
      before=runtime('ABSENT_LISTENER',null,'a'.repeat(40));
      expectedState='PASS_RUNTIME_CURRENT';
    }else if(group===9){
      execute=false;
      expectedState='PLAN_READY';
      expectedFirst='INBOX_RUNTIME_NOT_CURRENT';
    }

    let runtimeCalls=0;
    const runtimeInspect=()=>{
      runtimeCalls++;
      return runtimeCalls===1?before:after;
    };
    const repoCandidates=()=>rows.map(r=>r.path);
    const repoInspect=(p)=>{
      const original=rows.find(r=>r.path===p);
      if(!original) return {state:'ABSENT',path:p};
      if(original.state==='CLEAN_BEHIND' && prepApplied && group===3){
        return {...original,state:'CURRENT_CLEAN',local_head:'a'.repeat(40),provider_main:'a'.repeat(40),relation:'EXACT_PROVIDER_MAIN'};
      }
      return original;
    };

    const result=recoverInboxRuntime({
      execute,
      cwd:'/workspace',
      env:{HOME:'/home/tester',USER:'tester',PATH:process.env.PATH||''},
      exec:()=>({ok:true,status:0,stdout:'',stderr:'',error:null}),
      runtimeInspect,
      repoCandidates,
      repoInspect,
      sourcePrep,
      startRuntime,
      headMatchCheck,
      waitSeconds:0.001,
    });

    assert.equal(result.schema,'xiio.cli.inbox-runtime-recovery/v1');
    assert.equal(result.state,expectedState);
    assert.equal(result.first_red,expectedFirst);
    assert.equal(result.provider_effect,false);
    assert.equal(result.external_send,false);
    assert.ok(result.hard.includes('DIRTY_RUNTIME_CHECKOUT != DISPOSABLE'));
    assert.ok(result.hard.includes('RUNTIME_HEALTH != GENERATION_CURRENT'));

    if(expectedSelected){
      assert.equal(result.selected?.path || result.choice?.row?.path,expectedSelected);
    }
    if(group===0){
      assert.notEqual(result.selected?.path,dirty.path);
      assert.equal(result.state,'PASS_RUNTIME_CURRENT');
      assert.equal(result.after.state,'PASS_CURRENT');
      assert.equal(result.head_match.state,'PASS');
    }
    if(group===3){
      assert.equal(result.sourceMutation.mutation,'FAST_FORWARD_CURRENT_REPO');
    }
    if(group===9){
      assert.equal(result.mode,'PLAN');
      assert.equal(result.state,'PLAN_READY');
    }
  });
}

if(falseGreen){
  console.error(JSON.stringify({schema:'xiio.cli.inbox-runtime-recovery-hostile-debug/v1',falseGreen,failures:failures.slice(0,20)},null,2));
}
assert.equal(hostileCount,100);
assert.equal(expected,100);
assert.equal(falseGreen,0);

console.log(JSON.stringify({
  schema:'xiio.cli.inbox-runtime-recovery-hostile-100/v1',
  result:'PASS',
  denominator:100,
  expected:100,
  false_green:0,
  groups:{
    dirty_donor_plus_current:10,
    no_clean_repo:10,
    ambiguous_current:10,
    clean_behind_fast_forward:10,
    fast_forward_failure:10,
    owner_start_failure:10,
    post_start_stale_runtime:10,
    runtime_head_match_failure:10,
    absent_listener_recovery:10,
    plan_only:10
  },
  hard:[
    'DIRTY_RUNTIME_CHECKOUT != DISPOSABLE',
    'DONOR != CURRENT_RUNTIME_SOURCE',
    'FAST_FORWARD_ONLY',
    'STARTED != CURRENT',
    'CURRENT_SOURCE != RUNTIME_HEAD_MATCH',
    'GMAIL_SEND_DEFAULT_OFF'
  ],
  provider_effects:0,
  authority_granted:false
},null,2));
