import assert from 'node:assert/strict';
import { compileProgressGateGraduation, PROGRESS_GATED_ROLES, progressGatedRoleCatalog } from '../src/preflight/progress-gated-roles.mjs';
import { compileGraduationPreflight, GRADUATION_PROFILES } from '../src/preflight/graduation.mjs';

const generation='fixture:g1';
function goodProfile(profile){
  return compileGraduationPreflight({
    profile,subject_ref:'worker:fixture',source_generation:generation,
    cells:Object.fromEntries(GRADUATION_PROFILES[profile].map(([id])=>[id,{
      state:'PASS',reason:'FIXTURE',evidence_refs:[`fixture:${profile}:${id}`],blockers:[]
    }]))
  });
}
function good(role){
  const spec=PROGRESS_GATED_ROLES.find(x=>x.role===role);
  return {
    subject_ref:'worker:fixture',
    source_generation:generation,
    current_role:spec.previous_role,
    target_role:role,
    project_baselines:Object.fromEntries(['SDK_BASELINE_CURRENT','ACK_BASELINE_CURRENT','ORGANIZATIONAL_INTENT_CURRENT','CURRENT_SELECTOR_CURRENT'].map(id=>[id,{state:'PASS',evidence_refs:[`fixture:${id}`]}])),
    preflight_receipts:Object.fromEntries(spec.required_profiles.map(profile=>[profile,{compiled_receipt:goodProfile(profile),evidence_ref:`fixture:receipt:${profile}`} ])),
    hostile_test:{denominator:100,hostile_rejected:100,false_green:0,fixture_ref:'fixture:hostiles:100',receipt_ref:'fixture:hostiles:receipt'},
    independent_review:{state:'PASS',reviewer_ref:'worker:independent',evidence_ref:'fixture:review'},
    owner_economy:{owner_restatement_count:0,owner_manual_routing_count:0,talk_only_steps:0,evidence_ref:'fixture:economy'},
    capability:{current:true,ack_eligible:true,economically_eligible:true,effect_ceiling_compatible:true,evidence_ref:'fixture:capability'},
    return_cycle:Object.fromEntries(['RESULT','RETURN','APPLY_RETURN','READBACK','REAP'].map(id=>[id,{state:'PASS',evidence_refs:[`fixture:${id}`]}])),
    meta_wake:role==='META_ARCHITECT'?{kind:'SAME_DEFECT_TWO_OR_MORE_INDEPENDENT_CHILD_RETURNS',independent_return_count:2,evidence_refs:['fixture:child:a','fixture:child:b']}:undefined,
    gamify:{receipt_ref:'fixture:gamify'}
  };
}

let checks=0;
const catalog=progressGatedRoleCatalog();
assert.deepEqual(catalog.roles.map(x=>x.role),['LIGHT_CANARY','MEDIUM_MINER','HEAVY_FOREMAN','META_ARCHITECT']);checks++;
assert.deepEqual(catalog.roles.map(x=>x.ordinal),[10,20,30,40]);checks++;

for(const role of catalog.roles.map(x=>x.role)){
  const out=compileProgressGateGraduation(good(role));
  assert.equal(out.graduated,true,role);checks++;
  assert.equal(out.graduation_receipt_state,'EARNED_CURRENT_GENERATION');checks++;
  assert.equal(out.selectable_role,role);checks++;
  assert.equal(out.first_red,null);checks++;
  assert.equal(out.gamify_may_graduate,false);checks++;
}

const hostileMutators=[
  x=>{x.current_role='UNQUALIFIED';},
  x=>{x.project_baselines.ACK_BASELINE_CURRENT={state:'FAIL',evidence_refs:['x']};},
  x=>{delete x.preflight_receipts[Object.keys(x.preflight_receipts)[0]];},
  x=>{x.hostile_test.denominator=99;x.hostile_test.hostile_rejected=99;},
  x=>{x.hostile_test.false_green=1;},
  x=>{x.independent_review.reviewer_ref=x.subject_ref;},
  x=>{x.owner_economy.owner_restatement_count=1;},
  x=>{x.owner_economy.owner_manual_routing_count=1;},
  x=>{x.owner_economy.talk_only_steps=1;},
  x=>{x.capability.current=false;},
  x=>{x.return_cycle.RESULT={state:'FAIL',evidence_refs:['x']};},
  x=>{x.return_cycle.RETURN={state:'FAIL',evidence_refs:['x']};},
  x=>{x.return_cycle.APPLY_RETURN={state:'FAIL',evidence_refs:['x']};},
  x=>{x.return_cycle.READBACK={state:'FAIL',evidence_refs:['x']};},
  x=>{x.return_cycle.REAP={state:'FAIL',evidence_refs:['x']};},
];

let hostileRejected=0;
for(let i=0;i<120;i++){
  const target=PROGRESS_GATED_ROLES[i%PROGRESS_GATED_ROLES.length].role;
  const x=structuredClone(good(target));
  hostileMutators[i%hostileMutators.length](x);
  if(target==='LIGHT_CANARY' && i%hostileMutators.length===0) x.current_role='MEDIUM_MINER';
  const out=compileProgressGateGraduation(x);
  assert.equal(out.graduated,false,`hostile ${i} should reject`);
  hostileRejected++;
}
assert.equal(hostileRejected,120);checks++;

{
  const x=good('META_ARCHITECT');
  x.meta_wake={kind:'SAME_DEFECT_TWO_OR_MORE_INDEPENDENT_CHILD_RETURNS',independent_return_count:1,evidence_refs:['fixture:one']};
  const out=compileProgressGateGraduation(x);
  assert.equal(out.graduated,false);checks++;
  assert.equal(out.first_red.id,'G09_META_WAKE');checks++;
}
{
  const x=good('MEDIUM_MINER');
  x.gamify={receipt_ref:'fixture:huge-bonus',level_up:999};
  x.hostile_test.false_green=1;
  const out=compileProgressGateGraduation(x);
  assert.equal(out.graduated,false);checks++;
  assert.equal(out.gamify_may_graduate,false);checks++;
}

console.log(JSON.stringify({
  mode:'PROGRESS_GATED_ROLE_GRADUATION',
  roles:4,
  clean_transitions:4,
  hostile_denominator:120,
  hostile_rejected:hostileRejected,
  false_green:0,
  checks,
  result:'PASS',
  effects:0
}));
