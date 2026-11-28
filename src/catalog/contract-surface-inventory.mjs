export const CONTRACT_SURFACE_INVENTORY_SCHEMA='xiio.sdk.contract-surface-inventory/v1';

const REF=/^[A-Za-z0-9][A-Za-z0-9:._/#-]{0,255}$/;
const STATES=new Set(['DECLARED','IMPLEMENTED','APPLICABLE','QUALIFIED','CURRENT','AUTHORIZED','OBSERVED_VERIFIED']);
const SURFACE_ROLES=new Set(['API','MCP','A2A','EVENT','ADAPTER','PROVIDER']);
const EFFECT_CLASSES=new Set(['READ_ONLY','MUTATION','EXTERNAL_EFFECT','NONE']);
const AVAILABILITY=new Set(['AVAILABLE','DEGRADED','BLOCKED','UNKNOWN','N_A']);
const SECRET_KEY=/token|password|secret|credential|api.?key|authorization/i;

function fail(code){const error=new TypeError(code);error.code=code;throw error;}
function plain(value,code){
  if(!value||typeof value!=='object'||Array.isArray(value))fail(code);
  const proto=Object.getPrototypeOf(value);
  if(proto!==Object.prototype&&proto!==null)fail(code);
  for(const key of Reflect.ownKeys(value)){
    if(typeof key!=='string')fail(code);
    const d=Object.getOwnPropertyDescriptor(value,key);
    if(!d||!Object.hasOwn(d,'value')||d.enumerable!==true)fail(code);
    if(SECRET_KEY.test(key))fail('CONTRACT_SURFACE_SECRET_FIELD_REFUSED');
  }
  return value;
}
function ref(value,code,max=256){
  if(typeof value!=='string'||value.length>max||!REF.test(value))fail(code);
  return value;
}
function optionalRef(value,code){return value===null||value===undefined?null:ref(value,code);}
function exactBoolean(value,code){if(value!==true&&value!==false)fail(code);return value;}
function text(value,code,max=128){
  if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>max)fail(code);
  return value;
}
function optionalText(value,code,max=256){return value===null||value===undefined?null:text(value,code,max);}
function list(values,code){
  if(!Array.isArray(values))fail(code);
  const seen=new Set(),out=[];
  for(const value of values){
    const item=ref(value,code);
    if(seen.has(item))fail(code+'_DUPLICATE');
    seen.add(item);out.push(item);
  }
  return Object.freeze(out.sort());
}

