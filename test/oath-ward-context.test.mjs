import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {observeOathWardContext} from '../src/identity/oath-ward-context.mjs';

const later='2026-11-15T00:00:00Z';
const now=()=> '2026-11-14T18:00:00Z';
const onboarding={schema:'xiio.onboarding.current/v1',state:'CONNECTION_CHOICE_REQUIRED',
  authenticated:true,authority_granted:false,ward_admission:false,provider_effect:false,
  account_ref:'account:1',workspace_ref:'workspace:1',session:{session_ref:'session:1',expires_at:later}};
const scope={work_ref:'work:1',matter_ref:'matter:1',resource_ref:'resource:1',action:'read'};
const identity={verified:true,state:'ACTIVE',session_ref:'session:1',
  workspace_ref:'workspace:1',principal_ref:'person:1',expires_at:later};
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function ports(){
 let admissionCalls=0;
 return {verifySession:async()=>identity,admit:async({request,request_digest})=>{
   admissionCalls++;
   assert.equal(request_digest,sha(request));
   return {schema:'xiio.ward.matter-action-admission/v1',state:'ADMITTED',
     request_digest,principal_ref:request.principal_ref,workspace_ref:request.workspace_ref,
     matter_ref:request.matter_ref,
     resource_ref:request.resource_ref,action:request.action,
     admission_ref:'ward:1',expires_at:later};
 },calls:()=>admissionCalls};
}
const invoke=(overrides={})=>observeOathWardContext({onboarding,...scope,now,...ports(),...overrides});
test('exact Oath and Ward observations produce only a non-authorizing handoff',async()=>{
 const result=await invoke();
 assert.equal(result.state,'ADMISSION_OBSERVED');
 assert.equal(result.principal_ref,'person:1');
 assert.equal(result.authority_granted,false);
 assert.equal(result.ward_admission,false);
 assert.equal(result.provider_effect,false);
 assert.equal(result.session_ref,undefined);
});
test('onboarding cannot self-assert permission',async()=>{
 assert.equal((await invoke({onboarding:{...onboarding,ward_admission:true}})).state,'BLOCKED');
});
test('expired and revoked sessions refuse before Ward',async()=>{
 for(const changed of [{...identity,state:'REVOKED'},{...identity,verified:false},
   {...identity,expires_at:'2026-11-13T00:00:00Z'}]){
   const p=ports();
   const result=await invoke({...p,verifySession:async()=>changed});
   assert.equal(result.first_red,'OATH_SESSION_NOT_VERIFIED');
   assert.equal(p.calls(),0);
 }
});
test('session and workspace substitution fail before Ward',async()=>{
 for(const changed of [{...identity,workspace_ref:'workspace:other'},
   {...identity,session_ref:'session:other'}]){
   const p=ports();
   assert.equal((await invoke({...p,verifySession:async()=>changed})).state,'BLOCKED');
   assert.equal(p.calls(),0);
 }
});
test('missing onboarding workspace cannot contact Oath or Ward',async()=>{
 const p=ports();let verified=false;
 const result=await invoke({...p,onboarding:{...onboarding,workspace_ref:undefined},
   verifySession:async()=>{verified=true;return identity;}});
 assert.equal(result.first_red,'WORKSPACE_REF_INVALID');
 assert.equal(verified,false);
 assert.equal(p.calls(),0);
});
test('Ward must admit exact matter, resource, action and principal',async()=>{
 for(const field of ['workspace_ref','matter_ref','resource_ref','action','principal_ref','request_digest']){
   const p=ports();
   const result=await invoke({...p,admit:async arg=>({...await p.admit(arg),[field]:'wrong'})});
   assert.equal(result.first_red,'WARD_MATTER_ADMISSION_NOT_VERIFIED',field);
 }
});
test('denial, expired admission and unavailable providers are fail closed',async()=>{
 const p=ports();
 for(const override of [
   {admit:async()=>({state:'DENIED'})},
   {admit:async arg=>({...await p.admit(arg),expires_at:'2026-11-13T00:00:00Z'})},
   {verifySession:async()=>{throw Error('network reset');}},
   {verifySession:null}
 ])assert.equal((await invoke(override)).state,'BLOCKED');
});

test('session expiring during asynchronous identity verification refuses before Ward',async()=>{
 const p=ports();let clock=0;
 const result=await invoke({...p,now:()=>++clock===1?'2026-11-14T18:00:00Z':'2026-11-15T00:00:01Z'});
 assert.equal(result.state,'BLOCKED');
 assert.equal(result.first_red,'OATH_SESSION_EXPIRED_DURING_VERIFICATION');
 assert.equal(p.calls(),0);
});
test('Ward admission expiring before asynchronous return cannot be observed',async()=>{
 const p=ports();let clock=0;
 const result=await invoke({...p,now:()=>++clock<=2?'2026-11-14T18:00:00Z':'2026-11-15T00:00:01Z'});
 assert.equal(result.state,'BLOCKED');
 assert.equal(result.first_red,'OATH_WARD_ADMISSION_EXPIRED_DURING_VERIFICATION');
 assert.equal(p.calls(),1);
});
