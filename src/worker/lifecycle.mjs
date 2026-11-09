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
export const WORKER_ADAPTER_CONFORMANCE_SCHEMA='xiio.sdk.worker-adapter-lifecycle-conformance/v1';

export const WORKER_ADAPTER_REQUIRED_BINDINGS=Object.freeze([
  'work_generation',
  'currentness_recovery',
  'admission',
  'tool_capability',
  'ack',
  'privacy_effect',
  'bounded_execution',
  'yar',
  'result_return',
  'verified_readback',
  'affected_recompile',
  'restart_reconciliation',
  'qualification_independence',
  'installed_consumer',
]);

export const WORKER_RESTART_BOUNDARIES=Object.freeze([
  'RECOVERY',
  'ADMISSION',
  'EXECUTION',
  'YAR',
  'APPLY_RETURN',
  'READBACK',
]);

export const WORKER_QUALIFICATION_DOMAINS=Object.freeze([
  'recovery_wake',
  'admission',
  'affected_return',
]);

const bindingEvidence=(bindings,id)=>{
  const row=bindings?.[id];
  if(!row||typeof row!=='object'||Array.isArray(row)) return {id,state:'MISSING',evidence_ref:null,reason:id.toUpperCase()+'_BINDING_MISSING'};
  const evidence_ref=typeof row.evidence_ref==='string'&&row.evidence_ref.trim()?row.evidence_ref.trim():null;
  if(row.verified!==true||!evidence_ref) return {id,state:'UNVERIFIED',evidence_ref,reason:id.toUpperCase()+'_UNVERIFIED'};
  return {id,state:'PASS',evidence_ref,reason:null};
};

