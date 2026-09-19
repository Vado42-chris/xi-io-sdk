#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileAckItemTrinity } from '../src/acks/item-trinity.mjs';
import { validateRotflDistributedAck } from '../src/acks/distributed.mjs';

const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/acks/canary-059-preflight-self-ack.v1.json',import.meta.url),'utf8'));

const ack=validateRotflDistributedAck(fixture.self_ack);
assert.equal(ack.ok,true,'self ACK must validate before Trinity');
assert.equal(ack.authority_granted,false);
assert.equal(ack.effect_attempt_eligible,false);
assert.equal(ack.template_runtime_complete,true);

const out=compileAckItemTrinity(fixture.trinity_input);
assert.equal(out.ack_item_count,15);
assert.equal(out.punch_card_count,15);
assert.equal(out.score_card_count,15);
assert.equal(out.checklist_count,15);
assert.equal(out.trinity_accounting_100,true);
assert.equal(out.silent_remainder,0);
assert.equal(out.authority_granted,false);
assert.equal(out.provider_effect,false);
assert.equal(out.external_communication,false);
assert.equal(out.rotfl_template_runtime_complete,true);

const declared=fixture.trinity_input.ack_sources[0].items;
assert.equal(declared.filter(x=>x.declared_state==='PASS').length,5);
assert.equal(declared.filter(x=>x.declared_state==='WAIT').length,10);
assert.equal(out.open_item_refs.length,15,'supplied/unverified and WAIT items must stay open');

for(const entry of out.trinity){
  assert.equal(entry.punch_card.item_ref,entry.item_ref);
  assert.equal(entry.score_card.item_ref,entry.item_ref);
  assert.equal(entry.checklist.item_ref,entry.item_ref);
  assert.equal(entry.punch_card.rotfl_template_route_ref,entry.template_route.route_id);
  assert.equal(entry.score_card.rotfl_template_route_ref,entry.template_route.route_id);
  assert.equal(entry.checklist.rotfl_template_route_ref,entry.template_route.route_id);
  assert.equal(entry.template_route.runtime_complete,true);
  assert.equal(entry.template_route.authority_granted,false);
  assert.equal(entry.template_route.provider_effect,false);
}

const byId=new Map(out.trinity.map(x=>[x.item_ref.split('#').at(-1),x]));
for(const id of ['ACK59-04','ACK59-05','ACK59-06','ACK59-08','ACK59-09','ACK59-10','ACK59-12','ACK59-13','ACK59-14','ACK59-15']){
  const entry=byId.get(id);
  assert(entry, id+' missing');
  assert.equal(entry.score_card.projected_state,'WAIT',id+' must remain WAIT');
}
for(const id of ['ACK59-01','ACK59-02','ACK59-03','ACK59-07','ACK59-11']){
  const entry=byId.get(id);
  assert(entry, id+' missing');
  assert.equal(entry.score_card.projected_state,'SUPPLIED_UNVERIFIED',id+' must not self-verify PASS');
}

console.log(JSON.stringify({
  schema:'xiio.sdk.preflight-self-ack-check/v1',
  status:'PASS',
  occurrence:'CANARY-059',
  self_ack_first:true,
  ack_state:'ACK',
  ack_items:out.ack_item_count,
  declared_pass:5,
  declared_wait:10,
  trinity_accounting_100:out.trinity_accounting_100,
  open_items:out.open_item_refs.length,
  rotfl_template_runtime_complete:out.rotfl_template_runtime_complete,
  authority_granted:false,
  provider_effect:false,
  external_communication:false,
  terminal:false,
  next:'COMPILE_CANONICAL_HEURISTICS_SIM_DENOMINATOR'
},null,2));
