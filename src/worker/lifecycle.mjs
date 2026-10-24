const SCHEMA='xiio.sdk.worker-lifecycle-kit/v1';

const AVAILABLE=Object.freeze([
  Object.freeze({id:'context_continuation',state:'AVAILABLE',specifier:'@xi-io/sdk/cadence',exports:['compileContinuationCycle'],owner_ref:'xi-io.net#319'}),
  Object.freeze({id:'distributed_ack',state:'AVAILABLE',specifier:'@xi-io/sdk/acks',exports:['validateDistributedAck','validateRotflDistributedAck','validateUniversalEffectPolicy'],owner_ref:'xi-io.net#351'}),
  Object.freeze({id:'local_first_preflight',state:'AVAILABLE',specifier:'@xi-io/sdk/acks/local-first',exports:['compileLocalAckFirstPreflight'],owner_ref:'xi-io.net#319'}),
  Object.freeze({id:'team_formation',state:'AVAILABLE',specifier:'@xi-io/sdk/ibal/team-kit',exports:['compileIbalTeamKit','compileIbalTenReducer'],owner_ref:'xi-io.net#659'}),
  Object.freeze({id:'impact_formation',state:'AVAILABLE',specifier:'@xi-io/sdk/ibal/impact-formation',exports:['compileImpactFormation'],owner_ref:'xi-io.net#453'}),
  Object.freeze({id:'triage_ingress',state:'AVAILABLE',specifier:'@xi-io/sdk/ibal/triage-ingress',exports:['compileTriageIngress'],owner_ref:'xi-io.net#313'}),
  Object.freeze({id:'continuation_wake',state:'AVAILABLE',specifier:'@xi-io/sdk/wakes',exports:['normalizeWakeEnvelope','evaluateWakeProgress'],owner_ref:'xi-io.net#399'}),
  Object.freeze({id:'work_egress',state:'AVAILABLE',specifier:'@xi-io/sdk/work/egress',exports:['compileWorkEgressProjection'],owner_ref:'xi-io.net#315'}),
  Object.freeze({id:'consumer_receipt',state:'AVAILABLE',specifier:'@xi-io/sdk/receipts/fractal-consumer',exports:['compileFractalConsumerReceiptEnvelope'],owner_ref:'xi-io.net#434'}),
  Object.freeze({id:'progress_gated_roles',state:'AVAILABLE',specifier:'@xi-io/sdk/preflight/progress-gated-roles',exports:['compileProgressGateGraduation','progressGatedRoleCatalog'],owner_ref:'xi-io-benchmark#19'}),
  Object.freeze({id:'ack_rotfl',state:'AVAILABLE',specifier:'@xi-io/sdk/ibal/ack-rotfl-compiler',exports:['compileIbalAckRotfl'],owner_ref:'xi-io.net#1085'}),
]);

const GAPS=Object.freeze([
  Object.freeze({id:'worker_assignment_view',state:'GAP_OWNER_BOUND',specifier:null,exports:[],owner_ref:'xi-io.net#351'}),
  Object.freeze({id:'worker_session_activity',state:'GAP_OWNER_BOUND',specifier:null,exports:[],owner_ref:'xi-io-ibal#95'}),
  Object.freeze({id:'worker_capability_view',state:'GAP_OWNER_BOUND',specifier:null,exports:[],owner_ref:'xi-io.net#395'}),
  Object.freeze({id:'atomic_protected_read',state:'GAP_FAIL_CLOSED',specifier:null,exports:[],owner_ref:'xi-io.net#351+xi-io.net#302'}),
]);

const ALL=Object.freeze([...AVAILABLE,...GAPS]);
const clone=(value)=>JSON.parse(JSON.stringify(value));
const text=(value,key)=>{
  if(typeof value!=='string'||!value.trim()||value.trim()!==value||value.length>256) throw new TypeError(key+'_INVALID');
  return value;
};

export const WORKER_LIFECYCLE_KIT_SCHEMA=SCHEMA;
export const WORKER_LIFECYCLE_PRIMITIVES=ALL;

export function workerLifecyclePrimitiveCatalog(){
  return Object.freeze(clone({
    schema:SCHEMA,
    primitives:ALL,
    available_count:AVAILABLE.length,
    gap_count:GAPS.length,
    authority_granted:false,
    provider_effect:false,
    hard:[
      'PRIMITIVE!=AUTHORITY',
      'SKILL_PRESENT!=WORKER_QUALIFIED',
      'WORKER_QUALIFIED!=WORKER_AUTHORIZED',
      'ASSIGNMENT_VIEW!=ASSIGNMENT',
      'TEAM_FORMATION_VIEW!=TEAM_ADMISSION',
      'CHECK_THEN_FETCH!=ATOMIC_AUTHORIZED_READ',
      'NO_ATOMIC_AUTHORIZED_READ=>REFUSE',
      'RESULT!=RETURN!=APPLY_RETURN!=READBACK',
    ],
  }));
}

export function compileWorkerLifecycleKit(input={}){
  const generation=text(input.generation,'generation');
  const requested=Array.isArray(input.applicable_ids)&&input.applicable_ids.length
    ? [...new Set(input.applicable_ids.map((id)=>text(id,'applicable_id')))]
    : ALL.map((row)=>row.id);
  const byId=new Map(ALL.map((row)=>[row.id,row]));
  const unknown=requested.filter((id)=>!byId.has(id));
  if(unknown.length) throw new TypeError('applicable_id_UNKNOWN:'+unknown.join(','));
  const selected=requested.map((id)=>byId.get(id));
  return Object.freeze(clone({
    schema:SCHEMA,
    generation,
    denominator:ALL.length,
    selected_count:selected.length,
    available_count:selected.filter((row)=>row.state==='AVAILABLE').length,
    gap_count:selected.filter((row)=>row.state!=='AVAILABLE').length,
    selected,
    tool_projection:[],
    authority_granted:false,
    provider_effect:false,
    next:selected.some((row)=>row.state!=='AVAILABLE')
      ? 'RESOLVE_OWNER_BOUND_GAPS_THEN_HYDRATE_APPLICABLE_SKILLS'
      : 'HYDRATE_APPLICABLE_SKILLS_AND_QUALIFY_CALLABLE_TOOLS',
    hard:[
      'CATALOG_ENTRY!=LIVE_TOOL',
      'SDK_EXPORT!=INSTALLED_CONSUMER',
      'PRIMITIVE!=AUTHORITY',
      'ASSIGNMENT_VIEW!=ASSIGNMENT',
      'CHECK_THEN_FETCH!=ATOMIC_AUTHORIZED_READ',
      'NO_ATOMIC_AUTHORIZED_READ=>REFUSE',
    ],
  }));
}
