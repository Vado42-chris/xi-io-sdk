import path from 'node:path';

const CLAIM_KINDS=Object.freeze([
  'PROSE','SCREENSHOT','SYNTHETIC_LOG','LOCALHOST_TEXT','TOOL_CALL_TEXT',
  'CONNECTOR_READBACK','NATIVE_RECEIPT'
]);
const PROOF_SCOPES=Object.freeze(['SYNTHETIC_FIXTURE','CONNECTOR_METADATA','HOME_CURRENT','NATIVE_RUNTIME']);

const text=(v,k)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(k+'_REQUIRED');return v.trim();};
const one=(v,set,k)=>{const x=text(v,k);if(!set.includes(x))throw new TypeError(k+'_INVALID');return x;};
const bool=(v,k)=>{if(typeof v!=='boolean')throw new TypeError(k+'_BOOLEAN_REQUIRED');return v;};
const list=(v)=>Array.isArray(v)?v.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()):[];

function pathAllowed(targetPath,allowedPrefixes){
  if(targetPath==null)return true;
  const raw=text(targetPath,'TARGET_PATH');
  if(!path.isAbsolute(raw))return false;
  const normalized=path.resolve(raw);
  const prefixes=list(allowedPrefixes).filter(path.isAbsolute).map(prefix=>path.resolve(prefix));
  if(!prefixes.length)return false;
  return prefixes.some(prefix=>normalized===prefix||normalized.startsWith(prefix+path.sep));
}

