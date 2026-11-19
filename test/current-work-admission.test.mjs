import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthenticatedCurrentWorkAdmission} from '../src/identity/current-work-admission.mjs';

const onboarding=Object.freeze({
  schema:'xiio.onboarding.current/v1',
  plane:'XIIO_FIRST_PARTY',
  state:'CONNECTION_CHOICE_REQUIRED',
  next:'ASK_OWNER_WHAT_TO_CONNECT',
  authenticated:true,
  connection_choice:'UNSELECTED',
  consent:'NOT_REQUESTED',
  services:'NOT_DISCOVERED',
  provisioning:'NOT_AUTHORIZED',
  account_ref:'account:1',
  workspace_ref:'workspace:1',
  session:Object.freeze({session_ref:'session:1',expires_at:'2099-01-01T00:00:00.000Z'}),
  authority_granted:false,ward_admission:false,provider_effect:false,
});

const request=Object.freeze({
  consumer_ref:'plugin:shared-agent',
  operation_ref:'operation:plan-read',
  capability_ref:'capability:planning-read',
  device_ref:'device:operator',
  operation_type:'device-read',
  target_refs:Object.freeze(['resource:planning']),
});

const work=Object.freeze({
  state:'CURRENT',
  account_ref:'account:1',
  workspace_ref:'workspace:1',
  session_ref:'session:1',
  principal_ref:'principal:1',
  work_ref:'work:current',
  work_generation:'generation:work:7',
  assignment_ref:'assignment:7',
  currentness_ref:'currentness:work:7',
  consumer_ref:request.consumer_ref,
  operation_ref:request.operation_ref,
  capability_ref:request.capability_ref,
});

const recorded=Object.freeze({
  state:'RECORDED',
  jobRef:'job:7',
  replayed:false,
  requestDigest:'digest:7',
});

const readback=Object.freeze({
  schema:'xiio.switchboard.device-broker/v1',
  state:'OBSERVED',
  jobRef:'job:7',
  workRef:'work:current',
  occurrenceId:'occurrence:7',
  generation:'generation:work:7',
  deviceRef:'device:operator',
  jobState:'queued',
  requestDigest:'digest:7',
});

function make({onboardingRow=onboarding,workRow=work,recordedRow=recorded,readbackRow=readback}={}){
  return createAuthenticatedCurrentWorkAdmission({
    readOnboarding:async()=>onboardingRow,
    readCurrentWork:async(scope)=>{
      assert.equal(scope.account_ref,'account:1');
      assert.equal(scope.workspace_ref,'workspace:1');
      assert.equal(scope.session_ref,'session:1');
      return workRow;
    },
    admitCurrentWork:async({onboarding:o,work:w,proposal})=>{
      assert.equal(o.session_ref,'session:1');
      assert.equal(w.work_ref,'work:current');
      assert.equal(proposal.workRef,'work:current');
      assert.equal(proposal.principalRef,'principal:1');
      assert.equal(proposal.assignmentRef,'assignment:7');
      assert.equal(proposal.capabilityRef,request.capability_ref);
      return recordedRow;
    },
    readAdmission:async({recorded:r})=>{
      assert.equal(r.job_ref,'job:7');
      return readbackRow;
    },
  });
}

test('authenticated onboarding plus current Work plus Switchboard readback yields one authority-neutral admission',async()=>{
  const out=await make()(request);
  assert.equal(out.schema,'xiio.sdk.current-work-admission/v1');
  assert.equal(out.state,'ADMITTED_CURRENT_WORK');
  assert.equal(out.account_ref,'account:1');
  assert.equal(out.principal_ref,'principal:1');
  assert.equal(out.work_ref,'work:current');
  assert.equal(out.assignment_ref,'assignment:7');
  assert.equal(out.job_ref,'job:7');
  assert.equal(out.authenticated,true);
  assert.equal(out.work_current,true);
  assert.equal(out.switchboard_readback,true);
  assert.equal(out.authority_granted,false);
  assert.equal(out.effect_authority,false);
  assert.equal(out.provider_effect,false);
});

