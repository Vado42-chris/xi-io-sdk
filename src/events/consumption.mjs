import { createHash } from 'node:crypto';

export const EVENT_CONSUMPTION_SCHEMA='xiio.sdk.event-consumption/v1';
const REF=/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/;
const REF_FIELDS=['event_ref','occurrence_ref','producer_ref','consumer_ref','work_ref','generation'];
const ref=(v,k)=>{if(typeof v!=='string'||!REF.test(v))throw new TypeError(k);return v;};
const sha=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>JSON.stringify(Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))));
const instant=(v,k)=>{if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))throw new TypeError(k);return v;};

export function createEventIntent(input={}){
  const identity=Object.fromEntries(REF_FIELDS.map(k=>[k,ref(input[k],k.toUpperCase()+'_REQUIRED')]));
  const payload_sha256=String(input.payload_sha256||'');
  if(!/^[a-f0-9]{64}$/.test(payload_sha256))throw new TypeError('PAYLOAD_SHA256_REQUIRED');
  Object.assign(identity,{payload_sha256});
  const event_identity_sha256=sha(canonical(identity));
  return Object.freeze({
    schema:EVENT_CONSUMPTION_SCHEMA,state:'INTENT',...identity,event_identity_sha256,
    dedupe_ref:`event:${event_identity_sha256}`,authority_granted:false,consumed:false,
  });
}

export function admitEvent(intent,admission={},now=()=>new Date().toISOString()){
  if(intent?.schema!==EVENT_CONSUMPTION_SCHEMA||intent.state!=='INTENT')throw new TypeError('EVENT_INTENT_REQUIRED');
  if(admission?.schema!=='xiio.ward.event-consumption-admission/v1'||admission.state!=='ADMITTED')throw new TypeError('EVENT_ADMISSION_REQUIRED');
  for(const key of [...REF_FIELDS,'event_identity_sha256','dedupe_ref']){
    if(admission[key]!==intent[key])throw new TypeError('EVENT_ADMISSION_IDENTITY_MISMATCH');
  }
  ref(admission.admission_ref,'ADMISSION_REF_REQUIRED');ref(admission.lease_ref,'LEASE_REF_REQUIRED');
  const expires=instant(admission.expires_at,'ADMISSION_EXPIRES_AT_REQUIRED');
  if(Date.parse(expires)<=Date.parse(instant(now(),'CLOCK_INVALID')))throw new TypeError('EVENT_ADMISSION_EXPIRED');
  return Object.freeze({...intent,state:'ADMITTED',admission_ref:admission.admission_ref,lease_ref:admission.lease_ref,expires_at:expires,authority_granted:false});
}

function verifyReceipt(admitted,receipt){
  if(receipt?.schema!=='xiio.consumer.apply-return-readback/v1'||receipt.state!=='APPLY_RETURN_READ_BACK')throw new TypeError('APPLY_RETURN_READBACK_REQUIRED');
  for(const key of [...REF_FIELDS,'event_identity_sha256','dedupe_ref']){
    if(receipt[key]!==admitted[key])throw new TypeError('CONSUMPTION_RECEIPT_IDENTITY_MISMATCH');
  }
  ref(receipt.apply_return_ref,'APPLY_RETURN_REF_REQUIRED');ref(receipt.readback_ref,'READBACK_REF_REQUIRED');
  ref(receipt.consumption_record_ref,'CONSUMPTION_RECORD_REF_REQUIRED');
  if(receipt.applied!==true||receipt.read_back!==true)throw new TypeError('CONSUMPTION_NOT_CONFIRMED');
}

/**
 * Durable consumption is a storage transaction, not an in-memory Set.
 * The store owns duplicate detection and atomic record creation. SDK never
 * treats a caller-supplied history list as proof that an occurrence is new.
 */
export async function consumeEvent(admitted,{readConsumption,consumeOnce}={},receipt={}){
  if(admitted?.schema!==EVENT_CONSUMPTION_SCHEMA||admitted.state!=='ADMITTED')throw new TypeError('ADMITTED_EVENT_REQUIRED');
  if(typeof readConsumption!=='function'||typeof consumeOnce!=='function')throw new TypeError('DURABLE_CONSUMPTION_STORE_REQUIRED');
  const prior=await readConsumption({dedupe_ref:admitted.dedupe_ref,consumer_ref:admitted.consumer_ref});
  if(prior){
    if(prior.dedupe_ref!==admitted.dedupe_ref||prior.consumer_ref!==admitted.consumer_ref||prior.event_identity_sha256!==admitted.event_identity_sha256) {
      throw new TypeError('DURABLE_CONSUMPTION_RECORD_MISMATCH');
    }
    return Object.freeze({...admitted,state:'DUPLICATE',consumed:false,duplicate:true,first_red:'EVENT_ALREADY_CONSUMED',consumption_record_ref:ref(prior.consumption_record_ref,'CONSUMPTION_RECORD_REF_REQUIRED')});
  }
  verifyReceipt(admitted,receipt);
  const stored=await consumeOnce({admitted,receipt});
  if(stored?.state==='DUPLICATE'){
    return Object.freeze({...admitted,state:'DUPLICATE',consumed:false,duplicate:true,first_red:'EVENT_ALREADY_CONSUMED',consumption_record_ref:ref(stored.consumption_record_ref,'CONSUMPTION_RECORD_REF_REQUIRED')});
  }
  if(stored?.state!=='CONSUMED'||stored.dedupe_ref!==admitted.dedupe_ref||stored.consumer_ref!==admitted.consumer_ref||
     stored.event_identity_sha256!==admitted.event_identity_sha256||stored.consumption_record_ref!==receipt.consumption_record_ref) {
    throw new TypeError('DURABLE_CONSUMPTION_WRITE_UNVERIFIED');
  }
  const reopened=await readConsumption({dedupe_ref:admitted.dedupe_ref,consumer_ref:admitted.consumer_ref});
  if(!reopened||reopened.state!=='CONSUMED'||reopened.consumption_record_ref!==stored.consumption_record_ref||
     reopened.dedupe_ref!==admitted.dedupe_ref||reopened.event_identity_sha256!==admitted.event_identity_sha256) {
    throw new TypeError('DURABLE_CONSUMPTION_READBACK_UNVERIFIED');
  }
  return Object.freeze({
    ...admitted,state:'CONSUMED',consumed:true,duplicate:false,
    apply_return_ref:receipt.apply_return_ref,readback_ref:receipt.readback_ref,
    consumption_record_ref:stored.consumption_record_ref,authority_granted:false,
    hard:Object.freeze([
      'EVENT_ID != PAYLOAD_ID','OCCURRENCE_ID != EVENT_ID','DELIVERED != CONSUMED',
      'ACK != APPLY_RETURN','APPLY_RETURN != READ_BACK','DUPLICATE_EVENT != SECOND_EFFECT',
      'EVENT_ADDRESS != AUTHORITY','CALLER_HISTORY != DEDUPE_AUTHORITY',
      'CONSUMPTION_WRITE != CONSUMPTION_READBACK',
    ]),
  });
}
