/** XI-IO SDK: consume the framework's authenticated onboarding/current result.
 * The framework session verifier is the ONLY authority for account/session.
 * The SDK cannot sign in, enroll a device, consent, or mint a Ward permission.
 */
export const ONBOARDING_CURRENT_SCHEMA = 'xiio.onboarding.current/v1';
const EXACT_URL='/v1/onboarding/current';
const REF=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const ACCEPTED=Object.freeze(new Set(['OWNER_SIGNIN_REQUIRED','CONNECTION_CHOICE_REQUIRED','AUTHORITY_UNAVAILABLE']));
const CLAMP=(code)=>typeof code==='string'&&/^[A-Z][A-Z0-9_]{3,100}$/.test(code)?code:'ONBOARDING_READ_UNVERIFIED';
const unavailable=code=>Object.freeze({
 schema:ONBOARDING_CURRENT_SCHEMA,plane:'XIIO_FIRST_PARTY',state:'AUTHORITY_UNAVAILABLE',
 next:'RESTORE_FIRST_PARTY_SESSION_OWNER',first_red:CLAMP(code),
 authenticated:false,connection_choice:'NOT_ASKED',consent:'NOT_REQUESTED',
 services:'NOT_DISCOVERED',provisioning:'NOT_AUTHORIZED',
 authority_granted:false,ward_admission:false,provider_effect:false
});
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const noAuthority=x=>x.authority_granted===false&&x.ward_admission===false&&x.provider_effect===false&&
 x.consent==='NOT_REQUESTED'&&x.services==='NOT_DISCOVERED'&&x.provisioning==='NOT_AUTHORIZED';
const ref=x=>typeof x==='string'&&REF.test(x);
function isCurrentState(x,status,now){
 if(!isObject(x)||x.schema!==ONBOARDING_CURRENT_SCHEMA||x.plane!=='XIIO_FIRST_PARTY'||
   !ACCEPTED.has(x.state)||!noAuthority(x))return false;
 if(status===401)return x.state==='OWNER_SIGNIN_REQUIRED'&&x.authenticated===false&&
   x.connection_choice==='NOT_ASKED'&&x.next==='XIIO_FIRST_PARTY_SIGN_IN';
 if(status===503)return x.state==='AUTHORITY_UNAVAILABLE'&&x.authenticated===false&&
   x.connection_choice==='NOT_ASKED'&&x.next==='RESTORE_FIRST_PARTY_SESSION_OWNER'&&
   typeof x.first_red==='string';
 if(status===200){
  if(x.state!=='CONNECTION_CHOICE_REQUIRED'||x.authenticated!==true||
     x.connection_choice!=='UNSELECTED'||x.next!=='ASK_OWNER_WHAT_TO_CONNECT'||
     !ref(x.account_ref)||!ref(x.workspace_ref)||!isObject(x.session)||
     !ref(x.session.session_ref))return false;
  const expires=Date.parse(x.session.expires_at);
  return Number.isFinite(now)&&Number.isFinite(expires)&&expires>now;
 }
 return false;
}
async function limitedBody(response){
 const reader=response?.body?.getReader?.();
 if(!reader)throw Error('ONBOARDING_BODY_NOT_STREAMABLE');
 const chunks=[];let count=0;
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   count+=value.byteLength;
   if(count>8192){await reader.cancel();throw Error('ONBOARDING_BODY_OVERSIZE');}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const data=new Uint8Array(count);let offset=0;
 for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
}
/** Normalizes a real HTTP response; never accepts identity provided by caller. */
export async function consumeOnboardingResponse(response,{now=new Date().toISOString()}={}){
 if(![200,401,503].includes(response?.status)||response?.redirected===true)
  return unavailable('ONBOARDING_HTTP_STATUS_UNVERIFIED');
 let payload;
 try{payload=await limitedBody(response);}
 catch{return unavailable('ONBOARDING_HTTP_BODY_INVALID');}
 if(!isCurrentState(payload,response.status,Date.parse(now)))
  return unavailable('ONBOARDING_RESPONSE_NOT_CURRENT');
 // Return only the audited allowlist; discard unknown fields/secrets.
 const base={
  schema:ONBOARDING_CURRENT_SCHEMA,plane:'XIIO_FIRST_PARTY',
  state:payload.state,next:payload.next,
  authenticated:payload.authenticated,
  connection_choice:payload.connection_choice,
  consent:'NOT_REQUESTED',services:'NOT_DISCOVERED',
  provisioning:'NOT_AUTHORIZED',
  authority_granted:false,ward_admission:false,provider_effect:false,
 };
 if(response.status===503)return Object.freeze({...base,first_red:CLAMP(payload.first_red)});
 if(response.status===401)return Object.freeze(base);
 return Object.freeze({...base,account_ref:payload.account_ref,
  workspace_ref:payload.workspace_ref,
  session:Object.freeze({session_ref:payload.session.session_ref,
   expires_at:payload.session.expires_at})});
}
/**
 * Always fetches the exact same-origin first-party onboarding route.
 * A provider connection, OAuth account display, or passed-in status flag is
 * not an authenticated XI-IO session.
 */
export async function readCurrentOnboarding({fetchImpl=fetch,now=()=>new Date().toISOString()}={}){
 if(typeof fetchImpl!=='function')return unavailable('ONBOARDING_FETCHER_UNBOUND');
 try{
  const response=await fetchImpl(EXACT_URL,{
   method:'GET',credentials:'same-origin',redirect:'error',
   cache:'no-store',headers:{accept:'application/json'},
   signal:AbortSignal.timeout(4000)
  });
  return consumeOnboardingResponse(response,{now:now()});
 }catch{return unavailable('FIRST_PARTY_ONBOARDING_API_UNAVAILABLE');}
}
