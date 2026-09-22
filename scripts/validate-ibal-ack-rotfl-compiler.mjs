#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileIbalAckRotfl } from '../src/ibal/ack-rotfl-compiler.mjs';
import { runHostileHarness, assertHostileHarness } from '../src/evaluation/hostile-harness.mjs';
import { compileRotflOrderOfOperations, ROTFL_ORDER_STEPS } from '../src/preflight/order-of-operations.mjs';
import { QUAL_QUANT_MATRIX_REQUIRED_CELLS } from '../src/data/qual-quant-topography.mjs';

const item=(id,overrides={})=>({
  item_id:id,
  path_ref:`ack.items.${id}`,
  label:`ACK item ${id}`,
  applicable_bit:1,required_bit:1,material_bit:1,
  owner_ref:`owner:${id}`,work_ref:`work:${id}`,
  declared_state:'WAIT',
  evidence_refs:[`evidence:${id}`],
  hex_qualification:{state:'QUALIFIED',receipt_ref:`hex:${id}`},
  currentness:{state:'CURRENT',evidence_ref:`current:${id}`},
  result_ref:null,return_ref:null,apply_return_ref:null,reap_state:'PENDING',
  ...overrides,
});
const passItem=(id)=>item(id,{
  declared_state:'PASS',
  result_ref:`result:${id}`,return_ref:`return:${id}`,apply_return_ref:`apply:${id}`,reap_state:'DONE'
});
const orderEvidence=Object.fromEntries(ROTFL_ORDER_STEPS.map(({id})=>[id,[`fixture:ibal-compiler:${id}`]]));
const orderPreflight=Object.fromEntries(ROTFL_ORDER_STEPS.map(({id})=>[id,[`fixture:ibal-compiler:preflight:${id}`]]));
const managedCurrent={
  provider_current_ref:'fixture:provider-current:g1',
  studio_handoff_ref:'fixture:studio-handoff:g1',
  studio_session_ingress_ref:'fixture:studio-ingress:g1',
  current_selector_ref:'fixture:selector:g1',
  waterfall_ref:'fixture:waterfall:g1',
  registered_backlog_ref:'fixture:backlog:g1',
  waterfall_generation:'g1',
  registered_backlog_generation:'g1',
  owner_restatement_count:0
};
const order=()=>compileRotflOrderOfOperations({
  source_generation:'fixture:g1',
  managed_current:managedCurrent,
  completed_step_ids:ROTFL_ORDER_STEPS.map(({id})=>id).slice(0,12),
  evidence_refs:orderEvidence,
  preflight_refs:orderPreflight
});
const rotfl=()=>({
  schema:'xiio.sdk.rotfl-ack-context/v1',
  order_of_operations:order(),
  hvt_order_ref:'control:hvt:g1',
  knowledge_return_refs:['crm:knowledge:g1'],
  bins_resource_refs:['bins:resource:g1'],
  reusable_tool_refs:['tool:rotfl'],
  reusable_template_refs:['template:KnowledgeReturn','template:OnboardingPack','template:hot-patch-cadence'],
  template_runs:['template:KnowledgeReturn','template:OnboardingPack','template:hot-patch-cadence'].map(ref=>({
    schema:'xiio.sdk.rotfl-ack-template-run/v1',
    template_ref:ref,template_generation:'template:g1',
    runtime_ref:'runtime:rotfl-template',runtime_generation:'runtime:g1',
    runtime_rotfl_receipt_ref:'receipt:rotfl:g1',runtime_readback_ref:'readback:rotfl:g1',
    next_input_ref:'next:g1',state:'EXECUTED',
    known_bit:1,value_bit:1,talk_action_zero_bit:1,time_money_bound_bit:1
  })),
  coverage_profile_ref:'coverage:five-scale',
  truncation_denominator_ref:'denom:truncation:g1',
  affected_refs:['affected:ack'],no_effect_refs:['no-effect:sibling'],
  first_red_ref:'red:first',next_ref:'next:g1',wake_ref:'wake:g1',fallback_ref:'fallback:g1',
  apply_return_target_ref:'apply-return:g1',reap_refs:['reap:g1'],
  cold_start_readback_ref:'crm:readback:g1',currentness_checked_at:'2026-09-22T08:00:00-06:00'
});
const topography=()=>({
  identity:{root_uuid:'root:g1',work_ref:'work:g1',generation:'g1'},
  cells:Object.fromEntries(QUAL_QUANT_MATRIX_REQUIRED_CELLS.map(id=>[id,{state:'PASS',evidence_refs:[`evidence:topo:${id}`]}])),
  golden:{qualitative_data:{holding:'A',scope:'current'},quantitative_data:{hits:4,weight:10}},
  subterranean:{qualitative_data:{holding:'A',scope:'under'},quantitative_data:{hits:2,weight:7}},
  quant_units:{hits:'count',weight:'points'}
});
const patchMaterial=()=>({
  patch_owner:'Ibal',
  patch_contents:{source:'patch:source',validator:'patch:validator',rollback:'patch:rollback'},
  preflight_gates:[{gate_id:'PREFLIGHT',state:'PASS',evidence_ref:'evidence:preflight'}],
  logic_gates:[{gate_id:'LOGIC',state:'PASS',evidence_ref:'evidence:logic'}],
  scale_gates:{'10S':'PASS','100S':'PASS','00S':'PASS',MICRO:'PASS',MESO:'PASS',MACRO:'PASS',META:'PASS'},
  pass_condition:'all exact affected gates pass',
  fail_condition:'any exact affected gate fails',
  true_wait_condition:'external dependency remains typed wait'
});
const base=()=>({
  schema:'xiio.sdk.ibal-ack-rotfl-compiler-input/v1',
  root_ref:'search:root',
  work_ref:'search:work',
  project_ref:'xi-io:search',
  studio_root_ref:'studio:root',
  root_generation:'SEARCH_G1',
  occurrence_ref:'occurrence:search:001',
  checklist_ref:'SEARCH_100S_G1',
  effect_ceiling:0,
  rotfl_context:rotfl(),
  ack_sources:[
    {ack_ref:'ack:ward',ack_generation:'ack:ward:g1',root_generation:'SEARCH_G1',items:[passItem('effect-policy')]},
    {ack_ref:'ack:ibal',ack_generation:'ack:ibal:g1',root_generation:'SEARCH_G1',items:[item('currentness-a'),item('currentness-b')]}
  ],
  signals:{legal_wording_risk:true,distinct_perspectives:3},
  bindings:{
    skill_refs:['framework:skills/run-rotfl-atomic-gate/SKILL.md'],
    script_refs:['framework:scripts/validate-rotfl-atomic-gate-cube-1s.mjs'],
    flatpack_template_ref:'sdk:flatpack/primitives',
    hot_folder_ref:'framework:trinity-metered-hotpatch',
    ack_template_refs:['sdk:acks/rotfl-template'],
    return_target_ref:'search:SEARCH_GLOBAL_PRIORITY_G1',
    disclosure_ref:'sdk:progressive-disclosure',
    tool_call_budget:3,max_items_per_pass:10
  },
  topography:topography(),
  patch_materials:{'ack:ibal#currentness-a':patchMaterial()},
  metering:{
    measured_elapsed_ms:2500,
    measured_tokens:1200,
    owner_cogs:1,
    rate_card:{pricing_ref:'rate:sim:g1',rate_microunits_per_second:10}
  }
});

