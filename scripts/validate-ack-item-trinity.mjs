#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileAckItemTrinity } from '../src/acks/item-trinity.mjs';

const item = (id, overrides={}) => ({
  item_id:id,
  path_ref:`ack.items.${id}`,
  label:`ACK item ${id}`,
  applicable_bit:1,
  required_bit:1,
  material_bit:1,
  owner_ref:`owner:${id}`,
  work_ref:`work:${id}`,
  declared_state:'PASS',
  evidence_refs:[`evidence:${id}`],
  hex_qualification:{state:'QUALIFIED',receipt_ref:`hex:${id}`},
  currentness:{state:'CURRENT',evidence_ref:`current:${id}`},
  result_ref:`result:${id}`,
  return_ref:`return:${id}`,
  apply_return_ref:`apply:${id}`,
  reap_state:'DONE',
  ...overrides,
});

const rotfl = () => ({
  schema:'xiio.sdk.rotfl-ack-context/v1',
  hvt_order_ref:'control:hvt:g1',
  knowledge_return_refs:['crm:knowledge:g1'],
  bins_resource_refs:['bins:resource:g1'],
  reusable_tool_refs:['tool:rotfl'],
  reusable_template_refs:['template:KnowledgeReturn','template:OnboardingPack','template:hot-patch-cadence'],
  template_runs:['template:KnowledgeReturn','template:OnboardingPack','template:hot-patch-cadence'].map(ref=>({
    schema:'xiio.sdk.rotfl-ack-template-run/v1',
    template_ref:ref,
    template_generation:'template:g1',
    runtime_ref:'runtime:rotfl-template',
    runtime_generation:'runtime:g1',
    runtime_rotfl_receipt_ref:'receipt:rotfl:g1',
    runtime_readback_ref:'readback:rotfl:g1',
    next_input_ref:'next:g1',
    state:'EXECUTED',
    known_bit:1,
    value_bit:1,
    talk_action_zero_bit:1,
    time_money_bound_bit:1,
  })),
  coverage_profile_ref:'coverage:five-scale',
  truncation_denominator_ref:'denom:truncation:g1',
  affected_refs:['affected:ack'],
  no_effect_refs:['no-effect:sibling'],
  first_red_ref:'red:first',
  next_ref:'next:g1',
  wake_ref:'wake:g1',
  fallback_ref:'fallback:g1',
  apply_return_target_ref:'apply-return:g1',
  reap_refs:['reap:g1'],
  cold_start_readback_ref:'crm:readback:g1',
  currentness_checked_at:'2026-09-19T12:00:00-06:00',
});

const source = (ref, items, overrides={}) => ({
  ack_ref:ref,
  ack_generation:`generation:${ref}`,
  root_generation:'root:g1',
  items,
  ...overrides,
});

const base = () => ({
  schema:'xiio.sdk.ack-item-trinity-input/v1',
  root_ref:'studio:root',
  root_generation:'root:g1',
  studio_root_ref:'studio:suite:current',
  rotfl_context:rotfl(),
  ack_sources:[
    source('ack:ward',[item('effect-policy')]),
    source('ack:ibal',[
      item('currentness',{declared_state:'WAIT',result_ref:null,return_ref:null,apply_return_ref:null,reap_state:'PENDING'}),
      item('not-applicable',{applicable_bit:0,required_bit:0,material_bit:0,declared_state:'UNKNOWN',owner_ref:null,work_ref:null,evidence_refs:[],hex_qualification:{state:'N_A',receipt_ref:null},currentness:{state:'N_A',evidence_ref:null},result_ref:null,return_ref:null,apply_return_ref:null,reap_state:'N_A'}),
    ]),
  ],
});

let checks=0;
const out=compileAckItemTrinity(base());
assert.equal(out.ack_source_count,2);
assert.equal(out.ack_item_count,3);
assert.equal(out.punch_card_count,3);
assert.equal(out.score_card_count,3);
assert.equal(out.checklist_count,3);
assert.equal(out.trinity_accounting_100,true);
assert.equal(out.silent_remainder,0);
assert.equal(out.applicable_count,2);
assert.equal(out.n_a_count,1);
assert.equal(out.authority_granted,false);
assert.equal(out.provider_effect,false);
assert.equal(out.external_communication,false);
assert.equal(out.rotfl_required,true);
assert.equal(out.rotfl_template_runtime_complete,true);
assert.equal(out.rotfl_template_run_count,3);
checks+=15;

