#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileAckItemTrinity } from '../src/acks/item-trinity.mjs';
import { validateRotflDistributedAck } from '../src/acks/distributed.mjs';

const f=JSON.parse(fs.readFileSync(new URL('../fixtures/acks/canary-061-write-readback-self-ack.v1.json',import.meta.url),'utf8'));
const ack=validateRotflDistributedAck(f.self_ack);
assert.equal(ack.ok,true);
assert.equal(ack.authority_granted,false);
assert.equal(ack.effect_attempt_eligible,false);
assert.equal(ack.template_runtime_complete,true);
const out=compileAckItemTrinity(f.trinity_input);
assert.equal(out.ack_item_count,6);
assert.equal(out.punch_card_count,6);
assert.equal(out.score_card_count,6);
assert.equal(out.checklist_count,6);
assert.equal(out.trinity_accounting_100,true);
assert.equal(out.silent_remainder,0);
assert.equal(out.rotfl_template_runtime_complete,true);
assert.equal(out.authority_granted,false);
assert.equal(out.provider_effect,false);
assert.equal(out.external_communication,false);
const declared=f.trinity_input.ack_sources[0].items;
assert.equal(declared.filter(x=>x.declared_state==='PASS').length,1);
assert.equal(declared.filter(x=>x.declared_state==='WAIT').length,5);
assert.equal(out.open_item_refs.length,6);
console.log(JSON.stringify({
 schema:'xiio.sdk.write-readback-self-ack-check/v1',
 status:'PASS',occurrence:'CANARY-061',self_ack_first:true,
 ack_items:6,declared_pass:1,declared_wait:5,trinity_accounting_100:true,
 rotfl_template_runtime_complete:true,authority_granted:false,provider_effect:false,
 external_communication:false,terminal:false,next:'PATCH_SHARED_WRITE_VERIFICATION_OWNER'
},null,2));
