import assert from 'node:assert/strict';
import {compileColdStartFlatpack,COLD_START_FLATPACK_INPUT_SCHEMA} from '../src/flatpack/cold-start.mjs';
import {compileMultiLoopRefire,MULTI_LOOP_REFIRE_INPUT_SCHEMA} from '../src/cadence/refire.mjs';

const ROOT='5267f93e-2af8-57c8-975d-21fcbf77683e';
const WORK='d4a4906a-80ec-54ed-aeb1-364154a486a9';
const GEN='G1';
function cold(){
 return compileColdStartFlatpack({
  schema:COLD_START_FLATPACK_INPUT_SCHEMA,package_id:'coldpack:search:g1',generation:GEN,project_ref:'xi-io:search',root_uuid:ROOT,work_uuid:WORK,
  payload:[
   {role:'CURRENT_SELECTOR',ref:'project-current',generation:GEN,state:'CURRENT'},
   {role:'CURRENT_ACK',ref:'ack',generation:GEN,state:'CURRENT'},
   {role:'CURRENT_DENOMINATOR',ref:'100s',generation:GEN,state:'CURRENT'},
   {role:'TOOL_CAPABILITY_DELTA',ref:'glass',generation:GEN,state:'CURRENT'},
   {role:'CURRENT_SKILLS',ref:'skills',generation:GEN,state:'CURRENT'},
   {role:'CURRENT_LEXICON',ref:'lexicon',generation:GEN,state:'CURRENT'},
   {role:'RETURN_TARGETS',ref:'returns',generation:GEN,state:'CURRENT'},
  ],
  providers:[{provider_ref:'github',state:'STALE',required_for_current_work:true,source_refs:['repo:a','repo:b'],rate_limit_bucket:'github'}],
  provider_policy:{max_attempts_per_bucket:1},
  apply_return_target:'search',readback_target:'search',bins_custody_target:'bins:search',reap_target:'search'
 });
}
function loops(n=26){
 return Array.from({length:n},(_,i)=>({
  loop_ref:'loop:'+String(i+1).padStart(2,'0'),
  parent_cell_ref:'SEARCH_100S_G1#'+String(i+1).padStart(2,'0'),
  state:i%4===0?'FAIL':i%4===1?'WAIT':i%4===2?'UNKNOWN':'RUNNABLE',
  first_red:'red:'+i,
  wake:i%4===1?'wake:'+i:null,
  return_target:'search:return',
  effect_ceiling:'NO_EFFECT',
  provider_requirements:[
   {provider_ref:'github:search',rate_limit_bucket:'github',source_refs:['repo:search'],material:i%3===0},
   {provider_ref:'slack:search',rate_limit_bucket:'slack',source_refs:['channel:search'],material:false},
  ]
 }));
}
const clean=compileMultiLoopRefire({schema:MULTI_LOOP_REFIRE_INPUT_SCHEMA,generation:GEN,project_ref:'xi-io:search',root_uuid:ROOT,work_uuid:WORK,cold_start_flatpack:cold(),loops:loops()});
assert.equal(clean.open_loop_denominator,26);
assert.equal(clean.refired_loop_denominator,26);
assert.equal(clean.provider_attempts,0);
assert.equal(clean.local_ibal.package_hydrated_once,true);
assert.equal(clean.switchboard.local_inference_workload.workload_class,'interactive_inference');
assert.equal(clean.switchboard.local_inference_workload.privacy_requirement,'LOCAL_ONLY');
assert.equal(clean.switchboard.local_inference_workload.attempt_authorized,false);
assert.equal(clean.shared_provider_deltas.filter(x=>x.bucket==='github').length,1);
assert.equal(clean.shared_provider_deltas.find(x=>x.bucket==='github').attempt,0);
assert.equal(clean.shared_provider_deltas.some(x=>x.bucket==='slack'),false,'nonmaterial provider must not fan out');

{
 const mixed=[...loops(9),{loop_ref:'loop:done',parent_cell_ref:'cell:done',state:'PASS',return_target:'return:done',effect_ceiling:'NO_EFFECT'}];
 const out=compileMultiLoopRefire({schema:MULTI_LOOP_REFIRE_INPUT_SCHEMA,generation:GEN,project_ref:'xi-io:search',root_uuid:ROOT,work_uuid:WORK,cold_start_flatpack:cold(),loops:mixed});
 assert.equal(out.input_loop_denominator,10);
 assert.equal(out.refired_loop_denominator,9);
 assert.equal(out.terminal_loop_denominator,1);
 assert.equal(out.terminal_preserved[0].loop_ref,'loop:done');
}

let rejected=0;
for(let i=0;i<200;i++){
 const c=cold();
 const bad=structuredClone(c);
 if(i%4===0) bad.onboarding_ready=false;
 else if(i%4===1) bad.local_hydration.state='WAIT_LOCAL_PAYLOAD';
 else if(i%4===2) bad.provider_delta_plan.planned_attempt_count=1;
 else bad.generation='OLD';
 let ok=false;
 try{compileMultiLoopRefire({schema:MULTI_LOOP_REFIRE_INPUT_SCHEMA,generation:GEN,project_ref:'xi-io:search',root_uuid:ROOT,work_uuid:WORK,cold_start_flatpack:bad,loops:loops(3)});}catch{ok=true;}
 assert.equal(ok,true,'bad cold-start state must reject '+i);
 rejected++;
}
assert.equal(rejected,200);

console.log(JSON.stringify({
 schema:'xiio.sdk.multi-loop-refire-check/v1',
 result:'PASS',
 open_loops_refired:26,
 one_local_ollama_workload:true,
 shared_github_delta_requests:1,
 provider_attempts:0,
 hostile_denominator:200,
 hostile_rejected:200,
 false_green:0,
 effects:0
}));
