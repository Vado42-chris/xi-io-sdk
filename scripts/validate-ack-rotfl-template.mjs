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
assert.equal(verdict.ok,true); assert.equal(verdict.runtime_complete,true); checks+=2;

let route=compileRotflAckTemplateRoute({item_ref:'ack:test#cell',rotfl:{reusable_template_refs:refs,template_runs:refs.map(run)}});
assert.equal(route.template_denominator,3);
assert.equal(route.template_pass,3);
assert.equal(route.template_zero,0);
assert.equal(route.runtime_complete,true);
assert.equal(route.authority_granted,false);
assert.equal(route.provider_effect,false);
checks+=6;

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
  route=compileRotflAckTemplateRoute({item_ref:'ack:'+id,rotfl:{reusable_template_refs:refs,template_runs:runs}});
  assert.equal(route.runtime_complete,false,id);
  assert.equal(route.template_zero,1,id);
  checks+=4;
}

verdict=validateRotflAckTemplateRuns(refs,refs.slice(0,2).map(run));
assert.equal(verdict.ok,false);
assert(verdict.errors.includes('TEMPLATE_RUN_MISSING:template:hot-patch-cadence'));
checks+=2;

verdict=validateRotflAckTemplateRuns(refs,[...refs.map(run),run('template:extra')]);
assert.equal(verdict.ok,false);
assert(verdict.errors.includes('TEMPLATE_RUN_UNDECLARED:template:extra'));
checks+=2;

assert.throws(()=>compileRotflAckTemplateRoute({item_ref:'ack:x',rotfl:{reusable_template_refs:refs,template_runs:[run(refs[0],{known_bit:0,value_bit:1}),run(refs[1]),run(refs[2])]}}),/invalid/i);
checks+=1;

console.log(JSON.stringify({
  schema:'xiio.sdk.ack-rotfl-template-validation/v1',
  result:'PASS',
  checks,
  template_denominator:refs.length,
  hostiles:7,
  talk_action_zero_enforced:true,
  time_money_bound_enforced:true,
  authority_granted:false,
  provider_effect:false
}));
