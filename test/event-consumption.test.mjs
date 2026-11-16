import assert from 'node:assert/strict';
import test from 'node:test';
import {createEventIntent,admitEvent,consumeEvent} from '../src/events/consumption.mjs';
import {createHash} from 'node:crypto';
const digest=createHash('sha256').update('payload').digest('hex');
const intent=createEventIntent({event_ref:'event:save',occurrence_ref:'occurrence:1',producer_ref:'product:a',consumer_ref:'product:b',work_ref:'work:1',generation:'g1',payload_sha256:digest});
const admission={schema:'xiio.ward.event-consumption-admission/v1',state:'ADMITTED',...Object.fromEntries(['event_ref','occurrence_ref','producer_ref','consumer_ref','work_ref','generation','event_identity_sha256','dedupe_ref'].map(k=>[k,intent[k]])),admission_ref:'admission:1',lease_ref:'lease:1',expires_at:'2026-11-16T18:00:00Z'};
const trustedAdmission={verifyAdmission:({admission})=>({state:'VERIFIED',admission_ref:admission.admission_ref,lease_ref:admission.lease_ref,provenance_ref:'switchboard:ward:verified:1'})};
const admitted=admitEvent(intent,admission,()=> '2026-11-16T17:00:00Z',trustedAdmission);
const receipt={schema:'xiio.consumer.apply-return-readback/v1',state:'APPLY_RETURN_READ_BACK',...Object.fromEntries(['event_ref','occurrence_ref','producer_ref','consumer_ref','work_ref','generation','event_identity_sha256','dedupe_ref'].map(k=>[k,intent[k]])),apply_return_ref:'apply:1',readback_ref:'readback:1',consumption_record_ref:'consumption:1',applied:true,read_back:true};

function store(){
 let record=null,effects=0;
 return {
  ports:{readConsumption:async()=>record,consumeOnce:async({admitted,receipt})=>{
   if(record)return {state:'DUPLICATE',...record};
   effects++;record={state:'CONSUMED',dedupe_ref:admitted.dedupe_ref,consumer_ref:admitted.consumer_ref,event_identity_sha256:admitted.event_identity_sha256,consumption_record_ref:receipt.consumption_record_ref};return record;
  }},
  effects:()=>effects,
 };
}

test('requires durable write plus independent reopen',async()=>{
 const s=store();const done=await consumeEvent(admitted,s.ports,receipt);
 assert.equal(done.state,'CONSUMED');assert.equal(s.effects(),1);
 assert.ok(done.hard.includes('CALLER_HISTORY != DEDUPE_AUTHORITY'));
});
test('same event after restart cannot cause second effect',async()=>{
 const s=store();await consumeEvent(admitted,s.ports,receipt);
 const second=await consumeEvent(admitted,s.ports,receipt);
 assert.equal(second.state,'DUPLICATE');assert.equal(second.consumed,false);assert.equal(s.effects(),1);
});
test('cross-product receipt is refused',async()=>{
 const s=store();await assert.rejects(()=>consumeEvent(admitted,s.ports,{...receipt,consumer_ref:'product:c'}),/CONSUMPTION_RECEIPT_IDENTITY_MISMATCH/);
});
test('delivery or apply without readback is not consumption',async()=>{
 await assert.rejects(()=>consumeEvent(admitted,store().ports,{...receipt,state:'RETURN'}),/APPLY_RETURN_READBACK_REQUIRED/);
 await assert.rejects(()=>consumeEvent(admitted,store().ports,{...receipt,read_back:false}),/CONSUMPTION_NOT_CONFIRMED/);
});
test('expired Ward admission is refused before consumption',()=>{
 assert.throws(()=>admitEvent(intent,{...admission,expires_at:'2026-11-16T16:59:59Z'},()=> '2026-11-16T17:00:00Z',trustedAdmission),/EVENT_ADMISSION_EXPIRED/);
});
test('unverified durable write or reopen is refused',async()=>{
 await assert.rejects(()=>consumeEvent(admitted,{readConsumption:async()=>null,consumeOnce:async()=>({state:'CONSUMED',dedupe_ref:intent.dedupe_ref,consumer_ref:intent.consumer_ref,event_identity_sha256:intent.event_identity_sha256,consumption_record_ref:'wrong'})},receipt),/DURABLE_CONSUMPTION_WRITE_UNVERIFIED/);
});

test('same provider object with a new generation is a distinct consumable event',async()=>{
 const nextIntent=createEventIntent({event_ref:'event:save',occurrence_ref:'occurrence:1',producer_ref:'product:a',consumer_ref:'product:b',work_ref:'work:1',generation:'g2',payload_sha256:digest});
 assert.notEqual(nextIntent.event_identity_sha256,intent.event_identity_sha256);
 assert.notEqual(nextIntent.dedupe_ref,intent.dedupe_ref);
 const nextAdmission={...admission,generation:'g2',event_identity_sha256:nextIntent.event_identity_sha256,dedupe_ref:nextIntent.dedupe_ref,admission_ref:'admission:2',lease_ref:'lease:2'};
 const nextAdmitted=admitEvent(nextIntent,nextAdmission,()=> '2026-11-16T17:00:00Z');
 const nextReceipt={...receipt,generation:'g2',event_identity_sha256:nextIntent.event_identity_sha256,dedupe_ref:nextIntent.dedupe_ref,apply_return_ref:'apply:2',readback_ref:'readback:2',consumption_record_ref:'consumption:2'};
 const s=store();
 const done=await consumeEvent(nextAdmitted,s.ports,nextReceipt);
 assert.equal(done.state,'CONSUMED');
 assert.equal(s.effects(),1);
});

test('caller-shaped admission cannot substitute for trusted admission provenance',()=>{
 assert.throws(()=>admitEvent(intent,admission,()=> '2026-11-16T17:00:00Z'),/TRUSTED_ADMISSION_VERIFIER_REQUIRED/);
 assert.throws(()=>admitEvent(intent,admission,()=> '2026-11-16T17:00:00Z',{verifyAdmission:()=>({state:'VERIFIED',admission_ref:'admission:forged',lease_ref:'lease:1',provenance_ref:'provider:caller'})}),/EVENT_ADMISSION_PROVENANCE_UNVERIFIED/);
 assert.throws(()=>admitEvent(intent,admission,()=> '2026-11-16T17:00:00Z',{verifyAdmission:()=>({state:'VERIFIED',admission_ref:'admission:1',lease_ref:'lease:forged',provenance_ref:'provider:caller'})}),/EVENT_ADMISSION_PROVENANCE_UNVERIFIED/);
});
