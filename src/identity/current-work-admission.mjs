import {readCurrentOnboarding} from './onboarding-current.mjs';

export const CURRENT_WORK_ADMISSION_SCHEMA='xiio.sdk.current-work-admission/v1';
const REF=/^[A-Za-z0-9][A-Za-z0-9:._/@+-]{0,255}$/;
const forbidden=/token|password|secret|credential|api.?key|authorization/i;

const fail=code=>{const e=new TypeError(code);e.code=code;throw e};
const object=(v,c)=>{if(!v||typeof v!=='object'||Array.isArray(v))fail(c);return v};
const ref=(v,c)=>{if(typeof v!=='string'||!REF.test(v))fail(c);return v};
const bool=(v,c)=>{if(typeof v!=='boolean')fail(c);return v};
const secretFree=(v,path='$')=>{
  if(v===null||v===undefined||['string','number','boolean'].includes(typeof v))return;
  if(Array.isArray(v)){v.forEach((x,i)=>secretFree(x,`${path}[${i}]`));return;}
  if(typeof v!=='object')fail('CURRENT_WORK_ADMISSION_NONDATA_REFUSED');
  for(const [k,x] of Object.entries(v)){
    if(forbidden.test(k))fail('CURRENT_WORK_ADMISSION_SECRET_FIELD_REFUSED');
    secretFree(x,`${path}.${k}`);
  }
};
const snapshot=(row,fields,prefix)=>Object.freeze(Object.fromEntries(
  fields.map(k=>[k,ref(row[k],`${prefix}_${k.toUpperCase()}_REQUIRED`)]),
));

function normalizeRequest(input){
  const raw=object(input,'CURRENT_WORK_ADMISSION_REQUEST_REQUIRED');
  secretFree(raw);
  for(const forbiddenKey of [
    'account_ref','workspace_ref','session_ref','principal_ref','work_ref',
    'work_generation','assignment_ref','authority_ref','admission_ref'
  ]) if(Object.prototype.hasOwnProperty.call(raw,forbiddenKey))
    fail('CURRENT_WORK_ADMISSION_CALLER_IDENTITY_FORBIDDEN');
  const target_refs=Array.isArray(raw.target_refs)
    ? Object.freeze(raw.target_refs.map((v,i)=>ref(v,`CURRENT_WORK_ADMISSION_TARGET_${i}_INVALID`)))
    : Object.freeze([]);
  return Object.freeze({
    consumer_ref:ref(raw.consumer_ref,'CURRENT_WORK_ADMISSION_CONSUMER_REQUIRED'),
    operation_ref:ref(raw.operation_ref,'CURRENT_WORK_ADMISSION_OPERATION_REQUIRED'),
    capability_ref:ref(raw.capability_ref,'CURRENT_WORK_ADMISSION_CAPABILITY_REQUIRED'),
    device_ref:ref(raw.device_ref,'CURRENT_WORK_ADMISSION_DEVICE_REQUIRED'),
    operation_type:ref(raw.operation_type,'CURRENT_WORK_ADMISSION_OPERATION_TYPE_REQUIRED'),
    target_refs,
  });
}

function normalizeOnboarding(row){
  const x=object(row,'CURRENT_WORK_ADMISSION_ONBOARDING_REQUIRED');
  if(x.schema!=='xiio.onboarding.current/v1'||x.state!=='CONNECTION_CHOICE_REQUIRED'||
     x.authenticated!==true) fail('CURRENT_WORK_ADMISSION_ONBOARDING_NOT_AUTHENTICATED');
  const session=object(x.session,'CURRENT_WORK_ADMISSION_SESSION_REQUIRED');
  return Object.freeze({
    account_ref:ref(x.account_ref,'CURRENT_WORK_ADMISSION_ACCOUNT_REQUIRED'),
    workspace_ref:ref(x.workspace_ref,'CURRENT_WORK_ADMISSION_WORKSPACE_REQUIRED'),
    session_ref:ref(session.session_ref,'CURRENT_WORK_ADMISSION_SESSION_REF_REQUIRED'),
  });
}

function normalizeWork(row,onboarding,request){
  const x=object(row,'CURRENT_WORK_ADMISSION_CURRENT_WORK_REQUIRED');
  secretFree(x);
  if(x.state!=='CURRENT')fail('CURRENT_WORK_ADMISSION_WORK_NOT_CURRENT');
  for(const [key,expected] of Object.entries(onboarding)){
    if(ref(x[key],`CURRENT_WORK_ADMISSION_WORK_${key.toUpperCase()}_REQUIRED`)!==expected)
      fail('CURRENT_WORK_ADMISSION_WORK_ONBOARDING_MISMATCH');
  }
  for(const [key,expected] of Object.entries({
    consumer_ref:request.consumer_ref,
    operation_ref:request.operation_ref,
    capability_ref:request.capability_ref,
  })){
    if(ref(x[key],`CURRENT_WORK_ADMISSION_WORK_${key.toUpperCase()}_REQUIRED`)!==expected)
      fail('CURRENT_WORK_ADMISSION_WORK_SCOPE_MISMATCH');
  }
  return Object.freeze({
    ...onboarding,
    ...snapshot(x,['principal_ref','work_ref','work_generation','assignment_ref','currentness_ref'],'CURRENT_WORK_ADMISSION_WORK'),
    consumer_ref:request.consumer_ref,
    operation_ref:request.operation_ref,
    capability_ref:request.capability_ref,
  });
}

