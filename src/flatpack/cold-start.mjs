import crypto from 'node:crypto';
import { FlatpackPatch } from './primitives.mjs';

export const COLD_START_FLATPACK_INPUT_SCHEMA='xiio.sdk.cold-start-flatpack-input/v1';
export const COLD_START_FLATPACK_SCHEMA='xiio.sdk.cold-start-flatpack/v1';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_STATES=new Set(['CURRENT_WITH_RECEIPT','STALE','UNKNOWN','UNAVAILABLE','RATE_LIMITED','NOT_REQUIRED']);
const PAYLOAD_ROLES=Object.freeze([
  'CURRENT_SELECTOR','CURRENT_ACK','CURRENT_DENOMINATOR','TOOL_CAPABILITY_DELTA',
  'CURRENT_SKILLS','CURRENT_LEXICON','RETURN_TARGETS'
]);

function text(v,k,max=2048){
  if(typeof v!=='string'||!v.trim()||v.trim()!==v||v.length>max)throw new TypeError(k+'_INVALID');
  return v;
}
function optional(v,max=2048){
  return typeof v==='string'&&v.trim()&&v.trim()===v&&v.length<=max?v:null;
}
function bool(v,k){if(typeof v!=='boolean')throw new TypeError(k+'_INVALID');return v;}
function integer(v,k,min=0,max=100000){if(!Number.isInteger(v)||v<min||v>max)throw new TypeError(k+'_INVALID');return v;}
function canonical(v){
  if(Array.isArray(v))return v.map(canonical);
  if(!v||typeof v!=='object')return v;
  return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));
}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');}
function dedupeRows(rows,keyFn){
  const seen=new Set(),out=[];
  for(const row of rows){const k=keyFn(row);if(seen.has(k))continue;seen.add(k);out.push(row);}
  return out;
}
function payloadRow(raw={},i=0){
  const role=text(raw.role||'',`payload_${i}_role`);
  if(!PAYLOAD_ROLES.includes(role))throw new TypeError(`payload_${i}_role_UNSUPPORTED`);
  const ref=text(raw.ref||'',`payload_${i}_ref`);
  const generation=text(raw.generation||'',`payload_${i}_generation`);
  const state=text(raw.state||'',`payload_${i}_state`);
  const required=raw.required!==false;
  const content_digest=optional(raw.content_digest,256);
  const inline=raw.inline===undefined?null:canonical(raw.inline);
  return {role,ref,generation,state,required,content_digest,inline};
}
function providerRow(raw={},i=0){
  const provider_ref=text(raw.provider_ref||'',`provider_${i}_ref`);
  const state=text(raw.state||'',`provider_${i}_state`);
  if(!PROVIDER_STATES.has(state))throw new TypeError(`provider_${i}_state_INVALID`);
  return {
    provider_ref,
    state,
    last_known_generation:optional(raw.last_known_generation,512),
    last_receipt_ref:optional(raw.last_receipt_ref,1024),
    required_for_current_work:raw.required_for_current_work===true,
    source_refs:[...new Set((Array.isArray(raw.source_refs)?raw.source_refs:[]).map((x,j)=>text(x,`provider_${i}_source_${j}`)))].sort(),
    rate_limit_bucket:optional(raw.rate_limit_bucket,256)||provider_ref,
    freshness_reason:optional(raw.freshness_reason,1024),
  };
}