export function compileWorkerAdapterConformance(input={}){
  const adapter_id=text(input.adapter_id,'adapter_id');
  const adapter_kind=text(input.adapter_kind,'adapter_kind');
  const source_generation=text(input.source_generation,'source_generation');
  const installed_generation=text(input.installed_generation,'installed_generation');
  const lifecycle_generation=text(input.lifecycle_generation,'lifecycle_generation');
  const bindings=input.bindings&&typeof input.bindings==='object'&&!Array.isArray(input.bindings)?input.bindings:{};
  const cells=WORKER_ADAPTER_REQUIRED_BINDINGS.map((id)=>bindingEvidence(bindings,id));

  const work=bindings.work_generation||{};
  if(work.verified===true&&(!work.work_ref||!work.generation_ref)){
    cells[cells.findIndex((row)=>row.id==='work_generation')]={id:'work_generation',state:'FAIL',evidence_ref:work.evidence_ref||null,reason:'WORK_GENERATION_IDENTITY_INCOMPLETE'};
  }

  const current=bindings.currentness_recovery||{};
  if(current.verified===true&&(!current.currentness_ref||!current.recovery_ref||!current.hallberg_recovery_ref)){
    cells[cells.findIndex((row)=>row.id==='currentness_recovery')]={id:'currentness_recovery',state:'FAIL',evidence_ref:current.evidence_ref||null,reason:'CURRENTNESS_RECOVERY_INCOMPLETE'};
  } else if(current.verified===true&&current.lifecycle_selected!==true){
    cells[cells.findIndex((row)=>row.id==='currentness_recovery')]={id:'currentness_recovery',state:'FAIL',evidence_ref:current.evidence_ref||null,reason:'RECOVERY_NOT_LIFECYCLE_SELECTED'};
  } else if(current.verified===true&&current.keyword_triggered===true){
    cells[cells.findIndex((row)=>row.id==='currentness_recovery')]={id:'currentness_recovery',state:'FAIL',evidence_ref:current.evidence_ref||null,reason:'KEYWORD_TRIGGERED_RECOVERY_FORBIDDEN'};
  } else if(current.verified===true&&current.ordinary_work_covered!==true){
    cells[cells.findIndex((row)=>row.id==='currentness_recovery')]={id:'currentness_recovery',state:'FAIL',evidence_ref:current.evidence_ref||null,reason:'ORDINARY_WORK_RECOVERY_BYPASS'};
  }

  const admission=bindings.admission||{};
  if(admission.verified===true&&(!admission.assignment_ref||!admission.principal_ref||!admission.admission_ref||admission.current!==true)){
    cells[cells.findIndex((row)=>row.id==='admission')]={id:'admission',state:'FAIL',evidence_ref:admission.evidence_ref||null,reason:'REAL_ADMISSION_BINDING_INCOMPLETE'};
  }

  const tools=bindings.tool_capability||{};
  if(tools.verified===true&&(!tools.capability_ref||!tools.tool_catalog_ref||tools.qualified!==true||tools.current!==true)){
    cells[cells.findIndex((row)=>row.id==='tool_capability')]={id:'tool_capability',state:'FAIL',evidence_ref:tools.evidence_ref||null,reason:'TOOL_CAPABILITY_NOT_CURRENT_QUALIFIED'};
  }

  const ack=bindings.ack||{};
  if(ack.verified===true&&(!ack.ack_ref||!ack.sow_ref)){
    cells[cells.findIndex((row)=>row.id==='ack')]={id:'ack',state:'FAIL',evidence_ref:ack.evidence_ref||null,reason:'ACK_SOW_BINDING_INCOMPLETE'};
  }

  const execution=bindings.bounded_execution||{};
  if(execution.verified===true&&(!execution.attempt_ref||!execution.execution_ref||execution.bounded!==true)){
    cells[cells.findIndex((row)=>row.id==='bounded_execution')]={id:'bounded_execution',state:'FAIL',evidence_ref:execution.evidence_ref||null,reason:'BOUNDED_EXECUTION_INCOMPLETE'};
  }

  const yar=bindings.yar||{};
  if(yar.verified===true&&!yar.yar_ref){
    cells[cells.findIndex((row)=>row.id==='yar')]={id:'yar',state:'FAIL',evidence_ref:yar.evidence_ref||null,reason:'YAR_REF_MISSING'};
  } else if(yar.verified===true&&yar.interrupted_return_reconciled!==true){
    cells[cells.findIndex((row)=>row.id==='yar')]={id:'yar',state:'FAIL',evidence_ref:yar.evidence_ref||null,reason:'YAR_INTERRUPTED_RETURN_UNRECONCILED'};
  }

  const privacy=bindings.privacy_effect||{};
  if(privacy.verified===true&&(!privacy.privacy_ref||!privacy.effect_ceiling)){
    cells[cells.findIndex((row)=>row.id==='privacy_effect')]={id:'privacy_effect',state:'FAIL',evidence_ref:privacy.evidence_ref||null,reason:'PRIVACY_EFFECT_BOUNDARY_INCOMPLETE'};
  }

  const ret=bindings.result_return||{};
  if(ret.verified===true&&(!ret.result_ref||!ret.return_ref||!ret.apply_return_ref)){
    cells[cells.findIndex((row)=>row.id==='result_return')]={id:'result_return',state:'FAIL',evidence_ref:ret.evidence_ref||null,reason:'RESULT_RETURN_CHAIN_INCOMPLETE'};
  } else if(ret.verified===true&&ret.exactly_once!==true){
    cells[cells.findIndex((row)=>row.id==='result_return')]={id:'result_return',state:'FAIL',evidence_ref:ret.evidence_ref||null,reason:'RESULT_RETURN_NOT_EXACTLY_ONCE'};
  } else if(ret.verified===true&&ret.retry_completes_owed_writes!==true){
    cells[cells.findIndex((row)=>row.id==='result_return')]={id:'result_return',state:'FAIL',evidence_ref:ret.evidence_ref||null,reason:'INTERRUPTED_RETURN_RETRY_DOES_NOT_COMPLETE_OWED_WRITES'};
  }

  const readback=bindings.verified_readback||{};
  if(readback.verified===true&&(!readback.readback_ref||!readback.consumer_ref)){
    cells[cells.findIndex((row)=>row.id==='verified_readback')]={id:'verified_readback',state:'FAIL',evidence_ref:readback.evidence_ref||null,reason:'VERIFIED_READBACK_INCOMPLETE'};
  }

  const affected=bindings.affected_recompile||{};
  if(affected.verified===true&&(!affected.affected_set_ref||!affected.recompile_ref||affected.all_and_only!==true)){
    cells[cells.findIndex((row)=>row.id==='affected_recompile')]={id:'affected_recompile',state:'FAIL',evidence_ref:affected.evidence_ref||null,reason:'AFFECTED_ONLY_RECOMPILE_INCOMPLETE'};
  }

  const restart=bindings.restart_reconciliation||{};
  if(restart.verified===true){
    const covered=new Set(Array.isArray(restart.covered_boundaries)?restart.covered_boundaries.map((x)=>String(x).toUpperCase()):[]);
    const missing=WORKER_RESTART_BOUNDARIES.filter((id)=>!covered.has(id));
    if(!restart.coverage_ref||missing.length){
      cells[cells.findIndex((row)=>row.id==='restart_reconciliation')]={
        id:'restart_reconciliation',
        state:'FAIL',
        evidence_ref:restart.evidence_ref||null,
        reason:missing.length?'RESTART_RECONCILIATION_BOUNDARY_MISSING:'+missing.join(','):'RESTART_RECONCILIATION_COVERAGE_REF_MISSING',
      };
    }
  }

  const qualification=bindings.qualification_independence||{};
  if(qualification.verified===true){
    const domains=qualification.domains&&typeof qualification.domains==='object'&&!Array.isArray(qualification.domains)?qualification.domains:{};
    let reason=null;
    for(const domain of WORKER_QUALIFICATION_DOMAINS){
      const row=domains[domain];
      if(!row||!row.execution_ref||!row.hostile_ref||!row.independent_review_ref){
        reason='QUALIFICATION_DOMAIN_INCOMPLETE:'+domain;
        break;
      }
      const principals=[row.executor_principal_ref,row.hostile_principal_ref,row.reviewer_principal_ref].filter(Boolean);
      if(principals.length!==3||new Set(principals).size!==3){
        reason='QUALIFICATION_PRINCIPALS_NOT_INDEPENDENT:'+domain;
        break;
      }
    }
    if(reason){
      cells[cells.findIndex((row)=>row.id==='qualification_independence')]={
        id:'qualification_independence',
        state:'FAIL',
        evidence_ref:qualification.evidence_ref||null,
        reason,
      };
    }
  }

  const installed=bindings.installed_consumer||{};
  if(installed.verified===true&&installed.installed_generation!==source_generation){
    cells[cells.findIndex((row)=>row.id==='installed_consumer')]={id:'installed_consumer',state:'FAIL',evidence_ref:installed.evidence_ref||null,reason:'INSTALLED_GENERATION_MISMATCH'};
  }
  if(installed.verified===true&&installed.lifecycle_generation!==lifecycle_generation){
    cells[cells.findIndex((row)=>row.id==='installed_consumer')]={id:'installed_consumer',state:'FAIL',evidence_ref:installed.evidence_ref||null,reason:'LIFECYCLE_GENERATION_MISMATCH'};
  }

  const failures=cells.filter((row)=>row.state!=='PASS');
  return Object.freeze(clone({
    schema:WORKER_ADAPTER_CONFORMANCE_SCHEMA,
    adapter_id,
    adapter_kind,
    source_generation,
    installed_generation,
    lifecycle_generation,
    denominator:WORKER_ADAPTER_REQUIRED_BINDINGS.length,
    cells,
    pass:cells.filter((row)=>row.state==='PASS').length,
    fail:failures.length,
    // Compatibility: cells/pass/fail describe supplied contract coverage only.
    // Like ACK ROTFL, serialized refs/verified flags cannot authenticate execution.
    supplied_complete:failures.length===0,
    structural_eligible:failures.length===0&&installed_generation===source_generation,
    verification_state:'SUPPLIED_UNVERIFIED',
    runtime_complete:false,
    release_eligible:false,
    runtime_first_red:'AUTHENTICATED_GENERATION_BOUND_WORKER_PROOF_REQUIRED',
    first_red:failures[0]||null,
    authority_granted:false,
    provider_effect:false,
    hard:[
      'ONE_SHARED_WORKER_LIFECYCLE_CONTRACT',
      'MODEL_PROVIDER_PRODUCT_LANE!=LIFECYCLE_EXEMPTION',
      'ADAPTER_SPECIFIC_EVIDENCE!=PRODUCT_SPECIFIC_GATE',
      'MISSING_ADAPTER_BINDING=>RELEASE_FAIL',
      'WORK_CURRENTNESS=>HALLBERG_RECOVERY_RECONCILIATION',
      'RECOVERY_SELECTION!=KEYWORD_TRIGGER',
      'REAL_ADMISSION_REQUIRED',
      'TOOL_VISIBLE!=TOOL_CURRENT_QUALIFIED',
      'ACK!=YAR',
      'ACK=>SOW',
      'ASSIGNED!=ACK!=ATTEMPT',
      'BOUNDED_EXECUTION_REQUIRED',
      'CURRENTNESS_MOVED=>RECOVERY_REBASE_REQUIRED',
      'APPLICATION_OCCURRED!=RETURN_DURABLE',
      'ALREADY!=RECONCILED_COMPLETION',
      'RESULT!=RETURN!=APPLY_RETURN!=READBACK',
      'AFFECTED_RECOMPILE=>ALL_AND_ONLY',
      'PARTIAL_BOUNDARY=>RESTART_RECONCILIATION',
      'RECOVERY_ADMISSION_RETURN=>EXECUTION_HOSTILE_INDEPENDENT_REVIEW',
      'GAMIFICATION!=AUTHORITY',
      'CHECK_THEN_FETCH!=ATOMIC_AUTHORIZED_READ',
      'SDK_CONFORMANCE!=PROVIDER_EFFECT_AUTHORITY',
      'SUPPLIED_WORKER_BINDINGS!=AUTHENTICATED_RUNTIME_READBACK',
      'HISTORICAL_STARTED!=CURRENT_PROCESS_LIVENESS',
      'STRUCTURAL_ELIGIBILITY!=RELEASE_ELIGIBILITY',
    ],
  }));
}

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
  if(input.applicable_ids!==undefined&&!Array.isArray(input.applicable_ids)){
    throw new TypeError('applicable_ids_INVALID');
  }
  const requested=Array.isArray(input.applicable_ids)
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