function normalizeRecorded(row){
  const x=object(row,'CURRENT_WORK_ADMISSION_RECORD_REQUIRED');
  secretFree(x);
  if(x.state!=='RECORDED')fail('CURRENT_WORK_ADMISSION_NOT_RECORDED');
  return Object.freeze({
    job_ref:ref(x.jobRef,'CURRENT_WORK_ADMISSION_JOB_REQUIRED'),
    request_digest:ref(x.requestDigest,'CURRENT_WORK_ADMISSION_REQUEST_DIGEST_REQUIRED'),
    replayed:bool(x.replayed,'CURRENT_WORK_ADMISSION_REPLAY_FLAG_REQUIRED'),
  });
}

function normalizeReadback(row,work,recorded,request){
  const x=object(row,'CURRENT_WORK_ADMISSION_READBACK_REQUIRED');
  secretFree(x);
  if(x.state!=='OBSERVED')fail('CURRENT_WORK_ADMISSION_READBACK_NOT_OBSERVED');
  if(ref(x.jobRef,'CURRENT_WORK_ADMISSION_READBACK_JOB_REQUIRED')!==recorded.job_ref)
    fail('CURRENT_WORK_ADMISSION_READBACK_JOB_MISMATCH');
  if(ref(x.workRef,'CURRENT_WORK_ADMISSION_READBACK_WORK_REQUIRED')!==work.work_ref)
    fail('CURRENT_WORK_ADMISSION_READBACK_WORK_MISMATCH');
  if(ref(x.generation,'CURRENT_WORK_ADMISSION_READBACK_GENERATION_REQUIRED')!==work.work_generation)
    fail('CURRENT_WORK_ADMISSION_READBACK_GENERATION_MISMATCH');
  if(ref(x.deviceRef,'CURRENT_WORK_ADMISSION_READBACK_DEVICE_REQUIRED')!==request.device_ref)
    fail('CURRENT_WORK_ADMISSION_READBACK_DEVICE_MISMATCH');
  if(ref(x.requestDigest,'CURRENT_WORK_ADMISSION_READBACK_DIGEST_REQUIRED')!==recorded.request_digest)
    fail('CURRENT_WORK_ADMISSION_READBACK_DIGEST_MISMATCH');
  return Object.freeze({
    job_ref:recorded.job_ref,
    work_ref:work.work_ref,
    work_generation:work.work_generation,
    device_ref:request.device_ref,
    request_digest:recorded.request_digest,
    job_state:ref(x.jobState,'CURRENT_WORK_ADMISSION_READBACK_STATE_REQUIRED'),
    readback_observed:true,
  });
}

/**
 * Shared-agent white-label bridge.
 * Identity/session comes only from the accepted onboarding reader.
 * Work comes only from the injected current Work owner.
 * Switchboard admission and readback remain injected owner ports.
 */
export function createAuthenticatedCurrentWorkAdmission({
  readOnboarding=readCurrentOnboarding,
  readCurrentWork,
  admitCurrentWork,
  readAdmission,
}={}){
  if(typeof readOnboarding!=='function')fail('CURRENT_WORK_ADMISSION_ONBOARDING_READER_REQUIRED');
  if(typeof readCurrentWork!=='function')fail('CURRENT_WORK_ADMISSION_WORK_READER_REQUIRED');
  if(typeof admitCurrentWork!=='function')fail('CURRENT_WORK_ADMISSION_SWITCHBOARD_ADMIT_REQUIRED');
  if(typeof readAdmission!=='function')fail('CURRENT_WORK_ADMISSION_SWITCHBOARD_READBACK_REQUIRED');

  return async function admit(input){
    const request=normalizeRequest(input);
    const onboarding=normalizeOnboarding(await readOnboarding());
    const work=normalizeWork(await readCurrentWork(Object.freeze({...onboarding,...request})),onboarding,request);

    const proposal=Object.freeze({
      workRef:work.work_ref,
      generation:work.work_generation,
      assignmentRef:work.assignment_ref,
      principalRef:work.principal_ref,
      deviceRef:request.device_ref,
      operationType:request.operation_type,
      targetRefs:request.target_refs,
      capabilityRef:request.capability_ref,
      operationRef:request.operation_ref,
      currentnessRef:work.currentness_ref,
    });
    const recorded=normalizeRecorded(await admitCurrentWork(Object.freeze({
      onboarding,work,request,proposal,
    })));
    const readback=normalizeReadback(await readAdmission(Object.freeze({
      onboarding,work,request,recorded,
    })),work,recorded,request);

    return Object.freeze({
      schema:CURRENT_WORK_ADMISSION_SCHEMA,
      state:'ADMITTED_CURRENT_WORK',
      account_ref:onboarding.account_ref,
      workspace_ref:onboarding.workspace_ref,
      session_ref:onboarding.session_ref,
      principal_ref:work.principal_ref,
      work_ref:work.work_ref,
      work_generation:work.work_generation,
      assignment_ref:work.assignment_ref,
      currentness_ref:work.currentness_ref,
      consumer_ref:request.consumer_ref,
      operation_ref:request.operation_ref,
      capability_ref:request.capability_ref,
      job_ref:readback.job_ref,
      device_ref:readback.device_ref,
      request_digest:readback.request_digest,
      job_state:readback.job_state,
      replayed:recorded.replayed,
      authenticated:true,
      work_current:true,
      switchboard_readback:true,
      authority_granted:false,
      effect_authority:false,
      provider_effect:false,
      hard:Object.freeze([
        'ONBOARDING_SESSION!=WORK_AUTHORITY',
        'STATIC_PLANNING_WAIT!=CURRENT_WORK',
        'CURRENT_WORK!=SWITCHBOARD_ADMISSION',
        'SWITCHBOARD_ADMISSION!=EFFECT_AUTHORITY',
        'CALLER_IDENTITY!=AUTHENTICATED_IDENTITY',
      ]),
    });
  };
}
