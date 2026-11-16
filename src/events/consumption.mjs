import { createHash } from 'node:crypto';

export const EVENT_CONSUMPTION_SCHEMA='xiio.sdk.event-consumption/v1';
const REF=/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/;
const ref=(v,k)=>{if(typeof v!=='string'||!REF.test(v))throw new TypeError(k);return v;};
const sha=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>JSON.stringify(v,Object.keys(v).sort());

export function createEventIntent(input={}){
  const event_ref=ref(input.event_ref,'EVENT_REF_REQUIRED');
  const occurrence_ref=ref(input.occurrence_ref,'OCCURRENCE_REF_REQUIRED');
  const producer_ref=ref(input.producer_ref,'PRODUCER_REF_REQUIRED');
  const consumer_ref=ref(input.consumer_ref,'CONSUMER_REF_REQUIRED');
  const work_ref=ref(input.work_ref,'WORK_REF_REQUIRED');
  const generation=ref(input.generation,'GENERATION_REQUIRED');
  const payload_sha256=String(input.payload_sha256||'');
  if(!/^[a-f0-9]{64}$/.test(payload_sha256))throw new TypeError('PAYLOAD_SHA256_REQUIRED');
  const identity={event_ref,occurrence_ref,producer_ref,consumer_ref,work_ref,generation,payload_sha256};
  return Object.freeze({
    schema:EVENT_CONSUMPTION_SCHEMA,
    state:'INTENT',
    ...identity,
    event_identity_sha256:sha(canonical(identity)),
    dedupe_ref:`event:${sha(canonical(identity))}`,
    authority_granted:false,
    consumed:false,
  });
}

export function admitEvent(intent,admission={}){
  if(intent?.schema!==EVENT_CONSUMPTION_SCHEMA||intent.state!=='INTENT')throw new TypeError('EVENT_INTENT_REQUIRED');
  if(admission?.schema!=='xiio.ward.event-consumption-admission/v1'||admission.state!=='ADMITTED')throw new TypeError('EVENT_ADMISSION_REQUIRED');
  for(const key of ['event_ref','occurrence_ref','consumer_ref','work_ref','generation','event_identity_sha256']){
    if(admission[key]!==intent[key])throw new TypeError('EVENT_ADMISSION_IDENTITY_MISMATCH');
  }
  ref(admission.admission_ref,'ADMISSION_REF_REQUIRED');
  ref(admission.lease_ref,'LEASE_REF_REQUIRED');
  return Object.freeze({...intent,state:'ADMITTED',admission_ref:admission.admission_ref,lease_ref:admission.lease_ref,authority_granted:false});
}

export function consumeEvent(admitted,prior=[],receipt={}){
  if(admitted?.schema!==EVENT_CONSUMPTION_SCHEMA||admitted.state!=='ADMITTED')throw new TypeError('ADMITTED_EVENT_REQUIRED');
  if(!Array.isArray(prior))throw new TypeError('PRIOR_CONSUMPTIONS_REQUIRED');
  if(prior.some(x=>x?.dedupe_ref===admitted.dedupe_ref&&x?.consumed===true)){
    return Object.freeze({...admitted,state:'DUPLICATE',consumed:false,duplicate:true,first_red:'EVENT_ALREADY_CONSUMED'});
  }
  if(receipt?.schema!=='xiio.consumer.apply-return-readback/v1'||receipt.state!=='APPLY_RETURN_READ_BACK')throw new TypeError('APPLY_RETURN_READBACK_REQUIRED');
  for(const key of ['event_ref','occurrence_ref','consumer_ref','work_ref','generation','event_identity_sha256','dedupe_ref']){
    if(receipt[key]!==admitted[key])throw new TypeError('CONSUMPTION_RECEIPT_IDENTITY_MISMATCH');
  }
  ref(receipt.apply_return_ref,'APPLY_RETURN_REF_REQUIRED');
  ref(receipt.readback_ref,'READBACK_REF_REQUIRED');
  if(receipt.applied!==true||receipt.read_back!==true)throw new TypeError('CONSUMPTION_NOT_CONFIRMED');
  return Object.freeze({
    ...admitted,
    state:'CONSUMED',
    consumed:true,
    duplicate:false,
    apply_return_ref:receipt.apply_return_ref,
    readback_ref:receipt.readback_ref,
    authority_granted:false,
    hard:Object.freeze([
      'EVENT_ID != PAYLOAD_ID',
      'OCCURRENCE_ID != EVENT_ID',
      'DELIVERED != CONSUMED',
      'ACK != APPLY_RETURN',
      'APPLY_RETURN != READ_BACK',
      'DUPLICATE_EVENT != SECOND_EFFECT',
      'EVENT_ADDRESS != AUTHORITY',
    ]),
  });
}