const out=compileIbalAckRotfl(base());
assert.equal(out.schema,'xiio.sdk.ibal-ack-rotfl-compiler/v1');
assert.equal(out.ack_summary.items,3);
assert.equal(out.ack_summary.open_items,2);
assert.equal(out.ack_summary.accounting_100,true);
assert.equal(out.ack_summary.silent_remainder,0);
assert.equal(out.triage.triage_required,true);
assert.equal(out.triage.quantized_partition_denominator,1);
assert.equal(out.triage.simulated_team_denominator,1);
assert.equal(out.team_kit_denominator,3);
assert.equal(out.live_worker_count,0);
assert.equal(out.topography_state,'QUORUM_COMPLETE');
assert.equal(out.flatpack_prep.denominator,2);
assert.equal(out.flatpack_prep.ready,1);
assert.equal(out.flatpack_prep.wait,1);
assert.equal(out.flatpack_prep.fail,0);
assert.equal(out.economy.measured_elapsed_ms,2500);
assert.equal(out.economy.whole_1s_units,2);
assert.equal(out.economy.remainder_ms,500);
assert.equal(out.economy.exact_cost_microunits,25);
assert.equal(out.economy.time_money_bound_bit,1);
assert.equal(out.economy.billing_authorized,false);
assert.equal(out.authority_granted,false);
assert.equal(out.provider_effect,false);
assert.equal(out.next,'RUN_SIM_TRIAGE_THEN_REDUCE_AND_PREP_PACKS');

