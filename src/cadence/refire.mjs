import crypto from 'node:crypto';

export const MULTI_LOOP_REFIRE_INPUT_SCHEMA='xiio.sdk.multi-loop-refire-input/v1';
export const MULTI_LOOP_REFIRE_SCHEMA='xiio.sdk.multi-loop-refire/v1';

const OPEN_STATES=new Set(['FAIL','WAIT','TRUE_WAIT','UNKNOWN','RUNNABLE','ACTIVE','BLOCKED']);
const TERMINAL_STATES=new Set(['PASS','DONE','RETIRED','N_A_WITH_EVIDENCE','TERMINAL']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(v,k,max=2048){if(typeof v!=='string'||!v.trim()||v.trim()!==v||v.length>max)throw new TypeError(k+'_INVALID');return v;}
function optional(v,max=2048){return typeof v==='string'&&v.trim()&&v.trim()===v&&v.length<=max?v:null;}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(!v||typeof v!=='object')return v;return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');}
function loopRow(raw={},i=0){
  const state=text(raw.state,`loop_${i}_state`).toUpperCase();
  if(!OPEN_STATES.has(state)&&!TERMINAL_STATES.has(state))throw new TypeError(`loop_${i}_state_UNSUPPORTED`);
  return {
    loop_ref:text(raw.loop_ref,`loop_${i}_ref`),
    parent_cell_ref:text(raw.parent_cell_ref,`loop_${i}_parent`),
    state,
    first_red:optional(raw.first_red),
    wake:optional(raw.wake),
    return_target:text(raw.return_target,`loop_${i}_return`),
    effect_ceiling:optional(raw.effect_ceiling)||'NO_EFFECT',
    provider_requirements:Array.isArray(raw.provider_requirements)?raw.provider_requirements.map((p,j)=>({
      provider_ref:text(p.provider_ref,`loop_${i}_provider_${j}`),
      rate_limit_bucket:optional(p.rate_limit_bucket,256)||text(p.provider_ref,`loop_${i}_provider_${j}`),
      material:p.material!==false,
      source_refs:[...new Set((Array.isArray(p.source_refs)?p.source_refs:[]).map((x,k)=>text(x,`loop_${i}_provider_${j}_source_${k}`)))].sort(),
    })):[]
  };
}
function dedupeLoops(loops){
  const seen=new Set(),out=[];
  for(const loop of loops){if(seen.has(loop.loop_ref))continue;seen.add(loop.loop_ref);out.push(loop);}
  return out;
}

export function compileMultiLoopRefire(input={}){
  if(input.schema!==MULTI_LOOP_REFIRE_INPUT_SCHEMA)throw new TypeError('schema_INVALID');
  const generation=text(input.generation,'generation');
  const project_ref=text(input.project_ref,'project_ref');
  const root_uuid=text(input.root_uuid,'root_uuid');
  const work_uuid=text(input.work_uuid,'work_uuid');
  if(!UUID.test(root_uuid)||!UUID.test(work_uuid))throw new TypeError('UUID_INVALID');
  const cold=input.cold_start_flatpack;
  if(!cold||cold.schema!=='xiio.sdk.cold-start-flatpack/v1')throw new TypeError('COLD_START_FLATPACK_REQUIRED');
  if(cold.generation!==generation)throw new TypeError('COLD_START_GENERATION_MISMATCH');
  if(cold.onboarding_ready!==true||cold.local_hydration?.state!=='LOCAL_PAYLOAD_READY')throw new TypeError('LOCAL_PAYLOAD_NOT_READY');
  if(cold.provider_delta_plan?.planned_attempt_count!==0)throw new TypeError('PROVIDER_ATTEMPT_BEFORE_REFIRE');

  const all=dedupeLoops((Array.isArray(input.loops)?input.loops:[]).map(loopRow));
  const open=all.filter(l=>OPEN_STATES.has(l.state));
  const terminal=all.filter(l=>TERMINAL_STATES.has(l.state));
  const refired=open.map((l,index)=>({
    ...l,
    refire_index:index,
    refire_state:l.state==='WAIT'||l.state==='TRUE_WAIT'||l.state==='BLOCKED'
      ?'REFIRED_OBSERVABLE_WAIT'
      :'REFIRED_LOCAL_ACTIVE',
    local_context_ref:cold.package_id,
    provider_attempt:0,
    authority_granted:false,
    provider_effect:false
  }));

  const buckets=new Map();
  for(const loop of refired){
    for(const p of loop.provider_requirements.filter(x=>x.material)){
      const key=p.rate_limit_bucket;
      const row=buckets.get(key)||{bucket:key,provider_refs:new Set(),source_refs:new Set(),loop_refs:new Set()};
      row.provider_refs.add(p.provider_ref);p.source_refs.forEach(x=>row.source_refs.add(x));row.loop_refs.add(loop.loop_ref);buckets.set(key,row);
    }
  }
  for(const req of cold.provider_delta_plan?.requests||[]){
    const key=req.bucket;
    const row=buckets.get(key)||{bucket:key,provider_refs:new Set(),source_refs:new Set(),loop_refs:new Set()};
    for(const p of req.provider_refs||[])row.provider_refs.add(p);
    for(const s of req.source_refs||[])row.source_refs.add(s);
    buckets.set(key,row);
  }

  const sharedProviderDeltas=[...buckets.values()].sort((a,b)=>a.bucket.localeCompare(b.bucket)).map(row=>({
    bucket:row.bucket,
    provider_refs:[...row.provider_refs].sort(),
    source_refs:[...row.source_refs].sort(),
    loop_refs:[...row.loop_refs].sort(),
    attempt:0,
    dedupe_key:'refire-delta:'+digest({generation,bucket:row.bucket,providers:[...row.provider_refs].sort(),sources:[...row.source_refs].sort()}).slice(0,24),
    admission_owner:'SWITCHBOARD',
    state:'PLANNED_NOT_ATTEMPTED',
    automatic_retry:false,
    provider_effect:false
  }));

  const localWorkload={
    workload_ref:'workload:ibal-refire:'+digest({project_ref,generation,loops:refired.map(l=>l.loop_ref)}).slice(0,16),
    workload_class:'interactive_inference',
    privacy_requirement:'LOCAL_ONLY',
    loop_denominator:refired.length,
    loop_refs:refired.map(l=>l.loop_ref),
    context_package_ref:cold.package_id,
    preferred_service_ref:'service:ollama',
    route_owner:'SWITCHBOARD',
    attempt_authorized:false,
    provider_effects:0
  };
  const providerWorkloads=sharedProviderDeltas.map(row=>({
    workload_ref:'workload:provider-delta:'+row.dedupe_key,
    workload_class:'provider_bridge',
    privacy_requirement:'TRUSTED_NODE',
    bucket:row.bucket,
    provider_refs:row.provider_refs,
    source_refs:row.source_refs,
    loop_refs:row.loop_refs,
    attempt_authorized:false,
    provider_effects:0
  }));

  return Object.freeze(JSON.parse(JSON.stringify({
    schema:MULTI_LOOP_REFIRE_SCHEMA,
    generation,project_ref,root_uuid,work_uuid,
    cold_start_package_ref:cold.package_id,
    input_loop_denominator:all.length,
    open_loop_denominator:open.length,
    terminal_loop_denominator:terminal.length,
    refired_loop_denominator:refired.length,
    loops:refired,
    terminal_preserved:terminal,
    shared_provider_deltas:sharedProviderDeltas,
    provider_delta_denominator:sharedProviderDeltas.length,
    provider_attempts:0,
    switchboard:{
      local_inference_workload:localWorkload,
      provider_delta_workloads:providerWorkloads,
      route_owner:'Vado42-chris/xi-io-Switchboard',
      admission_owner:'Vado42-chris/xi-io-Switchboard',
      attempt_authorized:false,
    },
    local_ibal:{
      reasoning_surface:'OLLAMA',
      orchestration_role:'IBAL',
      package_hydrated_once:true,
      loop_contexts_reused:true,
      provider_effect:false,
    },
    next:refired.length?'ROUTE_LOCAL_OLLAMA_THROUGH_SWITCHBOARD_PROJECTION_THEN_RUN_LOOPS_IN_PARALLEL_OR_TYPED_WAIT':'TERMINAL_NO_OPEN_LOOPS',
    authority_granted:false,
    provider_effect:false,
    hard:[
      'REFIRE!=RECONSTRUCT',
      'ONE_COLD_START_PACKAGE_PER_GENERATION',
      'N_OPEN_LOOPS_MAY_REFIRE_TOGETHER',
      'REFIRED_LOOP_PRESERVES_FIRST_RED_AND_RETURN_TARGET',
      'SHARED_PROVIDER_DELTA_DEDUPES_ACROSS_LOOPS',
      'PROVIDER_ATTEMPT_ON_REFIRE=0',
      'OLLAMA_ROUTED_BY_SWITCHBOARD_PROJECTION',
      'SWITCHBOARD_ROUTE!=ATTEMPT_AUTHORITY',
      'LOCAL_INFERENCE!=PROVIDER_EFFECT',
      'TERMINAL_LOOP!=REFIRED_LOOP',
    ]
  })));
}
