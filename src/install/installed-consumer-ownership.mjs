/**
 * Read-only classification of current installed consumers for one exact dependency.
 *
 * This module never discovers consumers, mutates installation state, or grants
 * rollback authority. It classifies already-authenticated/current evidence.
 */
export const INSTALLED_CONSUMER_OWNERSHIP_INPUT_SCHEMA =
  'xiio.sdk.installed-consumer-ownership/v1';
export const INSTALLED_CONSUMER_OWNERSHIP_SCHEMA =
  'xiio.sdk.installed-consumer-ownership-projection/v1';

const REF=/^[A-Za-z0-9][A-Za-z0-9:._/@#+-]{0,511}$/;
const REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const GENERATION=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SHA256=/^[0-9a-f]{64}$/;
const CURRENTNESS=new Set(['CURRENT','STALE','UNKNOWN']);
const COVERAGE_STATE=new Set(['COMPLETE','INCOMPLETE','UNKNOWN']);

function fail(code){
  const error=new TypeError(code);
  error.code=code;
  throw error;
}
function own(object,key,code){
  if(!object||typeof object!=='object'||Array.isArray(object))fail(code);
  const descriptor=Object.getOwnPropertyDescriptor(object,key);
  if(!descriptor||!Object.hasOwn(descriptor,'value'))fail(code);
  return descriptor.value;
}
function object(value,code){
  if(!value||typeof value!=='object'||Array.isArray(value))fail(code);
  const descriptors=Object.getOwnPropertyDescriptors(value);
  for(const key of Reflect.ownKeys(descriptors)){
    if(typeof key!=='string'||!Object.hasOwn(descriptors[key],'value'))fail(code);
  }
  return value;
}
function text(value,code,max=512){
  if(typeof value!=='string'||!value||value!==value.trim()||value.length>max||/[\r\n\0]/.test(value))fail(code);
  return value;
}
function ref(value,code){const valueText=text(value,code);if(!REF.test(valueText))fail(code);return valueText}
function generation(value,code){const valueText=text(value,code,64);if(!GENERATION.test(valueText))fail(code);return valueText}
function digest(value,code){const valueText=text(value,code,64);if(!SHA256.test(valueText))fail(code);return valueText}
function refs(value,code){
  if(!Array.isArray(value)||!value.length)fail(code);
  const output=[];
  for(const item of value){
    const selected=ref(item,code);
    if(!output.includes(selected))output.push(selected);
  }
  return Object.freeze(output.sort());
}
function timestamp(value,code){
  const selected=text(value,code,128);
  if(!Number.isFinite(Date.parse(selected)))fail(code);
  return selected;
}
function unknown(dependency,consumers,firstRed,evidenceRefs=[]){
  return Object.freeze({
    schema:INSTALLED_CONSUMER_OWNERSHIP_SCHEMA,
    state:'UNKNOWN',
    classification:'UNKNOWN',
    dependency:Object.freeze(dependency),
    consumer_count:consumers.length,
    consumers:Object.freeze(consumers),
    destructive_rollback_allowed:false,
    shared_resource_preservation_required:false,
    reconciliation_required:true,
    first_red:firstRed,
    evidence_refs:Object.freeze([...new Set(evidenceRefs)].sort()),
    authority_granted:false,
    provider_effect:false,
    effect_authority:false,
    hard:Object.freeze([
      'RECEIPT_ABSENT!=EXCLUSIVE',
      'DECLARED_GRAPH!=INSTALLED_CONSUMER',
      'BINDING_PROVIDER_PRODUCT_ID!=CONSUMER_PRODUCT_ID',
      'ATTEMPTED_START!=EXCLUSIVE_OWNERSHIP',
      'CLASSIFICATION!=ROLLBACK_AUTHORITY',
    ]),
  });
}

export function classifyInstalledConsumerOwnership(input={}){
  const candidate=object(input,'INSTALLED_CONSUMER_INPUT_INVALID');
  if(own(candidate,'schema','INSTALLED_CONSUMER_SCHEMA_REQUIRED')!==INSTALLED_CONSUMER_OWNERSHIP_INPUT_SCHEMA){
    fail('INSTALLED_CONSUMER_SCHEMA_INVALID');
  }

  const dependencyRaw=object(own(candidate,'dependency','INSTALLED_CONSUMER_DEPENDENCY_REQUIRED'),'INSTALLED_CONSUMER_DEPENDENCY_INVALID');
  const dependency=Object.freeze({
    dependency_id:ref(own(dependencyRaw,'dependency_id','INSTALLED_CONSUMER_DEPENDENCY_ID_REQUIRED'),'INSTALLED_CONSUMER_DEPENDENCY_ID_INVALID'),
    owner_repo:text(own(dependencyRaw,'owner_repo','INSTALLED_CONSUMER_OWNER_REPO_REQUIRED'),'INSTALLED_CONSUMER_OWNER_REPO_INVALID',256),
    accepted_generation:generation(own(dependencyRaw,'accepted_generation','INSTALLED_CONSUMER_GENERATION_REQUIRED'),'INSTALLED_CONSUMER_GENERATION_INVALID'),
    binding_sha256:digest(own(dependencyRaw,'binding_sha256','INSTALLED_CONSUMER_BINDING_DIGEST_REQUIRED'),'INSTALLED_CONSUMER_BINDING_DIGEST_INVALID'),
  });
  if(!REPO.test(dependency.owner_repo))fail('INSTALLED_CONSUMER_OWNER_REPO_INVALID');

  const coverageRaw=object(own(candidate,'coverage','INSTALLED_CONSUMER_COVERAGE_REQUIRED'),'INSTALLED_CONSUMER_COVERAGE_INVALID');
  const coverageState=text(own(coverageRaw,'state','INSTALLED_CONSUMER_COVERAGE_STATE_REQUIRED'),'INSTALLED_CONSUMER_COVERAGE_STATE_INVALID',32);
  const coverageCurrentness=text(own(coverageRaw,'currentness','INSTALLED_CONSUMER_COVERAGE_CURRENTNESS_REQUIRED'),'INSTALLED_CONSUMER_COVERAGE_CURRENTNESS_INVALID',32);
  if(!COVERAGE_STATE.has(coverageState))fail('INSTALLED_CONSUMER_COVERAGE_STATE_INVALID');
  if(!CURRENTNESS.has(coverageCurrentness))fail('INSTALLED_CONSUMER_COVERAGE_CURRENTNESS_INVALID');
  const coverageObservedAt=timestamp(own(coverageRaw,'observed_at','INSTALLED_CONSUMER_COVERAGE_OBSERVED_AT_REQUIRED'),'INSTALLED_CONSUMER_COVERAGE_OBSERVED_AT_INVALID');
  const coverageEvidence=refs(own(coverageRaw,'evidence_refs','INSTALLED_CONSUMER_COVERAGE_EVIDENCE_REQUIRED'),'INSTALLED_CONSUMER_COVERAGE_EVIDENCE_INVALID');

  const rawConsumers=own(candidate,'consumers','INSTALLED_CONSUMER_ROWS_REQUIRED');
  if(!Array.isArray(rawConsumers))fail('INSTALLED_CONSUMER_ROWS_INVALID');
  const consumers=[];
  const ids=new Set();
  const evidence=[...coverageEvidence];
  let firstRed=null;

  for(let index=0;index<rawConsumers.length;index+=1){
    const row=object(rawConsumers[index],`INSTALLED_CONSUMER_ROW_${index}_INVALID`);
    const consumer_id=ref(own(row,'consumer_id','INSTALLED_CONSUMER_ID_REQUIRED'),'INSTALLED_CONSUMER_ID_INVALID');
    if(ids.has(consumer_id))fail('INSTALLED_CONSUMER_DUPLICATE');
    ids.add(consumer_id);
    const normalized=Object.freeze({
      consumer_id,
      product_id:ref(own(row,'product_id','INSTALLED_CONSUMER_PRODUCT_REQUIRED'),'INSTALLED_CONSUMER_PRODUCT_INVALID'),
      profile_id:ref(own(row,'profile_id','INSTALLED_CONSUMER_PROFILE_REQUIRED'),'INSTALLED_CONSUMER_PROFILE_INVALID'),
      installation_ref:ref(own(row,'installation_ref','INSTALLED_CONSUMER_INSTALLATION_REQUIRED'),'INSTALLED_CONSUMER_INSTALLATION_INVALID'),
      state:text(own(row,'state','INSTALLED_CONSUMER_STATE_REQUIRED'),'INSTALLED_CONSUMER_STATE_INVALID',64),
      currentness:text(own(row,'currentness','INSTALLED_CONSUMER_CURRENTNESS_REQUIRED'),'INSTALLED_CONSUMER_CURRENTNESS_INVALID',32),
      dependency_id:ref(own(row,'dependency_id','INSTALLED_CONSUMER_ROW_DEPENDENCY_REQUIRED'),'INSTALLED_CONSUMER_ROW_DEPENDENCY_INVALID'),
      owner_repo:text(own(row,'owner_repo','INSTALLED_CONSUMER_ROW_OWNER_REQUIRED'),'INSTALLED_CONSUMER_ROW_OWNER_INVALID',256),
      accepted_generation:generation(own(row,'accepted_generation','INSTALLED_CONSUMER_ROW_GENERATION_REQUIRED'),'INSTALLED_CONSUMER_ROW_GENERATION_INVALID'),
      binding_sha256:digest(own(row,'binding_sha256','INSTALLED_CONSUMER_ROW_BINDING_DIGEST_REQUIRED'),'INSTALLED_CONSUMER_ROW_BINDING_DIGEST_INVALID'),
      observed_at:timestamp(own(row,'observed_at','INSTALLED_CONSUMER_ROW_OBSERVED_AT_REQUIRED'),'INSTALLED_CONSUMER_ROW_OBSERVED_AT_INVALID'),
      evidence_refs:refs(own(row,'evidence_refs','INSTALLED_CONSUMER_ROW_EVIDENCE_REQUIRED'),'INSTALLED_CONSUMER_ROW_EVIDENCE_INVALID'),
    });
    if(!CURRENTNESS.has(normalized.currentness))fail('INSTALLED_CONSUMER_CURRENTNESS_INVALID');
    if(!REPO.test(normalized.owner_repo))fail('INSTALLED_CONSUMER_ROW_OWNER_INVALID');
    evidence.push(...normalized.evidence_refs);
    consumers.push(normalized);
    if(!firstRed&&normalized.state!=='INSTALLED_READBACK_VERIFIED')firstRed='CONSUMER_INSTALLED_READBACK_UNVERIFIED';
    if(!firstRed&&normalized.currentness!=='CURRENT')firstRed='CONSUMER_CURRENTNESS_UNVERIFIED';
    if(!firstRed&&(
      normalized.dependency_id!==dependency.dependency_id||
      normalized.owner_repo!==dependency.owner_repo||
      normalized.accepted_generation!==dependency.accepted_generation||
      normalized.binding_sha256!==dependency.binding_sha256
    ))firstRed='CONSUMER_DEPENDENCY_IDENTITY_MISMATCH';
  }

  const frozenConsumers=Object.freeze([...consumers].sort((a,b)=>a.consumer_id.localeCompare(b.consumer_id)));

  if(coverageState!=='COMPLETE'){
    return unknown(dependency,frozenConsumers,'CONSUMER_DENOMINATOR_INCOMPLETE',evidence);
  }
  if(coverageCurrentness!=='CURRENT'){
    return unknown(dependency,frozenConsumers,'CONSUMER_DENOMINATOR_NOT_CURRENT',evidence);
  }
  if(firstRed){
    return unknown(dependency,frozenConsumers,firstRed,evidence);
  }
  if(!frozenConsumers.length){
    return unknown(dependency,frozenConsumers,'NO_CURRENT_CONSUMER_EVIDENCE',evidence);
  }

  const classification=frozenConsumers.length===1?'EXCLUSIVE':'SHARED';
  return Object.freeze({
    schema:INSTALLED_CONSUMER_OWNERSHIP_SCHEMA,
    state:'CLASSIFIED',
    classification,
    dependency,
    coverage:Object.freeze({
      state:coverageState,
      currentness:coverageCurrentness,
      observed_at:coverageObservedAt,
      evidence_refs:coverageEvidence,
    }),
    consumer_count:frozenConsumers.length,
    consumers:frozenConsumers,
    destructive_rollback_allowed:classification==='EXCLUSIVE',
    shared_resource_preservation_required:classification==='SHARED',
    reconciliation_required:false,
    first_red:null,
    evidence_refs:Object.freeze([...new Set(evidence)].sort()),
    authority_granted:false,
    provider_effect:false,
    effect_authority:false,
    hard:Object.freeze([
      'RECEIPT_ABSENT!=EXCLUSIVE',
      'DECLARED_GRAPH!=INSTALLED_CONSUMER',
      'BINDING_PROVIDER_PRODUCT_ID!=CONSUMER_PRODUCT_ID',
      'ATTEMPTED_START!=EXCLUSIVE_OWNERSHIP',
      'CLASSIFICATION!=ROLLBACK_AUTHORITY',
    ]),
  });
}
