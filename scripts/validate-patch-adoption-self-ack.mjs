#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileAckItemTrinity } from '../src/acks/item-trinity.mjs';
import { validateRotflDistributedAck } from '../src/acks/distributed.mjs';

const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/acks/canary-065-patch-adoption-self-ack.v1.json',import.meta.url),'utf8'));
const ack=validateRotflDistributedAck(fixture.self_ack);
assert.equal(ack.ok,true);
assert.equal(ack.authority_granted,false);
assert.equal(ack.effect_attempt_eligible,false);
assert.equal(ack.template_runtime_complete,true);

const out=compileAckItemTrinity(fixture.trinity_input);
assert.equal(out.ack_item_count,10);
assert.equal(out.punch_card_count,10);
assert.equal(out.score_card_count,10);
assert.equal(out.checklist_count,10);
assert.equal(out.trinity_accounting_100,true);
assert.equal(out.silent_remainder,0);
assert.equal(out.authority_granted,false);
assert.equal(out.provider_effect,false);
assert.equal(out.external_communication,false);

const declared=fixture.trinity_input.ack_sources[0].items;
assert.equal(declared.filter(x=>x.declared_state==='PASS').length,6);
assert.equal(declared.filter(x=>x.declared_state==='WAIT').length,4);

const by=new Map(out.trinity.map(x=>[x.item_ref.split('#').at(-1),x]));
for(const id of ['ACK65-01','ACK65-02','ACK65-03','ACK65-04','ACK65-05','ACK65-09'])
  assert.equal(by.get(id).score_card.projected_state,'SUPPLIED_UNVERIFIED',id);
for(const id of ['ACK65-06','ACK65-07','ACK65-08','ACK65-10'])
  assert.equal(by.get(id).score_card.projected_state,'WAIT',id);

console.log(JSON.stringify({
 schema:'xiio.sdk.patch-adoption-self-ack-check/v1',
 status:'PASS',
 occurrence:'CANARY-065',
 self_ack_first:true,
 ack_items:10,
 declared_pass:6,
 declared_wait:4,
 trinity_accounting_100:true,
 rotfl_template_runtime_complete:true,
 authority_granted:false,
 provider_effect:false,
 external_communication:false,
 terminal:false,
 next:'COMPILE_MHP20_IN_EXISTING_CHAIN_RECOVERY_OWNER'
},null,2));