/** Existing Ibal durable attempt phase engine, shared without moving ownership.
 * Caller MUST hold the existing job, worker and capacity leases for this entire
 * call. history/append/publishReturn are the caller's durable private transport;
 * qualifiedHost and applyReturn remain admitted effect owners. This routine
 * creates no worker, account, grant, lease, executor, store or liveness proof.
 * EXECUTION_STARTED is uncertainty after restart, never a current process claim.
 */
export async function runWorkerLifecycleAttempt({
  binding,jobId,history,current,dependenciesDone,append,checkpoint,
  qualifiedHost,applyReturn,publishReturn,wakeConsumer,digest,
}={}) {
  const fail=code=>Object.assign(new Error(code),{code,status:409});
  const fields=['project_id','work_id','assignment_ref','attempt_id','agent_id','source_generation','return_ref','operation_ref'];
  const bound=b=>Object.fromEntries(fields.map(key=>[key,b[key]]));
  const same=(a,b)=>fields.every(key=>a?.[key]===b?.[key]);
  const clone=value=>structuredClone(value);
  if(!binding||fields.some(key=>typeof binding[key]!=='string'||!binding[key])) throw fail('WORKER_BINDING_REQUIRED');
  if(typeof jobId!=='string'||!jobId) throw fail('JOB_ID_INVALID');
  if([history,current,dependenciesDone,append,checkpoint,publishReturn,wakeConsumer,digest,
    qualifiedHost?.qualify,qualifiedHost?.request,applyReturn?.apply].some(fn=>typeof fn!=='function')) throw fail('WORKER_OWNERS_UNBOUND');
  // The public shared engine cannot assume the caller prevalidated its journal.
  // Validate structural chain identity on every read, including duplicate/restart.
  // This is consistency checking, NOT authentication of the caller's store.
  const phaseOrder=['CLAIM','EXECUTION_STARTED','RESULT','RETURN','APPLY_RETURN_STARTED','APPLY_RETURN','WAKE_ACK'];
  const diagnostics=new Set(['EXECUTION_UNKNOWN','APPLY_RETURN_UNKNOWN','BLOCKED']);
  async function readHistory() {
    const rows=await history(jobId);
    if(!Array.isArray(rows)) throw fail('PERSISTED_HISTORY_INVALID');
    let next=0,result=null,applied=null;
    for(const event of rows) {
      if(diagnostics.has(event?.type)) continue;
      if(event?.type!==phaseOrder[next]) throw fail('PERSISTED_PHASE_ORDER_INVALID');
      const data=event.data;
      if(!same(data,binding)) throw fail('PERSISTED_PHASE_BINDING_INVALID');
      if(event.type==='EXECUTION_STARTED'&&!data.admission_ref) throw fail('PERSISTED_ADMISSION_INVALID');
      if(event.type==='RESULT') {
        if(data.state!=='COMPLETE'||!data.result_ref) throw fail('PERSISTED_RESULT_INVALID');
        const {result_digest,...value}=data;
        if(result_digest!==digest(value)) throw fail('PERSISTED_RESULT_DIGEST_INVALID');
        result=data;
      }
      if(event.type==='RETURN'&&data.result_ref!==result?.result_ref) throw fail('PERSISTED_RETURN_LINK_INVALID');
      if(event.type==='APPLY_RETURN') {
        if(data.state!=='APPLIED'||!data.receipt_ref||data.result_ref!==result?.result_ref) throw fail('PERSISTED_APPLY_RETURN_LINK_INVALID');
        applied=data;
      }
      if(event.type==='WAKE_ACK'&&data.receipt_ref!==applied?.receipt_ref) throw fail('PERSISTED_WAKE_LINK_INVALID');
      next++;
    }
    return rows;
  }
  let events=await readHistory();
  await current(binding);
  if(events.some(e=>e.type==='WAKE_ACK')) return {state:'COMPLETE',job_id:jobId,duplicate:true};
  if(!await dependenciesDone(binding)) return {state:'WAIT_PREDECESSOR_RETURN',job_id:jobId};
  if(!events.some(e=>e.type==='CLAIM')) { await append(jobId,'CLAIM',{...bound(binding)}); await checkpoint('CLAIM',binding); }
  if(!events.some(e=>e.type==='RESULT')) {
    const admission=await qualifiedHost.qualify({binding:clone(binding)});
    if(admission?.state!=='ALLOWED' || !same(admission,binding) || !admission.admission_ref) throw fail('WORKER_ADMISSION_DENIED');
    await current(binding); // Revalidate after asynchronous admission, before any effect.
    if(!await dependenciesDone(binding)) return {state:'WAIT_PREDECESSOR_RETURN',job_id:jobId};
    const started=events.some(e=>e.type==='EXECUTION_STARTED');
    let result;
    if(started) {
      if(typeof qualifiedHost.reconcile!=='function') {
        if(events.at(-1)?.type!=='EXECUTION_UNKNOWN') await append(jobId,'EXECUTION_UNKNOWN',{reason:'HOST_RECONCILIATION_UNBOUND'});
        return {state:'UNKNOWN_EXECUTION',job_id:jobId};
      }
      result=await qualifiedHost.reconcile({binding:clone(binding),idempotencyKey:jobId});
      // Only a durable host receipt may resolve an unknown attempt. Never blind replay.
      if(result?.state!=='COMPLETE') {
        if(events.at(-1)?.type!=='EXECUTION_UNKNOWN') await append(jobId,'EXECUTION_UNKNOWN',{reason:'HOST_EFFECT_READBACK_UNKNOWN'});
        return {state:'UNKNOWN_EXECUTION',job_id:jobId};
      }
    } else {
      await append(jobId,'EXECUTION_STARTED',{...bound(binding),admission_ref:admission.admission_ref});
      await checkpoint('EXECUTION_STARTED',binding);
      result=await qualifiedHost.request({binding:clone(binding),idempotencyKey:jobId});
      await checkpoint('HOST_RESULT_RECEIVED',binding);
    }
    if(result?.state!=='COMPLETE' || !same(result,binding) || !result.result_ref) throw fail('RESULT_BINDING_INVALID');
    if(new TextEncoder().encode(JSON.stringify(result)).byteLength>1048576) throw fail('RESULT_TOO_LARGE');
    await append(jobId,'RESULT',{...clone(result),result_digest:digest(result)}); await checkpoint('RESULT',binding);
  }
  events=await readHistory();
  const result=events.find(e=>e.type==='RESULT').data;
  if(!events.some(e=>e.type==='RETURN')) await append(jobId,'RETURN',{...bound(binding),result_ref:result.result_ref});
  if(!events.some(e=>e.type==='APPLY_RETURN')) {
    await current(binding);
    const started=events.some(e=>e.type==='APPLY_RETURN_STARTED');
    let applied;
    if(started) {
      if(typeof applyReturn.reconcile!=='function') {
        if(events.at(-1)?.type!=='APPLY_RETURN_UNKNOWN') await append(jobId,'APPLY_RETURN_UNKNOWN',{reason:'RETURN_RECONCILIATION_UNBOUND'});
        return {state:'UNKNOWN_APPLY_RETURN',job_id:jobId};
      }
      applied=await applyReturn.reconcile({binding:clone(binding),result:clone(result),idempotencyKey:jobId});
      if(applied?.state!=='APPLIED') {
        if(events.at(-1)?.type!=='APPLY_RETURN_UNKNOWN') await append(jobId,'APPLY_RETURN_UNKNOWN',{reason:'RETURN_EFFECT_READBACK_UNKNOWN'});
        return {state:'UNKNOWN_APPLY_RETURN',job_id:jobId};
      }
    } else {
      await append(jobId,'APPLY_RETURN_STARTED',bound(binding)); await checkpoint('APPLY_RETURN_STARTED',binding);
      applied=await applyReturn.apply({binding:clone(binding),result:clone(result),idempotencyKey:jobId});
      await checkpoint('OWNER_RETURN_RECEIVED',binding);
    }
    await current(binding);
    if(applied?.state!=='APPLIED' || !same(applied,binding) || !applied.receipt_ref || applied.result_ref!==result.result_ref) throw fail('RETURN_BINDING_INVALID');
    await append(jobId,'APPLY_RETURN',clone(applied)); await checkpoint('APPLY_RETURN',binding);
  }
  events=await readHistory();
  const applied=events.find(e=>e.type==='APPLY_RETURN').data;
  await current(binding);
  const wake={schema:'xiio.hotfolder.ready.v1',wake_id:`return-${jobId}`,semantics:'WAKE_ONLY',authority_granted:false,...bound(binding),result_ref:result.result_ref,receipt_ref:applied.receipt_ref};
  await publishReturn(jobId,wake);
  await checkpoint('RETURN_WAKE_READY',binding);
  // The owner consumer must dedupe this wake_id. A repeated notification grants no execution.
  const ack=await wakeConsumer(clone(wake));
  await current(binding);
  if(ack?.state!=='CONSUMED' || !same(ack,binding) || ack.receipt_ref!==applied.receipt_ref) throw fail('CONSUMER_WAKE_UNVERIFIED');
  await append(jobId,'WAKE_ACK',{...bound(binding),receipt_ref:ack.receipt_ref});
  return {state:'COMPLETE',job_id:jobId,result_ref:result.result_ref,return_ref:binding.return_ref};
}
