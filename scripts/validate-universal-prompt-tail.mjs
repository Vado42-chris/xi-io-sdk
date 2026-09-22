#!/usr/bin/env node
import assert from 'node:assert/strict';
import {compileUniversalPromptTail,PROMPT_TAIL_STEPS,universalPromptTailCatalog} from '../src/ibal/universal-prompt-tail.mjs';

const TASKS=[
 {id:'READ_ONLY_RESEARCH',skills:['search','source-currentness','synthesis'],state:'PASS'},
 {id:'LEGAL_DRAFT_NO_EFFECT',skills:['legal-wording','source-fidelity','publisher'],state:'PASS'},
 {id:'SOURCE_PATCH',skills:['code','validator','readback'],state:'PASS'},
 {id:'PROVIDER_EFFECT_WAIT',skills:['switchboard','ward','meter'],state:'WAIT'},
 {id:'INDEPENDENT_REVIEW_WAIT',skills:['trinity','ux-verify','currentness'],state:'WAIT'},
 {id:'LOCAL_RUNTIME_BLOCKED',skills:['hex','runtime','ward'],state:'BLOCKED'},
 {id:'NO_WORK_NA',skills:[],state:'N_A_WITH_EVIDENCE'},
 {id:'UNKNOWN_CURRENTNESS',skills:['currentness'],state:'UNKNOWN'},
];
const cat=universalPromptTailCatalog();
const axes=cat.axes;

let matrix=0,valid=0,completed=0,nonCompletePreserved=0;
for(const task of TASKS)
for(const facet of axes.facets)
for(const mode of axes.modes)
for(const direction of axes.directions)
for(const render_plane of axes.planes)
for(const trinity_role of axes.trinity_roles)
for(const mirror_direction of axes.mirror_directions)
for(const blast_radius_state of axes.blast_radius_states){
 const out=compileUniversalPromptTail({
  current_ref:'current:search:g1',
  task_ref:'task:'+task.id,
  required_skills:task.skills,
  task_outcome:{state:task.state,reason:'fixture:'+task.state,effect_authorized:false},
  axes:{facet,mode,direction,render_plane,trinity_role,mirror_direction,blast_radius_state},
  mirror:{user_occurrence_ref:'user:1',system_response_ref:'ai:1',mirror_delta_ref:'delta:1'}
 });
 matrix++;
 assert.equal(out.tail.valid,true);
 valid++;
 if(out.task_complete){completed++;assert(out.task_outcome.state==='PASS'||out.task_outcome.state==='N_A_WITH_EVIDENCE');}
 else {
  nonCompletePreserved++;
  assert(['WAIT','BLOCKED','UNKNOWN'].includes(out.task_outcome.state));
  assert.equal(out.completion_credit,0);
 }
 if(blast_radius_state==='STEW_OVERFLOW')assert.equal(out.tail.valid,true);
 assert.equal(out.effect_authority_granted,false);
}
assert.equal(matrix,5760);
assert.equal(valid,5760);

let missingStepRejected=0;
for(let i=0;i<PROMPT_TAIL_STEPS.length;i++){
 for(let j=0;j<25;j++){
  const steps=PROMPT_TAIL_STEPS.filter((_,idx)=>idx!==i);
  const out=compileUniversalPromptTail({
   current_ref:'current:g1',task_ref:'task:missing:'+i+':'+j,required_skills:['fixture'],
   task_outcome:{state:'PASS',reason:'fixture'},
   steps,
   mirror:{user_occurrence_ref:'u',system_response_ref:'a',mirror_delta_ref:'d'}
  });
  assert.equal(out.tail.valid,false);
  assert(out.tail.blockers.includes('MISSING_STEP:'+PROMPT_TAIL_STEPS[i]));
  missingStepRejected++;
 }
}
assert.equal(missingStepRejected,PROMPT_TAIL_STEPS.length*25);

let ropeRejected=0;
for(const patch of [
 x=>x.rope={start_state:'RED'},
 x=>x.rope={first_half:'SOW_OUTWARD'},
 x=>x.rope={seam:'NO_MIRROR'},
 x=>x.rope={second_half:'REAP_INWARD'},
 x=>x.rope={end_state:'RED'},
]){
 for(let i=0;i<50;i++){
  const x={
   current_ref:'current:g1',task_ref:'task:rope:'+i,required_skills:['fixture'],
   task_outcome:{state:'PASS',reason:'fixture'},
   mirror:{user_occurrence_ref:'u',system_response_ref:'a',mirror_delta_ref:'d'}
  };
  patch(x);
  const out=compileUniversalPromptTail(x);
  assert.equal(out.tail.valid,false);
  ropeRejected++;
 }
}
assert.equal(ropeRejected,250);

let xRejected=0;
for(const field of ['x_green_start','x_green_end']){
 for(let i=0;i<100;i++){
  const out=compileUniversalPromptTail({
   current_ref:'current:g1',task_ref:'task:x:'+field+':'+i,required_skills:['fixture'],
   task_outcome:{state:'WAIT',reason:'fixture'},
   [field]:false,
   mirror:{user_occurrence_ref:'u',system_response_ref:'a',mirror_delta_ref:'d'}
  });
  assert.equal(out.tail.valid,false);
  assert.equal(out.completion_credit,0);
  xRejected++;
 }
}
assert.equal(xRejected,200);

let launderingRejected=0;
for(const state of ['WAIT','BLOCKED','UNKNOWN']){
 for(let i=0;i<200;i++){
  const out=compileUniversalPromptTail({
   current_ref:'current:g1',task_ref:'task:launder:'+state+':'+i,required_skills:['fixture'],
   task_outcome:{state,reason:'must survive'},
   axes:{blast_radius_state:i%2?'STEW_OVERFLOW':'CONTAINED'},
   mirror:{user_occurrence_ref:'u',system_response_ref:'a',mirror_delta_ref:'d'}
  });
  assert.equal(out.tail.valid,true);
  assert.equal(out.task_complete,false);
  assert.equal(out.completion_credit,0);
  assert.notEqual(out.tail.disposition,'RETURN_PASS_TO_NEXT');
  launderingRejected++;
 }
}
assert.equal(launderingRejected,600);

console.log(JSON.stringify({
 schema:'xiio.sdk.universal-prompt-tail-check/v1',
 result:'PASS',
 exhaustive_clean_matrix:matrix,
 universal_tail_valid:valid,
 task_complete_cases:completed,
 noncomplete_outcomes_preserved:nonCompletePreserved,
 missing_step_hostiles:missingStepRejected,
 rope_order_hostiles:ropeRejected,
 x_green_hostiles:xRejected,
 outcome_laundering_hostiles:launderingRejected,
 total_hostiles:missingStepRejected+ropeRejected+xRejected+launderingRejected,
 false_green:0,
 falsification_result:'NO_COUNTEREXAMPLE_FOUND_FOR_UNIVERSAL_TAIL_WITHIN_CURRENT_TASK_MODEL',
 limitation:'TAIL_IS_UNIVERSAL_CLOSURE_WRAPPER_NOT_TASK_EXECUTION_OR_AUTHORITY',
 authority_granted:false,
 provider_effect:false
},null,2));
