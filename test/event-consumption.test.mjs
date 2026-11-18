import assert from 'node:assert/strict';
import test from 'node:test';
import {createEventIntent,admitEvent,consumeEvent} from '../src/events/consumption.mjs';
import {createHash} from 'node:crypto';
const digest=createHash('sha256').update('payload').digest('hex');
const intent=createEventIntent({source_ref:'source:provider:object:1',delivery_ref:'delivery:1',event_ref:'event:save',occurrence_ref:'occurrence:1',producer_ref:'product:a',consumer_ref:'product:b',work_ref:'work:1',generation:'g1',payload_sha256:digest});
const admission={schema:'xiio.ward.event-consumption-admission/v1',state:'ADMITTED',...Object.fromEntries(['source_ref','delivery_ref','event_ref','occurrence_ref','producer_ref','consumer_ref','work_ref','generation','consumption_identity_sha256','dedupe_ref','effect_idempotency_key'].map(k=>[k,intent[k]])),admission_ref:'admission:1',lease_ref:'lease:1',expires_at:'2099-01-01T00:00:00Z'};
const trustedAdmission={verifyAdmission:({admission})=>({state:'VERIFIED',admission_ref:admission.admission_ref,lease_ref:admission.lease_ref,provenance_ref:'switchboard:ward:verified:1'})};
const admitted=admitEvent(intent,admission,()=> '2026-11-16T17:00:00Z',trustedAdmission);
const receipt={schema:'xiio.consumer.apply-return-readback/v1',state:'APPLY_RETURN_READ_BACK',...Object.fromEntries(['source_ref','delivery_ref','event_ref','occurrence_ref','producer_ref','consumer_ref','work_ref','generation','consumption_identity_sha256','dedupe_ref','effect_idempotency_key'].map(k=>[k,intent[k]])),apply_return_ref:'apply:1',readback_ref:'readback:1',consumption_record_ref:'consumption:1',applied:true,read_back:true};

function store(initialRecord=null){
 let record=initialRecord,effects=0;
 return {
  ports:{readConsumption:async()=>record,consumeOnce:async({admitted,receipt})=>{
   if(record)return {state:'DUPLICATE',...record};
   effects++;record={state:'CONSUMED',dedupe_ref:admitted.dedupe_ref,consumer_ref:admitted.consumer_ref,consumption_identity_sha256:admitted.consumption_identity_sha256,consumption_record_ref:receipt.consumption_record_ref};return record;
  }},
  effects:()=>effects,
 };
}

function expiredConsumptionAdmission(){
 return admitEvent(intent,{
  ...admission,
  admission_ref:'admission:expired-consumption',
  lease_ref:'lease:expired-consumption',
  expires_at:'2026-11-16T18:00:00Z',
 },()=> '2026-11-16T17:00:00Z',trustedAdmission);
}

