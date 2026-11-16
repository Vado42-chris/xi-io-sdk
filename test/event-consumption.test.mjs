import assert from 'node:assert/strict';
import test from 'node:test';
import {createEventIntent,admitEvent,consumeEvent} from '../src/events/consumption.mjs';
import {createHash} from 'node:crypto';
const digest=createHash('sha256').update('payload').digest('hex');
const intent=createEventIntent({event_ref:'event:save',occurrence_ref:'occurrence:1',producer_ref:'product:a',consumer_ref:'product:b',work_ref:'work:1',generation:'g1',payload_sha256:digest});
const admission={schema:'xiio.ward.event-consumption-admission/v1',state:'ADMITTED',event_ref:intent.event_ref,occurrence_ref:intent.occurrence_ref,consumer_ref:intent.consumer_ref,work_ref:intent.work_ref,generation:intent.generation,event_identity_sha256:intent.event_identity_sha256,admission_ref:'admission:1',lease_ref:'lease:1'};
const admitted=admitEvent(intent,admission);
const receipt={schema:'xiio.consumer.apply-return-readback/v1',state:'APPLY_RETURN_READ_BACK',event_ref:intent.event_ref,occurrence_ref:intent.occurrence_ref,consumer_ref:intent.consumer_ref,work_ref:intent.work_ref,generation:intent.generation,event_identity_sha256:intent.event_identity_sha256,dedupe_ref:intent.dedupe_ref,apply_return_ref:'apply:1',readback_ref:'readback:1',applied:true,read_back:true};

test('requires exact authority-bound identity and confirmed consumption',()=>{
 const done=consumeEvent(admitted,[],receipt);
 assert.equal(done.state,'CONSUMED');assert.equal(done.consumed,true);
 assert.ok(done.hard.includes('DELIVERED != CONSUMED'));
});
test('same durable event cannot cause a second effect',()=>{
 const first=consumeEvent(admitted,[],receipt);
 const second=consumeEvent(admitted,[first],receipt);
 assert.equal(second.state,'DUPLICATE');assert.equal(second.consumed,false);
});
test('cross-product receipt is refused',()=>{
 assert.throws(()=>consumeEvent(admitted,[],{...receipt,consumer_ref:'product:c'}),/CONSUMPTION_RECEIPT_IDENTITY_MISMATCH/);
});
test('delivery or apply without readback is not consumption',()=>{
 assert.throws(()=>consumeEvent(admitted,[],{...receipt,state:'RETURN'}),/APPLY_RETURN_READBACK_REQUIRED/);
 assert.throws(()=>consumeEvent(admitted,[],{...receipt,read_back:false}),/CONSUMPTION_NOT_CONFIRMED/);
});
