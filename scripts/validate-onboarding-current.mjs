import test from 'node:test';
import assert from 'node:assert/strict';
import {consumeOnboardingResponse,readCurrentOnboarding} from '../src/identity/onboarding-current.mjs';

const now='2026-10-28T20:00:00.000Z';
const core={schema:'xiio.onboarding.current/v1',plane:'XIIO_FIRST_PARTY',
 state:'CONNECTION_CHOICE_REQUIRED',next:'ASK_OWNER_WHAT_TO_CONNECT',
 authenticated:true,connection_choice:'UNSELECTED',consent:'NOT_REQUESTED',
 services:'NOT_DISCOVERED',provisioning:'NOT_AUTHORIZED',
 account_ref:'account:1',workspace_ref:'workspace:1',
 session:{session_ref:'session:1',expires_at:'2026-10-28T20:15:00.000Z'},
 authority_granted:false,ward_admission:false,provider_effect:false};
const signin={...core,state:'OWNER_SIGNIN_REQUIRED',authenticated:false,
 next:'XIIO_FIRST_PARTY_SIGN_IN',connection_choice:'NOT_ASKED'};
delete signin.account_ref;delete signin.workspace_ref;delete signin.session;
const out=(body,status=200)=>Response.json(body,{status});
test('C01 current authoritative account read, no accidental consent',async()=>{
 const x=await consumeOnboardingResponse(out({...core,evil:'discarded',access_token:'never'}),{now});
 assert.equal(x.state,'CONNECTION_CHOICE_REQUIRED');
 assert.equal(x.account_ref,'account:1');assert.equal(x.consent,'NOT_REQUESTED');
 assert.equal(x.access_token,undefined);assert.equal(x.evil,undefined);
 assert.equal(x.ward_admission,false);
});
test('C02 signed-out account stays signed out',async()=>{
 const x=await consumeOnboardingResponse(out(signin,401),{now});
 assert.equal(x.state,'OWNER_SIGNIN_REQUIRED');assert.equal(x.authenticated,false);
 assert.equal(x.account_ref,undefined);
});
test('C03 API 503 remains unbound not false sign in',async()=>{
 const x=await consumeOnboardingResponse(out({...signin,state:'AUTHORITY_UNAVAILABLE',
  next:'RESTORE_FIRST_PARTY_SESSION_OWNER',first_red:'FIRST_PARTY_AUTHORITY_SCHEMA_UNBOUND'},503),{now});
 assert.equal(x.state,'AUTHORITY_UNAVAILABLE');
 assert.equal(x.first_red,'FIRST_PARTY_AUTHORITY_SCHEMA_UNBOUND');
});
test('C04 expired session cannot become signed-in',async()=>{
 const x=await consumeOnboardingResponse(out(core),{now:'2026-10-28T21:00:00Z'});
 assert.equal(x.state,'AUTHORITY_UNAVAILABLE');
});
test('C05 revoked owner state wins over stale last saved account',async()=>{
 const x=await consumeOnboardingResponse(out(signin,401),{now});
 assert.equal(x.authenticated,false);assert.equal(x.account_ref,undefined);
});
test('C06 wrong schema rejected',async()=>{
 const x=await consumeOnboardingResponse(out({...core,schema:'xiio.fake/v1'}),{now});
 assert.equal(x.state,'AUTHORITY_UNAVAILABLE');
});
test('C07 foreign provider status rejected',async()=>{
 const x=await consumeOnboardingResponse(out({...core,plane:'OAUTH_PROVIDER'}),{now});
 assert.equal(x.state,'AUTHORITY_UNAVAILABLE');
});
test('C08 forged Ward/consent flags refused',async()=>{
 for(const patch of [{ward_admission:true},{authority_granted:true},
    {consent:'APPROVED'},{provisioning:'COMPLETED'},{provider_effect:true}]){
  const x=await consumeOnboardingResponse(out({...core,...patch}),{now});
  assert.equal(x.state,'AUTHORITY_UNAVAILABLE');
 }
});
test('C09 exact path, same-origin cookie and no user-provided account',async()=>{
 let url,args;const x=await readCurrentOnboarding({fetchImpl:async (u,a)=>{
  url=u;args=a;return out(core);},now:()=>now});
 assert.equal(url,'/v1/onboarding/current');assert.equal(args.credentials,'same-origin');
 assert.equal(args.method,'GET');assert.equal(args.redirect,'error');
 assert.equal(x.account_ref,'account:1');
});
test('C10 transport failure is typed unavailable',async()=>{
 const x=await readCurrentOnboarding({fetchImpl:async()=>{throw Error('network')}});
 assert.equal(x.state,'AUTHORITY_UNAVAILABLE');
 assert.equal(x.first_red,'FIRST_PARTY_ONBOARDING_API_UNAVAILABLE');
});
test('C11 bad HTTP and redirects never become sign-in',async()=>{
 const a=await consumeOnboardingResponse(out(core,201),{now});
 assert.equal(a.state,'AUTHORITY_UNAVAILABLE');
 const b=out(core);Object.defineProperty(b,'redirected',{value:true});
 assert.equal((await consumeOnboardingResponse(b,{now})).state,'AUTHORITY_UNAVAILABLE');
});
test('C12 oversized JSON refused',async()=>{
 const x=await consumeOnboardingResponse(out({...core,pad:'x'.repeat(10000)}),{now});
 assert.equal(x.state,'AUTHORITY_UNAVAILABLE');
});
test('C13 invalid session ref and account data refused',async()=>{
 for(const update of [{account_ref:'provider@example.com'},
 {session:{session_ref:'fake redacted',expires_at:core.session.expires_at}},
 {workspace_ref:' '}]){
  const x=await consumeOnboardingResponse(out({...core,...update}),{now});
  assert.equal(x.state,'AUTHORITY_UNAVAILABLE');
 }
});
test('C14 resumed same live session reads current each time, no cached grant',async()=>{
 let calls=0;
 const f=async()=>{calls++;return out(calls===1?core:signin,calls===1?200:401);};
 const a=await readCurrentOnboarding({fetchImpl:f,now:()=>now});
 const b=await readCurrentOnboarding({fetchImpl:f,now:()=>now});
 assert.equal(a.state,'CONNECTION_CHOICE_REQUIRED');
 assert.equal(b.state,'OWNER_SIGNIN_REQUIRED');
 assert.equal(b.account_ref,undefined);assert.equal(calls,2);
});
