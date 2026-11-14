/** Bind a first-party Oath session to an exact Ward request without minting authority.
 * Both provider functions must be supplied by trusted, installed adapters. This
 * module cannot authenticate a user or authorize a BINS operation on its own.
 */
import {createHash} from 'node:crypto';

export const OATH_WARD_CONTEXT_SCHEMA='xiio.sdk.oath-ward-context/v1';
const REF=/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/;
const ref=(value,name)=>{if(typeof value!=='string'||!REF.test(value))throw Error(`${name}_INVALID`);return value;};
const blocked=first_red=>Object.freeze({schema:OATH_WARD_CONTEXT_SCHEMA,state:'BLOCKED',first_red,
  authority_granted:false,ward_admission:false,provider_effect:false});
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const current=(date,now)=>typeof date==='string'&&Number.isFinite(Date.parse(date))&&Date.parse(date)>now;

export async function observeOathWardContext({onboarding,work_ref,matter_ref,resource_ref,action,
  verifySession,admit,now=()=>new Date().toISOString()}={}){
  try{
    if(onboarding?.schema!=='xiio.onboarding.current/v1'||onboarding.state!=='CONNECTION_CHOICE_REQUIRED'||
      onboarding.authenticated!==true||onboarding.authority_granted!==false||
      onboarding.ward_admission!==false||onboarding.provider_effect!==false)
      throw Error('OATH_ONBOARDING_NOT_AUTHENTICATED');
    const account_ref=ref(onboarding.account_ref,'ACCOUNT_REF');
    const workspace_ref=ref(onboarding.workspace_ref,'WORKSPACE_REF');
    const session_ref=ref(onboarding.session?.session_ref,'SESSION_REF');
    const scope=Object.freeze({work_ref:ref(work_ref,'WORK_REF'),matter_ref:ref(matter_ref,'MATTER_REF'),
      resource_ref:ref(resource_ref,'RESOURCE_REF'),action:ref(action,'ACTION')});
    const at=Date.parse(now());
    if(!Number.isFinite(at)||!current(onboarding.session.expires_at,at))throw Error('OATH_SESSION_EXPIRED');
    if(typeof verifySession!=='function'||typeof admit!=='function')throw Error('OATH_WARD_PORTS_UNBOUND');
    // Switchboard's existing first-party session binding returns this exact
    // provider observation. Its issuer does not know the D1 account_ref.
    // Correlate the two trusted readbacks by session and workspace instead.
    const identity=await verifySession({session_ref,account_ref,workspace_ref});
    if(identity?.verified!==true||identity.state!=='ACTIVE'||
      identity.session_ref!==session_ref||identity.workspace_ref!==workspace_ref||
      !current(identity.expires_at,at))throw Error('OATH_SESSION_NOT_VERIFIED');
    const principal_ref=ref(identity.principal_ref,'PRINCIPAL_REF');
    const request=Object.freeze({account_ref,workspace_ref,session_ref,principal_ref,...scope});
    const request_digest=digest(request);
    const decision=await admit({request,request_digest});
    if(decision?.schema!=='xiio.ward.matter-action-admission/v1'||
      decision.state!=='ADMITTED'||decision.request_digest!==request_digest||
      decision.principal_ref!==principal_ref||decision.workspace_ref!==workspace_ref||
      decision.matter_ref!==matter_ref||
      decision.resource_ref!==resource_ref||decision.action!==action||
      !current(decision.expires_at,at))throw Error('WARD_MATTER_ADMISSION_NOT_VERIFIED');
    const admission_ref=ref(decision.admission_ref,'ADMISSION_REF');
    return Object.freeze({schema:OATH_WARD_CONTEXT_SCHEMA,state:'ADMISSION_OBSERVED',
      account_ref,workspace_ref,principal_ref,...scope,request_digest,admission_ref,
      authority_granted:false,ward_admission:false,provider_effect:false,
      next:'REVALIDATE_WITH_WARD_AT_EFFECT_BOUNDARY'});
  }catch(error){
    return blocked(typeof error?.message==='string'&&/^[A-Z][A-Z0-9_]{3,90}$/.test(error.message)
      ?error.message:'OATH_WARD_PROVIDER_UNAVAILABLE');
  }
}