export function compileColdStartFlatpack(input={}){
  if(input.schema!==COLD_START_FLATPACK_INPUT_SCHEMA)throw new TypeError('schema_INVALID');
  const package_id=text(input.package_id,'package_id');
  const generation=text(input.generation,'generation');
  const project_ref=text(input.project_ref,'project_ref');
  const root_uuid=text(input.root_uuid,'root_uuid');
  const work_uuid=text(input.work_uuid,'work_uuid');
  if(!UUID.test(root_uuid))throw new TypeError('root_uuid_INVALID');
  if(!UUID.test(work_uuid))throw new TypeError('work_uuid_INVALID');

  const payloadRows=(Array.isArray(input.payload)?input.payload:[]).map(payloadRow);
  const payload=dedupeRows(payloadRows,r=>r.role+'|'+r.ref+'|'+r.generation);
  const roleGroups=Object.fromEntries(PAYLOAD_ROLES.map(role=>[role,payload.filter(r=>r.role===role)]));
  const missingRoles=[];
  for(const role of PAYLOAD_ROLES){
    const rows=roleGroups[role];
    if(!rows.length||!rows.some(r=>r.required!==false))missingRoles.push(role);
  }
  const staleRequiredPayload=payload.filter(r=>r.required&&r.generation!==generation&&r.state!=='N_A_WITH_EVIDENCE');
  const payloadLocalReady=missingRoles.length===0&&staleRequiredPayload.length===0;

  const providers=dedupeRows((Array.isArray(input.providers)?input.providers:[]).map(providerRow),r=>r.provider_ref);
  const providerDeltaGroups=new Map();
  const providerDispositions=[];
  for(const p of providers){
    let disposition='NO_CALL_CURRENT';
    if(!p.required_for_current_work) disposition=p.state==='CURRENT_WITH_RECEIPT'?'NO_CALL_CURRENT':'DEFER_NOT_REQUIRED';
    else if(p.state==='CURRENT_WITH_RECEIPT'&&p.last_receipt_ref) disposition='NO_CALL_CURRENT';
    else disposition='TARGETED_DELTA_REQUIRED';
    providerDispositions.push({...p,disposition});
    if(disposition==='TARGETED_DELTA_REQUIRED'){
      const key=p.rate_limit_bucket;
      if(!providerDeltaGroups.has(key))providerDeltaGroups.set(key,[]);
      providerDeltaGroups.get(key).push(p);
    }
  }

  const maxProviderAttemptsPerBucket=integer(input.provider_policy?.max_attempts_per_bucket??1,'max_attempts_per_bucket',0,100);
  const provider_requests=[...providerDeltaGroups.entries()].map(([bucket,rows])=>{
    const provider_refs=rows.map(r=>r.provider_ref).sort();
    const source_refs=[...new Set(rows.flatMap(r=>r.source_refs))].sort();
    const dedupe_key='provider-delta:'+digest({generation,bucket,provider_refs,source_refs}).slice(0,24);
    return {
      bucket,
      provider_refs,
      source_refs,
      attempt:0,
      max_attempts:maxProviderAttemptsPerBucket,
      dedupe_key,
      batch_required:true,
      after_local_hydration:true,
      automatic_retry:false,
      automatic_cloud_fallback:false,
      state:'PLANNED_NOT_ATTEMPTED'
    };
  });

  const providerAttemptCeiling=provider_requests.reduce((n,r)=>n+r.max_attempts,0);
  const providerCallsRequired=provider_requests.length;
  const local_manifest={
    schema:'xiio.sdk.cold-start-flatpack-manifest/v1',
    package_id,generation,project_ref,root_uuid,work_uuid,
    payload:payload.map(r=>({
      role:r.role,ref:r.ref,generation:r.generation,state:r.state,
      required:r.required,content_digest:r.content_digest,
      inline_digest:r.inline===null?null:digest(r.inline)
    })),
    payload_role_counts:Object.fromEntries(PAYLOAD_ROLES.map(role=>[role,roleGroups[role].length])),
    current_selector_ref:roleGroups.CURRENT_SELECTOR[0]?.ref||null,
    ack_ref:roleGroups.CURRENT_ACK[0]?.ref||null,
    denominator_ref:roleGroups.CURRENT_DENOMINATOR[0]?.ref||null,
    return_target_refs:roleGroups.RETURN_TARGETS.map(r=>r.ref),
  };
  const package_digest='sha256:'+digest({local_manifest,providerDispositions,provider_requests});
  const localHydration={
    state:payloadLocalReady?'LOCAL_PAYLOAD_READY':'WAIT_LOCAL_PAYLOAD',
    missing_roles:missingRoles,
    stale_required_payload:staleRequiredPayload.map(r=>({role:r.role,ref:r.ref,generation:r.generation})),
    provider_calls_before_hydration_allowed:false,
    provider_calls_required_for_bootstrap:0,
    chat_history_replay_required:false,
    full_provider_archaeology_required:false,
  };

  const patch=FlatpackPatch({
    patch_id:package_id,
    patch_owner:'COLD_START_ONBOARDING',
    target_red:'PROVIDER_FIRST_ONBOARDING_RATE_LIMIT_PRESSURE',
    affected_flatplane_cube:'COLD_START_ONBOARDING_CUBE',
    patch_contents:{
      local_manifest,
      package_digest,
      provider_delta_plan:provider_requests,
      provider_dispositions:providerDispositions,
    },
    preflight_gates:[
      {gate_id:'LOCAL_PAYLOAD_COMPLETE',state:payloadLocalReady?'PASS':'FAIL',evidence_ref:package_id+'#manifest'},
      {gate_id:'PROVIDER_ATTEMPTS_ZERO_AT_BOOTSTRAP',state:'PASS',evidence_ref:package_id+'#provider-plan'},
      {gate_id:'AUTOMATIC_CLOUD_FALLBACK_DISABLED',state:'PASS',evidence_ref:package_id+'#provider-plan'},
    ],
    logic_gates:[
      {gate_id:'HYDRATE_LOCAL_FIRST',state:payloadLocalReady?'PASS':'FAIL',evidence_refs:[package_id+'#manifest']},
      {gate_id:'QUANTIZE_PROVIDER_DELTAS',state:'PASS',evidence_refs:[package_id+'#provider-plan']},
      {gate_id:'BATCH_PER_RATE_LIMIT_BUCKET',state:'PASS',evidence_refs:[package_id+'#provider-plan']},
    ],
    scale_gates:{'10S':'PASS','100S':'PASS','00S':'PASS','MICRO':'PASS','MESO':'PASS','MACRO':'PASS','META':'PASS'},
    expected_return:'Hydrate local package, then resolve only targeted provider deltas that remain material to current work.',
    apply_return_target:text(input.apply_return_target||project_ref,'apply_return_target'),
    readback_target:text(input.readback_target||project_ref,'readback_target'),
    bins_custody_target:text(input.bins_custody_target||'bins:WAIT_CUSTODY','bins_custody_target'),
    reap_target:text(input.reap_target||project_ref,'reap_target'),
    pass_condition:'Fresh worker can select current work from local payload before any third-party provider call; provider deltas are batched/deduped and attempt0 until explicit execution.',
    fail_condition:'Worker hits Slack/GitHub/Google or another third-party provider to reconstruct known current state before local payload hydration, or fans out duplicate provider calls.',
    true_wait_condition:'Local package is intact but a material currentness delta requires a provider call that is rate-limited/unavailable.',
    effect_ceiling:0,
  });

  return Object.freeze(JSON.parse(JSON.stringify({
    schema:COLD_START_FLATPACK_SCHEMA,
    package_id,generation,project_ref,root_uuid,work_uuid,
    package_digest,
    local_manifest,
    local_hydration:localHydration,
    provider_dispositions:providerDispositions,
    provider_delta_plan:{
      requests:provider_requests,
      request_count:providerCallsRequired,
      planned_attempt_count:0,
      maximum_attempt_ceiling:providerAttemptCeiling,
      provider_first_bootstrap:false,
      batch_before_provider:true,
      dedupe_before_provider:true,
      targeted_delta_only:true,
    },
    flatpack_patch:patch,
    onboarding_ready:payloadLocalReady,
    next:!payloadLocalReady?'REPAIR_LOCAL_PAYLOAD'
      :providerCallsRequired?'HYDRATE_LOCAL_THEN_EXECUTE_TARGETED_PROVIDER_DELTAS_OR_TYPED_WAIT'
      :'HYDRATE_LOCAL_AND_SELECT_WORK',
    authority_granted:false,
    provider_effect:false,
    hard:[
      'LOCAL_PAYLOAD_BEFORE_PROVIDER',
      'KNOWN_STATE_PROVIDER_RECONSTRUCTION=FAIL',
      'PROVIDER_ATTEMPT_AT_BOOTSTRAP=0',
      'BATCH_BEFORE_PROVIDER',
      'DEDUPE_BEFORE_PROVIDER',
      'PROVIDER_DELTA!=FULL_PROVIDER_ARCHAEOLOGY',
      'RATE_LIMITED_PROVIDER!=ROOT_STOP',
      'AUTOMATIC_CLOUD_FALLBACK=FORBIDDEN',
      'PACKAGE_DIGEST!=PROVIDER_CURRENTNESS_AUTHORITY',
      'LOCAL_PAYLOAD_READY!=PROVIDER_DELTA_CURRENT',
      'FLATPACK_EXPORT!=EFFECT_AUTHORITY',
      'CHAT_HISTORY_REPLAY_REQUIRED=FAIL',
    ],
  })));
}

export function coldStartFlatpackPayloadRoles(){
  return Object.freeze([...PAYLOAD_ROLES]);
}