for(const entry of out.trinity){
  assert.equal(entry.punch_card.item_ref,entry.item_ref);
  assert.equal(entry.score_card.item_ref,entry.item_ref);
  assert.equal(entry.checklist.item_ref,entry.item_ref);
  assert.equal(entry.template_route.item_ref,entry.item_ref);
  assert.equal(entry.template_route.runtime_complete,true);
  assert.equal(entry.template_route.template_pass,3);
  assert.equal(entry.punch_card.rotfl_template_route_ref,entry.template_route.route_id);
  assert.equal(entry.score_card.rotfl_template_route_ref,entry.template_route.route_id);
  assert.equal(entry.checklist.rotfl_template_route_ref,entry.template_route.route_id);
}
checks+=27;

const ward=out.trinity.find(x=>x.item_ref==='ack:ward#effect-policy');
assert.equal(ward.score_card.declared_state,'PASS');
assert.equal(ward.score_card.projected_state,'SUPPLIED_UNVERIFIED');
assert.equal(ward.score_card.closure_credit,false);
assert.equal(ward.checklist.supplied_complete,true);
assert.equal(ward.checklist.closure_100,false);
assert.equal(ward.checklist.first_open.id,'VERIFY_SUPPLIED_CHECKLIST');
checks+=6;

const open=out.trinity.find(x=>x.item_ref==='ack:ibal#currentness');
assert.equal(open.punch_card.next,'RESOLVE_ACK_ITEM');
assert.equal(open.score_card.projected_state,'WAIT');
assert.equal(open.checklist.supplied_complete,false);
assert.equal(open.checklist.first_open.id,'RESULT_PRESENT');
checks+=4;

const na=out.trinity.find(x=>x.item_ref==='ack:ibal#not-applicable');
assert.equal(na.punch_card.obligation_state,'N_A');
assert.equal(na.score_card.projected_state,'N_A_WITH_EVIDENCE');
assert.equal(na.checklist.rows.length,8);
assert(na.checklist.rows.every(row=>row.state==='N_A'));
checks+=4;

const reversed=base();
reversed.ack_sources.reverse();
for(const s of reversed.ack_sources) s.items.reverse();
const out2=compileAckItemTrinity(reversed);
assert.deepEqual(out2.trinity.map(x=>x.item_ref),out.trinity.map(x=>x.item_ref));
assert.deepEqual(out2.trinity.map(x=>x.trinity_id),out.trinity.map(x=>x.trinity_id));
checks+=2;

const noEvidence=base();
noEvidence.ack_sources[0].items[0].evidence_refs=[];
const noEvidenceOut=compileAckItemTrinity(noEvidence);
assert.equal(noEvidenceOut.trinity.find(x=>x.item_ref==='ack:ward#effect-policy').score_card.projected_state,'UNKNOWN');
assert.equal(noEvidenceOut.trinity.find(x=>x.item_ref==='ack:ward#effect-policy').score_card.blocker,'POSITIVE_STATE_WITHOUT_EVIDENCE');
checks+=2;

const unresolvedBound=base();
unresolvedBound.ack_sources[0].items[0].declared_state='WAIT';
const unresolvedBoundOut=compileAckItemTrinity(unresolvedBound);
const unresolvedBoundRow=unresolvedBoundOut.trinity.find(x=>x.item_ref==='ack:ward#effect-policy');
assert.equal(unresolvedBoundRow.checklist.supplied_complete,true);
assert.equal(unresolvedBoundRow.score_card.projected_state,'WAIT');
assert(unresolvedBoundOut.open_item_refs.includes('ack:ward#effect-policy'));
assert.equal(unresolvedBoundOut.selection_state,'X43_SELECTION_REQUIRED');
checks+=4;

const unicode=base();
unicode.ack_sources[0].items=[item('é'),item('e\u0301')];
const unicodeOut=compileAckItemTrinity(unicode);
const unicodeReversed=structuredClone(unicode);
unicodeReversed.ack_sources[0].items.reverse();
const unicodeOutReversed=compileAckItemTrinity(unicodeReversed);
assert.deepEqual(unicodeOut.trinity.map(x=>x.item_ref),unicodeOutReversed.trinity.map(x=>x.item_ref));
assert.deepEqual(unicodeOut.trinity.map(x=>x.trinity_id),unicodeOutReversed.trinity.map(x=>x.trinity_id));
checks+=2;