test('caller cannot self-assert account, session, principal, Work or admission identity',async()=>{
  for(const field of ['account_ref','workspace_ref','session_ref','principal_ref','work_ref','work_generation','assignment_ref','authority_ref','admission_ref']){
    await assert.rejects(()=>make()({...request,[field]:'forged:value'}),/CURRENT_WORK_ADMISSION_CALLER_IDENTITY_FORBIDDEN/);
  }
});

for(const [name,patch,expected] of [
  ['signed out',{state:'OWNER_SIGNIN_REQUIRED',authenticated:false},'CURRENT_WORK_ADMISSION_ONBOARDING_NOT_AUTHENTICATED'],
  ['wrong onboarding account in Work',{account_ref:'account:other'},'CURRENT_WORK_ADMISSION_WORK_ONBOARDING_MISMATCH'],
  ['wrong onboarding session in Work',{session_ref:'session:other'},'CURRENT_WORK_ADMISSION_WORK_ONBOARDING_MISMATCH'],
  ['stale Work',{state:'STALE'},'CURRENT_WORK_ADMISSION_WORK_NOT_CURRENT'],
  ['wrong Work operation',{operation_ref:'operation:other'},'CURRENT_WORK_ADMISSION_WORK_SCOPE_MISMATCH'],
]){
  test(name+' refuses',async()=>{
    if(name==='signed out') {
      await assert.rejects(()=>make({onboardingRow:{...onboarding,...patch}})(request),new RegExp(expected));
    } else {
      await assert.rejects(()=>make({workRow:{...work,...patch}})(request),new RegExp(expected));
    }
  });
}

for(const [name,patch,expected] of [
  ['job mismatch',{jobRef:'job:other'},'CURRENT_WORK_ADMISSION_READBACK_JOB_MISMATCH'],
  ['work mismatch',{workRef:'work:other'},'CURRENT_WORK_ADMISSION_READBACK_WORK_MISMATCH'],
  ['generation mismatch',{generation:'generation:work:8'},'CURRENT_WORK_ADMISSION_READBACK_GENERATION_MISMATCH'],
  ['device mismatch',{deviceRef:'device:other'},'CURRENT_WORK_ADMISSION_READBACK_DEVICE_MISMATCH'],
  ['digest mismatch',{requestDigest:'digest:other'},'CURRENT_WORK_ADMISSION_READBACK_DIGEST_MISMATCH'],
]){
  test('Switchboard '+name+' refuses',async()=>{
    await assert.rejects(()=>make({readbackRow:{...readback,...patch}})(request),new RegExp(expected));
  });
}

test('secret-bearing request fields are refused before owner calls',async()=>{
  let calls=0;
  const admit=createAuthenticatedCurrentWorkAdmission({
    readOnboarding:async()=>{calls++;return onboarding},
    readCurrentWork:async()=>{calls++;return work},
    admitCurrentWork:async()=>{calls++;return recorded},
    readAdmission:async()=>{calls++;return readback},
  });
  await assert.rejects(()=>admit({...request,api_token:'SYNTHETIC_SECRET'}),/CURRENT_WORK_ADMISSION_SECRET_FIELD_REFUSED/);
  assert.equal(calls,0);
});

test('all owner ports are required, no silent fallback',()=>{
  assert.throws(()=>createAuthenticatedCurrentWorkAdmission({}),/CURRENT_WORK_ADMISSION_WORK_READER_REQUIRED/);
  assert.throws(()=>createAuthenticatedCurrentWorkAdmission({readCurrentWork:async()=>work}),/CURRENT_WORK_ADMISSION_SWITCHBOARD_ADMIT_REQUIRED/);
  assert.throws(()=>createAuthenticatedCurrentWorkAdmission({readCurrentWork:async()=>work,admitCurrentWork:async()=>recorded}),/CURRENT_WORK_ADMISSION_SWITCHBOARD_READBACK_REQUIRED/);
});
