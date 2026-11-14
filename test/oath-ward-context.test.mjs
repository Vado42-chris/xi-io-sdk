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
const identity={schema:'xiio.oath.verified-session/v1',state:'VERIFIED_CURRENT',
  session_ref:'session:1',account_ref:'account:1',principal_ref:'person:1',workspace_ref:'workspace:1',current:true,expires_at:later};
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
 assert.equal(result.workspace_ref,'workspace:1');
 assert.equal(result.authority_granted,false);
 assert.equal(result.ward_admission,false);
 assert.equal(result.provider_effect,false);
 assert.equal(result.session_ref,undefined);
});
test('onboarding cannot self-assert permission',async()=>{
 assert.equal((await invoke({onboarding:{...onboarding,ward_admission:true}})).state,'BLOCKED');
});
test('expired and revoked sessions refuse before Ward',async()=>{
 for(const changed of [{...identity,current:false},{...identity,expires_at:'2026-11-13T00:00:00Z'}]){
   const p=ports();
   const result=await invoke({...p,verifySession:async()=>changed});
   assert.equal(result.first_red,'OATH_SESSION_NOT_VERIFIED');
   assert.equal(p.calls(),0);
 }
});
test('account and principal substitution fail before Ward',async()=>{
 for(const changed of [{...identity,account_ref:'account:other'},
   {...identity,session_ref:'session:other'}]){
   const p=ports();
   assert.equal((await invoke({...p,verifySession:async()=>changed})).state,'BLOCKED');
   assert.equal(p.calls(),0);
 }
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

test('Oath workspace drift is refused before Ward sees the matter',async()=>{
 for(const changed of [{...identity,workspace_ref:'workspace:foreign'},
   {...identity,workspace_ref:undefined}]){
   const p=ports();
   const result=await invoke({...p,verifySession:async()=>changed});
   assert.equal(result.first_red,'OATH_SESSION_NOT_VERIFIED');
   assert.equal(p.calls(),0);
 }
});
test('onboarding requires trusted workspace and refuses malformed coordinates',async()=>{
 for(const workspace_ref of [undefined,{},'workspace with spaces']){
   const p=ports();
   const result=await invoke({...p,onboarding:{...onboarding,workspace_ref}});
   assert.equal(result.state,'BLOCKED');
   assert.equal(p.calls(),0);
 }
});