function validate(candidate){
  try{
    const compiled=compileIbalAckRotfl(candidate);
    const errors=[];
    if(compiled.authority_granted!==false||compiled.provider_effect!==false||compiled.billing_authorized!==false) errors.push('AUTHORITY_FORGERY');
    if(compiled.ack_summary.silent_remainder!==0) errors.push('SILENT_REMAINDER');
    if(compiled.topography && compiled.topography.quorum.complete!==true) errors.push('TOPOGRAPHY_BLOCKED');
    if(compiled.flatpack_prep.fail>0) errors.push('PATCH_PREP_FAIL');
    return errors;
  }catch(error){
    return [String(error?.message||error)];
  }
}
const families=[
  {id:'SCHEMA',count:10,mutate:(x,i)=>{x.schema='bad:'+i;x.hostile_nonce=i;},expect:(e)=>e.some(x=>x.includes('SCHEMA_INVALID'))},
  {id:'ROOT',count:10,mutate:(x,i)=>{x.root_ref='';x.hostile_nonce=i;},expect:(e)=>e.some(x=>x.includes('root_ref_REQUIRED'))},
  {id:'EFFECT',count:10,mutate:(x,i)=>{x.effect_ceiling=1;x.hostile_nonce=i;},expect:(e)=>e.some(x=>x.includes('EFFECT_CEILING_MUST_BE_ZERO'))},
  {id:'TEAM_SKILLS',count:10,mutate:(x,i)=>{x.bindings.skill_refs=[];x.hostile_nonce=i;},expect:(e)=>e.some(x=>x.includes('skill_refs_REQUIRED'))},
  {id:'ACK_DUP',count:10,mutate:(x,i)=>{x.ack_sources.push(structuredClone(x.ack_sources[0]));x.hostile_nonce=i;},expect:(e)=>e.some(x=>x.includes('duplicate ack_ref'))},
  {id:'ROTFL',count:10,mutate:(x,i)=>{x.rotfl_context.template_runs=[];x.hostile_nonce=i;},expect:(e)=>e.some(x=>x.includes('rotfl_context invalid'))},
  {id:'METER',count:10,mutate:(x,i)=>{x.metering.measured_elapsed_ms=-1;x.hostile_nonce=i;},expect:(e)=>e.some(x=>x.includes('measured_elapsed_ms_INVALID'))},
  {id:'PATCH',count:10,mutate:(x,i)=>{x.patch_materials['ack:ibal#currentness-a'].scale_gates['10S']='BOGUS';x.hostile_nonce=i;},expect:(e)=>e.includes('PATCH_PREP_FAIL')},
  {id:'TOPOGRAPHY',count:10,mutate:(x,i)=>{x.topography.cells.POLARITY_SOLAR_GOLDEN.evidence_refs=[];x.hostile_nonce=i;},expect:(e)=>e.includes('TOPOGRAPHY_BLOCKED')},
  {id:'PARTITION_DUP',count:10,mutate:(x,i)=>{x.partitions=[
    {partition_ref:'p:dup',semantic_key:'a',state:'AFFECTED',equivalence_key:'same',evidence_refs:['e:a']},
    {partition_ref:'p:dup',semantic_key:'b',state:'AFFECTED',equivalence_key:'same',evidence_refs:['e:b']}
  ];x.hostile_nonce=i;},expect:(e)=>e.some(x=>x.includes('DUPLICATE_PARTITION_REF'))}
];
const burn=runHostileHarness({fixture:base(),validate,families,min_unique_mutations_per_family:10});
assertHostileHarness(burn);
assert.equal(burn.denominator,100);
assert.equal(burn.rejected,100);
assert.equal(burn.false_green,0);

console.log(JSON.stringify({
  schema:'xiio.sdk.ibal-ack-rotfl-compiler-validation/v1',
  result:'PASS',
  ack_items:out.ack_summary.items,
  open_ack_items:out.ack_summary.open_items,
  quantized_partitions:out.triage.quantized_partition_denominator,
  simulated_trinities:out.triage.simulated_team_denominator,
  role_kits:out.team_kit_denominator,
  flatpack_ready:out.flatpack_prep.ready,
  flatpack_wait:out.flatpack_prep.wait,
  measured_elapsed_ms:out.economy.measured_elapsed_ms,
  exact_cost_microunits:out.economy.exact_cost_microunits,
  hostile_denominator:burn.denominator,
  hostile_rejected:burn.rejected,
  false_green:burn.false_green,
  authority_granted:false,
  provider_effect:false,
  billing_authorized:false
},null,2));