export function evaluateApiBlackholeClaim(input={}){
  const claim_kind=one(input.claim_kind,CLAIM_KINDS,'CLAIM_KIND');
  const proof_scope=one(input.proof_scope,PROOF_SCOPES,'PROOF_SCOPE');
  const source_generation=text(input.source_generation,'SOURCE_GENERATION');
  const expected_host_ref=input.expected_host_ref==null?null:text(input.expected_host_ref,'EXPECTED_HOST_REF');
  const expected_execution_surface_ref=input.expected_execution_surface_ref==null?null:text(input.expected_execution_surface_ref,'EXPECTED_EXECUTION_SURFACE_REF');
  const target_path=input.target_path??null;
  const allowed_target_prefixes=list(input.allowed_target_prefixes);

  const out={
    schema:'xiio.api-blackhole.evaluation/v1',
    claim_kind,
    proof_scope,
    source_generation,
    target_path,
    state:'TRUE_WAIT',
    first_red:null,
    promotion_allowed:false,
    authority_granted:false,
    provider_effect:false,
  };

  if(target_path!==null&&!pathAllowed(target_path,allowed_target_prefixes)){
    return Object.freeze({...out,state:'FAIL',first_red:'OUT_OF_SCOPE_TARGET'});
  }

  if(claim_kind==='TOOL_CALL_TEXT'&&proof_scope!=='NATIVE_RUNTIME'){
    return Object.freeze({...out,state:'TRUE_WAIT',first_red:'TOOL_CALL_TEXT_NOT_NATIVE_EFFECT'});
  }

  if(proof_scope!=='NATIVE_RUNTIME'){
    return Object.freeze({...out,state:'TRUE_WAIT',first_red:'NATIVE_RUNTIME_RECEIPT_REQUIRED'});
  }

  if(claim_kind!=='NATIVE_RECEIPT'){
    return Object.freeze({...out,state:'TRUE_WAIT',first_red:'CLAIM_KIND_NOT_NATIVE_RECEIPT'});
  }

  const receipt=input.native_receipt;
  if(!receipt||typeof receipt!=='object'){
    return Object.freeze({...out,state:'TRUE_WAIT',first_red:'NATIVE_RECEIPT_REQUIRED'});
  }

  if(expected_host_ref===null){
    return Object.freeze({...out,state:'TRUE_WAIT',first_red:'EXPECTED_HOST_REQUIRED'});
  }
  if(expected_execution_surface_ref===null){
    return Object.freeze({...out,state:'TRUE_WAIT',first_red:'EXPECTED_EXECUTION_SURFACE_REQUIRED'});
  }
  if(typeof receipt.host_ref!=='string'||!receipt.host_ref.trim()){
    return Object.freeze({...out,state:'TRUE_WAIT',first_red:'RECEIPT_HOST_REQUIRED'});
  }
  if(typeof receipt.execution_surface_ref!=='string'||!receipt.execution_surface_ref.trim()){
    return Object.freeze({...out,state:'TRUE_WAIT',first_red:'EXECUTION_SURFACE_REQUIRED'});
  }
  if(typeof receipt.environment_survey_ref!=='string'||!receipt.environment_survey_ref.trim()){
    return Object.freeze({...out,state:'TRUE_WAIT',first_red:'ENVIRONMENT_SURVEY_REQUIRED'});
  }
  if(typeof receipt.environment_current!=='boolean'){
    return Object.freeze({...out,state:'TRUE_WAIT',first_red:'ENVIRONMENT_SURVEY_CURRENTNESS_REQUIRED'});
  }
  const host_ref=text(receipt.host_ref,'RECEIPT_HOST_REF');
  const execution_surface_ref=text(receipt.execution_surface_ref,'RECEIPT_EXECUTION_SURFACE_REF');
  const environment_survey_ref=text(receipt.environment_survey_ref,'RECEIPT_ENVIRONMENT_SURVEY_REF');
  const environment_current=bool(receipt.environment_current,'RECEIPT_ENVIRONMENT_CURRENT');
  const receipt_generation=text(receipt.generation_ref,'RECEIPT_GENERATION_REF');
  const producer_ref=text(receipt.producer_ref,'RECEIPT_PRODUCER_REF');
  const verifier_ref=text(receipt.verifier_ref,'RECEIPT_VERIFIER_REF');
  const fresh=bool(receipt.fresh,'RECEIPT_FRESH');
  const replayed=bool(receipt.replayed,'RECEIPT_REPLAYED');
  const independent_readback=bool(receipt.independent_readback,'RECEIPT_INDEPENDENT_READBACK');
  const authenticated=bool(receipt.authenticated,'RECEIPT_AUTHENTICATED');

  if(expected_host_ref!==null&&host_ref!==expected_host_ref){
    return Object.freeze({...out,state:'FAIL',first_red:'EXECUTION_HOST_MISMATCH',host_ref,execution_surface_ref,environment_survey_ref});
  }
  if(expected_execution_surface_ref!==null&&execution_surface_ref!==expected_execution_surface_ref){
    return Object.freeze({...out,state:'FAIL',first_red:'EXECUTION_SURFACE_MISMATCH',host_ref,execution_surface_ref,environment_survey_ref});
  }
  if(!environment_current){
    return Object.freeze({...out,state:'TRUE_WAIT',first_red:'ENVIRONMENT_SURVEY_STALE',host_ref,execution_surface_ref,environment_survey_ref});
  }
  if(receipt_generation!==source_generation){
    return Object.freeze({...out,state:'FAIL',first_red:'RECEIPT_GENERATION_MISMATCH',host_ref});
  }
  if(!fresh){
    return Object.freeze({...out,state:'FAIL',first_red:'STALE_NATIVE_RECEIPT',host_ref});
  }
  if(replayed){
    return Object.freeze({...out,state:'FAIL',first_red:'REPLAYED_NATIVE_RECEIPT',host_ref});
  }
  if(!authenticated){
    return Object.freeze({...out,state:'FAIL',first_red:'NATIVE_RECEIPT_NOT_AUTHENTICATED',host_ref});
  }
  if(!independent_readback){
    return Object.freeze({...out,state:'FAIL',first_red:'INDEPENDENT_READBACK_REQUIRED',host_ref});
  }
  if(producer_ref===verifier_ref){
    return Object.freeze({...out,state:'FAIL',first_red:'SELF_VERIFIED_NATIVE_RECEIPT',host_ref});
  }

  return Object.freeze({...out,state:'PASS',first_red:null,promotion_allowed:true,host_ref,execution_surface_ref,environment_survey_ref});
}

export const API_BLACKHOLE_HARD=Object.freeze([
  'PROSE_CLAIM != PHYSICAL_EXECUTION',
  'TOOL_CALL_TEXT != FILE_MUTATION',
  'TOOL_CALL_TEXT + NATIVE_RECEIPT != NATIVE_RECEIPT_CLAIM',
  'WRITE_ACK != POST_WRITE_READBACK',
  'LOCAL_LOOPBACK_SOCKET_REACHABLE != PHYSICAL_HOST_EXECUTION',
  'DESKTOP_VISIBLE != EXECUTION_CONTEXT_SURVEYED',
  'MINIMIZED_OR_HIDDEN != PROCESS_STOPPED',
  'HOST_IDENTITY != EXECUTION_SURFACE_IDENTITY',
  'NATIVE_RECEIPT != CURRENT_RECEIPT',
  'CURRENT_RECEIPT != INDEPENDENT_READBACK',
  'SELF_VERIFICATION != INDEPENDENT_READBACK',
  'TARGET_PATH_OUTSIDE_SCOPE = FAIL',
  'PATH_TRAVERSAL_OUTSIDE_SCOPE = FAIL',
  'API_BLACKHOLE != PASS',
]);
