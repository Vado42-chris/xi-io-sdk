#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  ROTFL_ACK_TEMPLATE_RUN_SCHEMA,
  validateRotflAckTemplateRuns,
  compileRotflAckTemplateRoute,
} from '../src/acks/rotfl-template.mjs';

const run=(ref,overrides={})=>({
  schema:ROTFL_ACK_TEMPLATE_RUN_SCHEMA,
  template_ref:ref,
  template_generation:'template:g1',
  runtime_ref:'runtime:rotfl:template',
  runtime_generation:'runtime:g1',
  runtime_rotfl_receipt_ref:'receipt:rotfl:g1',
  runtime_readback_ref:'readback:rotfl:g1',
  next_input_ref:'next:rotfl:g1',
  state:'EXECUTED',
  known_bit:1,
  value_bit:1,
  talk_action_zero_bit:1,
  time_money_bound_bit:1,
  ...overrides,
});

const refs=['template:KnowledgeReturn','template:OnboardingPack','template:hot-patch-cadence'];
let checks=0;
let verdict=validateRotflAckTemplateRuns(refs,refs.map(run));
assert.equal(verdict.ok,true); assert.equal(verdict.supplied_complete,true);
assert.equal(verdict.runtime_complete,false);
assert.equal(verdict.verification_state,'SUPPLIED_UNVERIFIED'); checks+=4;

let route=compileRotflAckTemplateRoute({item_ref:'ack:test#cell',rotfl:{reusable_template_refs:refs,template_runs:refs.map(run)}});
assert.equal(route.template_denominator,3);
assert.equal(route.template_pass,0);
assert.equal(route.template_zero,3);
assert.equal(route.template_supplied_pass,3);
assert.equal(route.template_supplied_zero,0);
assert.equal(route.supplied_runtime_complete,true);
assert.equal(route.runtime_complete,false);
assert.equal(route.verification_state,'SUPPLIED_UNVERIFIED');
assert.equal(route.authority_granted,false);
assert.equal(route.provider_effect,false);
checks+=9;

for(const [id,mutate] of [
  ['talk-action-zero',x=>x[0].talk_action_zero_bit=0],
  ['time-money-unbound',x=>x[0].time_money_bound_bit=0],
  ['runtime-wait',x=>Object.assign(x[0],{state:'WAIT',known_bit:1,value_bit:0})],
  ['runtime-unknown',x=>Object.assign(x[0],{state:'UNKNOWN',known_bit:0,value_bit:0})],
]){
  const runs=refs.map(run); mutate(runs);
  verdict=validateRotflAckTemplateRuns(refs,runs);
  assert.equal(verdict.ok,true,id);
  assert.equal(verdict.runtime_complete,false,id);
  assert.equal(verdict.supplied_complete,false,id);
  route=compileRotflAckTemplateRoute({item_ref:'ack:'+id,rotfl:{reusable_template_refs:refs,template_runs:runs}});
  assert.equal(route.runtime_complete,false,id);
  assert.equal(route.supplied_runtime_complete,false,id);
  assert.equal(route.template_zero,3,id);
  assert.equal(route.template_supplied_zero,1,id);
  checks+=7;
}

verdict=validateRotflAckTemplateRuns(refs,refs.slice(0,2).map(run));
assert.equal(verdict.ok,false);
assert(verdict.errors.includes('TEMPLATE_RUN_MISSING:template:hot-patch-cadence'));
checks+=2;

verdict=validateRotflAckTemplateRuns(refs,[...refs.map(run),run('template:extra')]);
assert.equal(verdict.ok,false);
assert(verdict.errors.includes('TEMPLATE_RUN_UNDECLARED:template:extra'));
checks+=2;

// Hostile: shared, fabricated receipts and self-awarded verification flags.
const forged=refs.map(ref=>run(ref,{
  runtime_rotfl_receipt_ref:'receipt:fiction',
  runtime_readback_ref:'readback:fiction',
  authenticated:true,verified:true,provider_effect:true,
}));
verdict=validateRotflAckTemplateRuns(refs,forged);
route=compileRotflAckTemplateRoute({item_ref:'ack:forged',rotfl:{reusable_template_refs:refs,template_runs:forged}});
assert.equal(verdict.ok,true);
assert.equal(verdict.runtime_complete,false);
assert.equal(route.template_supplied_pass,3);
assert.equal(route.template_pass,0);
assert.equal(route.runtime_complete,false);
assert.equal(route.receipt_independence_verified,false);
assert.equal(route.generation_current_verified,false);
assert.equal(route.authority_granted,false);
assert.equal(route.provider_effect,false);
const otherReadback=refs.map(ref=>run(ref,{runtime_rotfl_receipt_ref:'receipt:another',runtime_readback_ref:'readback:another'}));
const routeWithOtherReadback=compileRotflAckTemplateRoute({item_ref:'ack:forged',rotfl:{reusable_template_refs:refs,template_runs:otherReadback}});
assert.equal(route.route_id,routeWithOtherReadback.route_id);
assert.notEqual(route.submission_digest,routeWithOtherReadback.submission_digest);
assert.equal(routeWithOtherReadback.runtime_complete,false);
checks+=12;

assert.throws(()=>compileRotflAckTemplateRoute({item_ref:'ack:x',rotfl:{reusable_template_refs:refs,template_runs:[run(refs[0],{known_bit:0,value_bit:1}),run(refs[1]),run(refs[2])]}}),/invalid/i);
checks+=1;

console.log(JSON.stringify({
  schema:'xiio.sdk.ack-rotfl-template-validation/v1',
  result:'PASS',
  checks,
  template_denominator:refs.length,
  hostiles:8,
  talk_action_zero_enforced:true,
  time_money_bound_enforced:true,
  authority_granted:false,
  provider_effect:false
}));
