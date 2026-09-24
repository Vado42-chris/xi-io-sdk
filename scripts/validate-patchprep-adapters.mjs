import assert from 'node:assert/strict';
import {PREP_CELLS} from '../src/patchprep/economy.mjs';
import {
 compilePreparedFlatpackPatch,compilePreparedRotflTemplateRoute,
 compilePreparedAckItemTrinity,compilePreparedFourScaleScorecard
} from '../src/patchprep/adapters.mjs';
import {compileRotflOrderOfOperations,ROTFL_ORDER_STEPS} from '../src/preflight/order-of-operations.mjs';

const prep=(family)=>({
 surface_family:family,generation:'g1',
 cells:Object.fromEntries(PREP_CELLS.map(id=>[id,{state:'PASS',evidence_refs:['e:'+family+':'+id]}])),
 evidence_mode:'SIM',prep_ms:100,deploy_ms:100,rework_ms:0,return_reap_ms:100,
 deploy_attempts:1,failed_attempts:0,rollback_count:0,owner_restatement_count:0,manual_routing_count:0,stale_retry_count:0
});
const prepMap=(families)=>Object.fromEntries(families.map(f=>[f,prep(f)]));

const flatInput={
 patch_id:'patch:test',patch_owner:'test',target_red:'red',affected_flatplane_cube:'cube:test',
 patch_contents:{x:1},
 preflight_gates:[{gate_id:'CURRENT',state:'PASS',evidence_ref:'e'}],
 logic_gates:[{gate_id:'LOGIC',state:'PASS',evidence_ref:'e'}],
 scale_gates:{'10S':'PASS','100S':'PASS','00S':'PASS',MICRO:'PASS',MESO:'PASS',MACRO:'PASS',MEGA:'PASS',META:'PASS'},
 expected_return:'return',apply_return_target:'apply',readback_target:'readback',bins_custody_target:'bins',reap_target:'reap',
 pass_condition:'pass',fail_condition:'fail',true_wait_condition:'wait',effect_ceiling:0
};
let out=compilePreparedFlatpackPatch({prep_by_surface:prepMap(['FLATPACK','HOTPATCH','RETURN_REAP']),input:flatInput});
assert.equal(out.admitted,true);assert.equal(out.result.detonation_admitted,true);
out=compilePreparedFlatpackPatch({prep_by_surface:prepMap(['FLATPACK','HOTPATCH']),input:{bad:true}});
assert.equal(out.admitted,false);assert.equal(out.result,null);assert.deepEqual(out.prep.missing,['RETURN_REAP']);

const templateRefs=['template:a'];
const templateRuns=[{
 schema:'xiio.sdk.rotfl-ack-template-run/v1',template_ref:'template:a',template_generation:'tg1',
 runtime_ref:'runtime:a',runtime_generation:'rg1',runtime_rotfl_receipt_ref:'receipt:a',runtime_readback_ref:'readback:a',
 next_input_ref:'next:a',state:'EXECUTED',known_bit:1,value_bit:1,talk_action_zero_bit:1,time_money_bound_bit:1
}];
out=compilePreparedRotflTemplateRoute({
 prep_by_surface:prepMap(['TEMPLATE']),
 input:{item_ref:'item:a',rotfl:{reusable_template_refs:templateRefs,template_runs:templateRuns}}
});
assert.equal(out.admitted,true);assert.equal(out.result.runtime_complete,true);

const proof=(id)=>({state:'PASS',proof_ref:'proof:'+id});
const layers=['MICRO','MESO','MACRO','META'],stages=['CHANGE_MATERIALIZED','EXACT_HEAD_PROOF','REVIEW_DISPOSITION','MERGED_TO_MAIN','MAIN_READBACK_CURRENT','AFFECTED_RETURN_CURRENT'];
const observations=Object.fromEntries(layers.map(l=>[l,Object.fromEntries(stages.map(s=>[s,proof(l+':'+s)]))]));
out=compilePreparedFourScaleScorecard({
 prep_by_surface:prepMap(['SCORECARD']),
 input:{subject_ref:'subject:a',subject_generation:'g1',observations}
});
assert.equal(out.admitted,true);assert.equal(out.result.supplied_compound_100,true);