export function compileContractSurfaceRecord(input={}){
  plain(input,'CONTRACT_SURFACE_INPUT_INVALID');
  const stateFlags={};
  for(const state of STATES){
    const key=state.toLowerCase();
    stateFlags[key]=exactBoolean(input[key],`CONTRACT_SURFACE_${state}_FLAG_REQUIRED`);
  }

  const surface_role=text(input.surface_role,'CONTRACT_SURFACE_ROLE_REQUIRED',32);
  if(!SURFACE_ROLES.has(surface_role))fail('CONTRACT_SURFACE_ROLE_INVALID');
  const effect_class=text(input.effect_class,'CONTRACT_SURFACE_EFFECT_CLASS_REQUIRED',32);
  if(!EFFECT_CLASSES.has(effect_class))fail('CONTRACT_SURFACE_EFFECT_CLASS_INVALID');
  const availability=text(input.availability,'CONTRACT_SURFACE_AVAILABILITY_REQUIRED',32);
  if(!AVAILABILITY.has(availability))fail('CONTRACT_SURFACE_AVAILABILITY_INVALID');

  const blocker_refs=list(input.blocker_refs??[],'CONTRACT_SURFACE_BLOCKER_REF_INVALID');
  const invalidator_refs=list(input.invalidator_refs??[],'CONTRACT_SURFACE_INVALIDATOR_REF_INVALID');

  const blockers=[];
  // Inventory dimensions are observations, not a ladder. Preserve contradictory
  // states so the missing join remains visible instead of throwing the record away.
  if(stateFlags.implemented&&!stateFlags.declared)blockers.push('IMPLEMENTED_WITHOUT_DECLARATION');
  if(stateFlags.applicable&&!stateFlags.implemented)blockers.push('APPLICABLE_SURFACE_NOT_IMPLEMENTED');
  if(stateFlags.qualified&&!stateFlags.applicable)blockers.push('QUALIFIED_WHILE_NOT_APPLICABLE');
  if(stateFlags.current&&!stateFlags.qualified)blockers.push('CURRENT_WITHOUT_QUALIFICATION');
  if(stateFlags.authorized&&!stateFlags.current)blockers.push('AUTHORIZED_WHILE_NOT_CURRENT');
  if(availability==='AVAILABLE'&&!stateFlags.current)blockers.push('AVAILABLE_REQUIRES_CURRENT');
  if(availability==='N_A'&&stateFlags.applicable)blockers.push('N_A_CANNOT_BE_APPLICABLE');
  if(stateFlags.authorized&&!optionalRef(input.authority_ref,'CONTRACT_SURFACE_AUTHORITY_REF_INVALID'))blockers.push('AUTHORIZED_REQUIRES_AUTHORITY_REF');
  if(stateFlags.observed_verified&&!optionalRef(input.readback_ref,'CONTRACT_SURFACE_READBACK_REF_INVALID'))blockers.push('OBSERVED_VERIFIED_REQUIRES_READBACK_REF');
  if(stateFlags.qualified&&!optionalRef(input.qualification_ref,'CONTRACT_SURFACE_QUALIFICATION_REF_INVALID'))blockers.push('QUALIFIED_REQUIRES_QUALIFICATION_REF');
  if(stateFlags.current&&invalidator_refs.length>0)blockers.push('CURRENT_WITH_ACTIVE_INVALIDATORS');

  const structurally_callable=
    stateFlags.declared&&
    stateFlags.implemented&&
    stateFlags.applicable&&
    stateFlags.qualified&&
    stateFlags.current&&
    availability==='AVAILABLE';
  const requires_effect_admission=effect_class==='MUTATION'||effect_class==='EXTERNAL_EFFECT';
  const callable=structurally_callable&&!requires_effect_admission;

  return Object.freeze({
    schema:CONTRACT_SURFACE_INVENTORY_SCHEMA,
    contract_id:ref(input.contract_id,'CONTRACT_SURFACE_CONTRACT_ID_REQUIRED'),
    contract_version:ref(input.contract_version,'CONTRACT_SURFACE_CONTRACT_VERSION_REQUIRED'),
    semantic_owner_ref:ref(input.semantic_owner_ref,'CONTRACT_SURFACE_OWNER_REQUIRED'),
    source_ref:ref(input.source_ref,'CONTRACT_SURFACE_SOURCE_REF_REQUIRED'),
    source_generation:ref(input.source_generation,'CONTRACT_SURFACE_SOURCE_GENERATION_REQUIRED'),
    implementation_ref:optionalRef(input.implementation_ref,'CONTRACT_SURFACE_IMPLEMENTATION_REF_INVALID'),
    adapter_ref:optionalRef(input.adapter_ref,'CONTRACT_SURFACE_ADAPTER_REF_INVALID'),
    adapter_generation:optionalRef(input.adapter_generation,'CONTRACT_SURFACE_ADAPTER_GENERATION_INVALID'),
    provider_runtime_class:optionalText(input.provider_runtime_class,'CONTRACT_SURFACE_PROVIDER_RUNTIME_INVALID',96),
    surface_role,
    operation_ref:ref(input.operation_ref,'CONTRACT_SURFACE_OPERATION_REF_REQUIRED'),
    effect_class,
    applicability_ref:optionalRef(input.applicability_ref,'CONTRACT_SURFACE_APPLICABILITY_REF_INVALID'),
    qualification_ref:optionalRef(input.qualification_ref,'CONTRACT_SURFACE_QUALIFICATION_REF_INVALID'),
    authority_ref:optionalRef(input.authority_ref,'CONTRACT_SURFACE_AUTHORITY_REF_INVALID'),
    readback_ref:optionalRef(input.readback_ref,'CONTRACT_SURFACE_READBACK_REF_INVALID'),
    return_ref:optionalRef(input.return_ref,'CONTRACT_SURFACE_RETURN_REF_INVALID'),
    ...stateFlags,
    availability,
    blocker_refs,
    invalidator_refs,
    structurally_callable,
    requires_effect_admission,
    callable,
    blockers:Object.freeze(blockers),
    state:blockers.length?'REFUSED':structurally_callable?'CURRENT_SUPPORTED':'STRUCTURAL_ONLY',
    authority_granted:false,
    provider_effect:false,
    hard:Object.freeze([
      'DECLARED!=IMPLEMENTED',
      'APPLICABLE_REQUIRED_BUT_NOT_IMPLEMENTED=MISSING_IMPLEMENTATION',
      'IMPLEMENTED!=APPLICABLE',
      'APPLICABLE!=QUALIFIED',
      'QUALIFIED!=CURRENT',
      'CURRENT!=AUTHORIZED',
      'AUTHORIZED!=OBSERVED_VERIFIED',
      'HOST_CONNECTOR_PRESENT!=NATIVE_RUNTIME',
      'PLUGIN_INSTALLED!=ADAPTER_QUALIFIED',
      'UNKNOWN!=N_A',
      'RESULT!=PROVIDER_READBACK',
      'READBACK!=RETURN_APPLIED',
      'INVENTORY_STATUS!=EFFECT_AUTHORITY',
      'CURRENT_MUTATION_SURFACE!=CALLABLE_EFFECT',
      'CURRENT_EXTERNAL_EFFECT_SURFACE!=CALLABLE_EFFECT',
    ]),
  });
}

export function compileContractSurfaceInventory({inventory_ref,generation,records=[]}={}){
  const refId=ref(inventory_ref,'CONTRACT_INVENTORY_REF_REQUIRED');
  const gen=ref(generation,'CONTRACT_INVENTORY_GENERATION_REQUIRED');
  if(!Array.isArray(records))fail('CONTRACT_INVENTORY_RECORDS_REQUIRED');
  const compiled=records.map(compileContractSurfaceRecord);
  const seen=new Set();
  for(const row of compiled){
    const key=`${row.contract_id}|${row.contract_version}|${row.operation_ref}|${row.adapter_ref??'NONE'}`;
    if(seen.has(key))fail('CONTRACT_INVENTORY_DUPLICATE_SURFACE');
    seen.add(key);
  }
  const callable=compiled.filter(row=>row.state==='CURRENT_SUPPORTED');
  const refused=compiled.filter(row=>row.state==='REFUSED');
  const unknown=compiled.filter(row=>row.availability==='UNKNOWN'||row.availability==='BLOCKED'||row.availability==='DEGRADED');
  return Object.freeze({
    schema:CONTRACT_SURFACE_INVENTORY_SCHEMA,
    inventory_ref:refId,
    generation:gen,
    records:Object.freeze(compiled),
    counts:Object.freeze({
      total:compiled.length,
      current_supported:callable.length,
      refused:refused.length,
      unresolved:unknown.length,
    }),
    release_eligible:false,
    authority_granted:false,
    provider_effect:false,
  });
}