test('requires durable write plus independent reopen',async()=>{
 const s=store();const done=await consumeEvent(admitted,s.ports,receipt);
 assert.equal(done.state,'CONSUMED');assert.equal(s.effects(),1);
 assert.ok(done.hard.includes('CALLER_HISTORY != DEDUPE_AUTHORITY'));
 assert.ok(done.hard.includes('EXPIRED_ADMISSION != NEW_EFFECT'));
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
test('admission expiring after admission cannot authorize a first durable effect',async()=>{
 const s=store();
 await assert.rejects(()=>consumeEvent(
   expiredConsumptionAdmission(),
   {...s.ports,clock:()=> '2026-11-16T18:00:01Z'},
   receipt,
 ),/EVENT_ADMISSION_EXPIRED/);
 assert.equal(s.effects(),0);
});
test('consumption uses the injected trusted clock rather than process wall time',async()=>{
 const s=store();
 const done=await consumeEvent(
   expiredConsumptionAdmission(),
   {...s.ports,clock:()=> '2026-11-16T17:30:00Z'},
   receipt,
 );
 assert.equal(done.state,'CONSUMED');
 assert.equal(s.effects(),1);
});
test('expired admission can reconcile an existing duplicate without a second effect',async()=>{
 const prior={state:'CONSUMED',dedupe_ref:intent.dedupe_ref,consumer_ref:intent.consumer_ref,consumption_identity_sha256:intent.consumption_identity_sha256,consumption_record_ref:receipt.consumption_record_ref};
 const s=store(prior);
 const done=await consumeEvent(expiredConsumptionAdmission(),{...s.ports,clock:()=> '2026-11-16T19:00:00Z'},receipt);
 assert.equal(done.state,'DUPLICATE');
 assert.equal(done.consumed,false);
 assert.equal(s.effects(),0);
});
test('admitted record must retain lease and trusted provenance coordinates',async()=>{
 for(const [field,code] of [['admission_ref','ADMISSION_REF_REQUIRED'],['lease_ref','LEASE_REF_REQUIRED'],['admission_provenance_ref','ADMISSION_PROVENANCE_REF_REQUIRED'],['expires_at','ADMISSION_EXPIRES_AT_REQUIRED']]){
  await assert.rejects(()=>consumeEvent({...admitted,[field]:undefined},store().ports,receipt),new RegExp(code));
 }
});
test('unverified durable write or reopen is refused',async()=>{
 await assert.rejects(()=>consumeEvent(admitted,{readConsumption:async()=>null,consumeOnce:async()=>({state:'CONSUMED',dedupe_ref:intent.dedupe_ref,consumer_ref:intent.consumer_ref,consumption_identity_sha256:intent.consumption_identity_sha256,consumption_record_ref:'wrong'})},receipt),/DURABLE_CONSUMPTION_WRITE_UNVERIFIED/);
});

test('same provider object with a new generation is a distinct consumable event',async()=>{
 const nextIntent=createEventIntent({source_ref:'source:provider:object:1',delivery_ref:'delivery:2',event_ref:'event:save',occurrence_ref:'occurrence:1',producer_ref:'product:a',consumer_ref:'product:b',work_ref:'work:1',generation:'g2',payload_sha256:digest});
 assert.notEqual(nextIntent.consumption_identity_sha256,intent.consumption_identity_sha256);
 assert.notEqual(nextIntent.dedupe_ref,intent.dedupe_ref);
 const nextAdmission={...admission,delivery_ref:nextIntent.delivery_ref,generation:'g2',consumption_identity_sha256:nextIntent.consumption_identity_sha256,dedupe_ref:nextIntent.dedupe_ref,effect_idempotency_key:nextIntent.effect_idempotency_key,admission_ref:'admission:2',lease_ref:'lease:2'};
 const nextAdmitted=admitEvent(nextIntent,nextAdmission,()=> '2026-11-16T17:00:00Z',trustedAdmission);
 const nextReceipt={...receipt,delivery_ref:nextIntent.delivery_ref,generation:'g2',consumption_identity_sha256:nextIntent.consumption_identity_sha256,dedupe_ref:nextIntent.dedupe_ref,effect_idempotency_key:nextIntent.effect_idempotency_key,apply_return_ref:'apply:2',readback_ref:'readback:2',consumption_record_ref:'consumption:2'};
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

test('pending durable record is not completed consumption and must not silently drop event',async()=>{
 const pending={state:'EFFECT_STARTED',dedupe_ref:intent.dedupe_ref,consumer_ref:intent.consumer_ref,consumption_identity_sha256:intent.consumption_identity_sha256,consumption_record_ref:'consumption:pending'};
 await assert.rejects(()=>consumeEvent(admitted,{readConsumption:async()=>pending,consumeOnce:async()=>{throw Error('must not blindly retry')}},receipt),/DURABLE_CONSUMPTION_RECONCILIATION_REQUIRED/);
});
test('reopened record for another product cannot verify consumption',async()=>{
 let reads=0;const record={state:'CONSUMED',dedupe_ref:intent.dedupe_ref,consumer_ref:intent.consumer_ref,consumption_identity_sha256:intent.consumption_identity_sha256,consumption_record_ref:receipt.consumption_record_ref};
 await assert.rejects(()=>consumeEvent(admitted,{readConsumption:async()=>++reads===1?null:{...record,consumer_ref:'product:other'},consumeOnce:async()=>record},receipt),/DURABLE_CONSUMPTION_READBACK_UNVERIFIED/);
});
test('atomic duplicate result from different identity must not drop this event',async()=>{
 await assert.rejects(()=>consumeEvent(admitted,{readConsumption:async()=>null,consumeOnce:async()=>({state:'DUPLICATE',dedupe_ref:'wrong',consumer_ref:'product:other',consumption_identity_sha256:'wrong',consumption_record_ref:'consumption:other'})},receipt),/DURABLE_CONSUMPTION_RECORD_MISMATCH/);
});
test('changed consumer retaining stale hash is refused even with verified admission reference',()=>{
 const altered={...intent,consumer_ref:'product:other'};
 assert.throws(()=>admitEvent(altered,{...admission,consumer_ref:'product:other'},()=> '2026-11-16T17:00:00Z',trustedAdmission),/EVENT_IDENTITY_DIGEST_MISMATCH/);
});

test('source delivery event occurrence generation payload and effect identities remain distinct',()=>{
 assert.notEqual(intent.source_ref,intent.delivery_ref);
 assert.notEqual(intent.delivery_ref,intent.event_ref);
 assert.notEqual(intent.event_ref,intent.occurrence_ref);
 assert.notEqual(intent.event_ref,intent.generation);
 assert.notEqual(intent.event_ref,intent.payload_sha256);
 assert.notEqual(intent.event_ref,intent.consumption_identity_sha256);
 assert.notEqual(intent.effect_idempotency_key,intent.dedupe_ref);
 assert.equal(intent.authority_granted,false);
});
test('redelivery changes delivery evidence without changing durable consumption identity',()=>{
 const redelivery=createEventIntent({source_ref:'source:provider:object:1',delivery_ref:'delivery:retry-2',event_ref:'event:save',occurrence_ref:'occurrence:1',producer_ref:'product:a',consumer_ref:'product:b',work_ref:'work:1',generation:'g1',payload_sha256:digest});
 assert.equal(redelivery.event_ref,intent.event_ref);
 assert.equal(redelivery.occurrence_ref,intent.occurrence_ref);
 assert.notEqual(redelivery.delivery_ref,intent.delivery_ref);
 assert.equal(redelivery.consumption_identity_sha256,intent.consumption_identity_sha256);
 assert.equal(redelivery.dedupe_ref,intent.dedupe_ref);
 assert.equal(redelivery.effect_idempotency_key,intent.effect_idempotency_key);
});

test('caller cannot change deterministic effect key while retaining valid consumption digest',()=>{
 const changed={...intent,effect_idempotency_key:'effect:other'};
 assert.throws(()=>admitEvent(changed,{...admission,effect_idempotency_key:'effect:other'},()=> '2026-11-16T17:00:00Z',trustedAdmission),/EVENT_IDENTITY_DIGEST_MISMATCH/);
});