const orderEvidence=Object.fromEntries(ROTFL_ORDER_STEPS.map(({id})=>[id,['e:'+id]]));
const orderPreflight=Object.fromEntries(ROTFL_ORDER_STEPS.map(({id})=>[id,['p:'+id]]));
const managedCurrent={
 provider_current_ref:'pc:g1',studio_handoff_ref:'studio:g1',studio_session_ingress_ref:'ingress:g1',
 current_selector_ref:'selector:g1',waterfall_ref:'waterfall:g1',registered_backlog_ref:'backlog:g1',
 waterfall_generation:'g1',registered_backlog_generation:'g1',owner_restatement_count:0
};
const order=compileRotflOrderOfOperations({
 source_generation:'fixture:g1',managed_current:managedCurrent,
 completed_step_ids:ROTFL_ORDER_STEPS.map(x=>x.id).slice(0,12),evidence_refs:orderEvidence,preflight_refs:orderPreflight
});
const rotfl={
 schema:'xiio.sdk.rotfl-ack-context/v1',order_of_operations:order,hvt_order_ref:'hvt:g1',
 knowledge_return_refs:['crm:g1'],bins_resource_refs:['bins:g1'],reusable_tool_refs:['tool:g1'],
 reusable_template_refs:templateRefs,template_runs:templateRuns,coverage_profile_ref:'coverage:g1',
 truncation_denominator_ref:'denom:g1',affected_refs:['affected:g1'],no_effect_refs:['noeffect:g1'],
 first_red_ref:'red:g1',next_ref:'next:g1',wake_ref:'wake:g1',fallback_ref:'fallback:g1',
 apply_return_target_ref:'apply:g1',reap_refs:['reap:g1'],cold_start_readback_ref:'cold:g1',
 currentness_checked_at:'2026-09-22T00:00:00Z'
};
const ackInput={
 schema:'xiio.sdk.ack-item-trinity-input/v1',root_ref:'studio:root',root_generation:'root:g1',studio_root_ref:'studio:current',
 rotfl_context:rotfl,ack_sources:[{
  ack_ref:'ack:test',ack_generation:'ag1',root_generation:'root:g1',items:[{
   item_id:'cell',path_ref:'ack.items.cell',label:'cell',applicable_bit:1,required_bit:1,material_bit:1,
   owner_ref:'owner:cell',work_ref:'work:cell',declared_state:'PASS',evidence_refs:['e:cell'],
   hex_qualification:{state:'QUALIFIED',receipt_ref:'hex:cell'},currentness:{state:'CURRENT',evidence_ref:'current:cell'},
   result_ref:'result:cell',return_ref:'return:cell',apply_return_ref:'apply:cell',reap_state:'DONE'
  }]
 }]
};
const trinityFamilies=['TRINITY','PUNCHCARD','SCORECARD','CHECKLIST','TEMPLATE','RETURN_REAP'];
out=compilePreparedAckItemTrinity({prep_by_surface:prepMap(trinityFamilies),input:ackInput});
assert.equal(out.admitted,true);assert.equal(out.result.trinity_accounting_100,true);assert.equal(out.result.punch_card_count,1);assert.equal(out.result.score_card_count,1);assert.equal(out.result.checklist_count,1);
for(const missing of trinityFamilies){
 const pm=prepMap(trinityFamilies.filter(x=>x!==missing));
 const blocked=compilePreparedAckItemTrinity({prep_by_surface:pm,input:{bad:true}});
 assert.equal(blocked.admitted,false,missing);assert(blocked.prep.missing.includes(missing));
}

console.log(JSON.stringify({
 schema:'xiio.sdk.patch-prep-adapter-check/v1',
 prepared_routes:['FLATPACK_PATCH','ROTFL_TEMPLATE','ACK_ITEM_TRINITY','FOUR_SCALE_SCORECARD'],
 trinity_surface_bundle:trinityFamilies,
 blocked_missing_surface_hostiles:trinityFamilies.length+1,
 result:'PASS',effects:0
}));