const delimiterCollision=base();
delimiterCollision.ack_sources=[
  source('ack:a#b',[item('c')]),
  source('ack:a',[item('b#c')]),
  source('ack:a%23b',[item('c')]),
];
const delimiterCollisionOut=compileAckItemTrinity(delimiterCollision);
const delimiterRefs=delimiterCollisionOut.trinity.map(x=>x.item_ref);
assert.equal(new Set(delimiterRefs).size,3);
assert(delimiterRefs.includes('ack:a%23b#c'));
assert(delimiterRefs.includes('ack:a#b%23c'));
assert(delimiterRefs.includes('ack:a%2523b#c'));
checks+=4;

const callerForgery=base();
callerForgery.authority_granted=true;
callerForgery.provider_effect=true;
callerForgery.ack_sources[0].items[0].closure_100=true;
const forgedOut=compileAckItemTrinity(callerForgery);
assert.equal(forgedOut.authority_granted,false);
assert.equal(forgedOut.provider_effect,false);
assert.equal(forgedOut.trinity[0].score_card.closure_credit,false);
assert.equal(forgedOut.trinity[0].checklist.closure_100,false);
checks+=4;

const templateWait=base();
Object.assign(templateWait.rotfl_context.template_runs[0],{state:'WAIT',known_bit:1,value_bit:0});
const templateWaitOut=compileAckItemTrinity(templateWait);
assert.equal(templateWaitOut.rotfl_template_runtime_complete,false);
const templateWaitItem=templateWaitOut.trinity.find(x=>x.item_ref==='ack:ward#effect-policy');
assert.equal(templateWaitItem.punch_card.next,'EXECUTE_ROTFL_TEMPLATE');
assert.equal(templateWaitItem.checklist.first_open.id,'ROTFL_TEMPLATE_RUNTIME');
assert.equal(templateWaitItem.template_route.template_zero,1);
checks+=5;

const hostile = (mutate, pattern) => {
  const x=base();
  mutate(x);
  assert.throws(()=>compileAckItemTrinity(x),pattern);
  checks++;
};
hostile(x=>x.ack_sources=[],/ack_sources required/);
hostile(x=>x.ack_sources.push(structuredClone(x.ack_sources[0])),/duplicate ack_ref/);
hostile(x=>x.ack_sources[0].items.push(structuredClone(x.ack_sources[0].items[0])),/duplicate item_id/);
hostile(x=>x.ack_sources[0].root_generation='root:stale',/root_generation mismatch/);
hostile(x=>Object.assign(x.ack_sources[0].items[0],{required_bit:1,material_bit:0}),/required ACK item cannot be non-material/);
hostile(x=>x.ack_sources[0].items[0].owner_ref=null,/needs owner_ref and work_ref/);
hostile(x=>x.ack_sources[0].items[0].work_ref=null,/needs owner_ref and work_ref/);
hostile(x=>x.ack_sources[0].items[0].hex_qualification={state:'QUALIFIED',receipt_ref:null},/QUALIFIED requires receipt_ref/);
hostile(x=>x.ack_sources[0].items[0].currentness={state:'CURRENT',evidence_ref:null},/CURRENT requires evidence_ref/);
hostile(x=>x.ack_sources[0].items[0].declared_state='INVENTED',/declared_state invalid/);
hostile(x=>x.rotfl_context.template_runs=[],/rotfl_context invalid/);
hostile(x=>x.rotfl_context.template_runs[0].template_ref='template:undeclared',/rotfl_context invalid/);

assert(out.hard.includes('SCORECARD != PUNCHCARD'));
assert(out.hard.includes('CHECKLIST != SCORECARD'));
assert(out.hard.includes('NON_APPLICABLE != DROPPED'));
assert(out.hard.includes('OPEN_ITEM_LIST != X43_PRIORITY'));
checks+=4;

console.log(JSON.stringify({
  schema:'xiio.sdk.ack-item-trinity-validation/v1',
  result:'PASS',
  checks,
  hostiles:12,
  ack_items:out.ack_item_count,
  punch_cards:out.punch_card_count,
  score_cards:out.score_card_count,
  checklists:out.checklist_count,
  silent_remainder:out.silent_remainder,
  authority_granted:false,
  provider_effect:false
}));
