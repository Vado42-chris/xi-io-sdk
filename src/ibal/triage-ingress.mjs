import crypto from 'node:crypto';

export const TRIAGE_INGRESS_SCHEMA='xiio.sdk.triage-ingress/v1';
export const TRIAGE_INGRESS_RESULT_SCHEMA='xiio.sdk.triage-ingress-result/v1';
export const TRIAGE_ROLES=Object.freeze(['EXECUTE_RESOLVE','DISCOVER_HOSTILE','UX_QUAL_QUANT']);

function text(v,k){const s=String(v??'').trim();if(!s)throw new TypeError(k+'_REQUIRED');return s;}
function stableUuid(seed){
  const b=Buffer.from(crypto.createHash('sha256').update(seed).digest().subarray(0,16));
  b[6]=(b[6]&0x0f)|0x50;b[8]=(b[8]&0x3f)|0x80;
  const h=b.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function uniq(xs){return [...new Set(xs)];}

export function compileTriageIngress(input={}){
  if(input.schema!==TRIAGE_INGRESS_SCHEMA)throw new TypeError('SCHEMA_INVALID');
  const occurrence_ref=text(input.occurrence_ref,'occurrence_ref');
  const generation=text(input.generation,'generation');
  const root_ref=text(input.root_ref,'root_ref');
  const work_ref=text(input.work_ref,'work_ref');
  const checklist_ref=text(input.checklist_ref,'checklist_ref');

  const s=input.signals||{};
  const perspectives=Number.isInteger(s.distinct_perspectives)?s.distinct_perspectives:0;
  const reasons=[];
  if(s.material_canary===true)reasons.push('MATERIAL_CANARY');
  if(s.owner_correction===true)reasons.push('OWNER_CORRECTION');
  if(s.legal_wording_risk===true)reasons.push('LEGAL_WORDING_RISK');
  if(s.named_path_unresolved===true)reasons.push('NAMED_PATH_UNRESOLVED');
  if(s.currentness_unknown===true)reasons.push('CURRENTNESS_UNKNOWN');
  if(s.denominator_incomplete===true)reasons.push('DENOMINATOR_INCOMPLETE');
  if(s.reciprocal_ux_risk===true)reasons.push('RECIPROCAL_UX_RISK');
  if(s.contradiction_present===true)reasons.push('CONTRADICTION_PRESENT');
  if(s.truncation_risk===true)reasons.push('TRUNCATION_RISK');
  if(s.false_green_recurrence===true)reasons.push('FALSE_GREEN_RECURRENCE');
  if(perspectives>=2)reasons.push('MULTI_PERSPECTIVE_'+perspectives);

  const triageRequired=s.material_canary===true && (
    s.legal_wording_risk===true ||
    s.named_path_unresolved===true ||
    s.currentness_unknown===true ||
    s.denominator_incomplete===true ||
    s.reciprocal_ux_risk===true ||
    s.contradiction_present===true ||
    s.truncation_risk===true ||
    s.false_green_recurrence===true ||
    perspectives>=2
  );

  const rawPartitions=Array.isArray(input.partitions)?input.partitions:[];
  const seen=new Set();
  const partitions=[];
  for(const raw of rawPartitions){
    const partition_ref=text(raw?.partition_ref,'partition_ref');
    if(seen.has(partition_ref))throw new TypeError('DUPLICATE_PARTITION_REF');
    seen.add(partition_ref);
    const semantic_key=text(raw?.semantic_key,'semantic_key');
    const state=String(raw?.state||'UNKNOWN').toUpperCase();
    if(!['AFFECTED','UNKNOWN','NO_EFFECT'].includes(state))throw new TypeError('PARTITION_STATE_INVALID');
    const equivalence_key=String(raw?.equivalence_key||semantic_key).trim();
    partitions.push({partition_ref,semantic_key,state,equivalence_key,evidence_refs:uniq((raw?.evidence_refs||[]).filter(Boolean)),wake:raw?.wake||null});
  }

  const quantized=[];
  const groups=new Map();
  for(const p of partitions){
    const key=`${p.state}|${p.equivalence_key}`;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(p);
  }
  for(const [key,members] of groups){
    quantized.push({
      quantized_ref:'q:'+stableUuid([root_ref,work_ref,generation,key].join('|')),
      state:members[0].state,
      equivalence_key:members[0].equivalence_key,
      member_refs:members.map(x=>x.partition_ref),
      member_count:members.length,
      evidence_refs:uniq(members.flatMap(x=>x.evidence_refs)),
      wakes:uniq(members.map(x=>x.wake).filter(Boolean))
    });
  }

  const runnable=quantized.filter(q=>q.state!=='NO_EFFECT');
  const teams=triageRequired?runnable.map((q,index)=>({
    simulated_team_ref:'simtri:'+stableUuid([occurrence_ref,generation,q.quantized_ref,index].join('|')),
    quantized_partition_ref:q.quantized_ref,
    roles:[...TRIAGE_ROLES],
    mode:'SIMULATED_TRINITY',
    live_worker_count:0,
    authority_granted:false,
    effect_authority:0
  })):[];
  const missingPartition=triageRequired&&runnable.length===0;

  const serialResearchViolation=triageRequired&&input.history?.serial_steps_before_triage>0;
  const onsetRef=input.history?.first_material_canary_ref||occurrence_ref;

  return Object.freeze(JSON.parse(JSON.stringify({
    schema:TRIAGE_INGRESS_RESULT_SCHEMA,
    occurrence_ref,generation,root_ref,work_ref,checklist_ref,
    triage_required:triageRequired,
    decision:!triageRequired?'SINGLETON_OK':missingPartition?'WAIT_PARTITION_CENSUS':'FORM_SIM_TRIAGE_NOW',
    trigger_reasons:reasons,
    retrospective_onset_ref:onsetRef,
    historical_timing_state:serialResearchViolation?'LATE_TRIAGE':'ON_TIME_OR_NOT_APPLICABLE',
    serial_steps_before_triage:Number.isInteger(input.history?.serial_steps_before_triage)?input.history.serial_steps_before_triage:0,
    raw_partition_denominator:partitions.length,
    quantized_partition_denominator:quantized.length,
    runnable_partition_denominator:runnable.length,
    quantized_partitions:quantized,
    simulated_team_denominator:teams.length,
    simulated_teams:teams,
    live_materialized_teams:0,
    internal_live_dispatches:0,
    external_live_dispatches:0,
    live_materialization_state:'FORBIDDEN_DURING_SELF_REPAIR__SEPARATE_ACK_QUALIFICATION_REQUIRED_AFTER_ROOT_GREEN',
    next:!triageRequired?'CONTINUE_SINGLETON_ATOMIC_GATE':missingPartition?'CENSUS_PARTITIONS_THEN_RECOMPILE':'RUN_SIM_TEAMS_IN_PROCESS_THEN_QUANTIZE_RETURNS__NO_LIVE_DISPATCH',
    authority_granted:false,
    effect_authority:0,
    hard:[
      'FIRST_MATERIAL_CANARY_REQUIRES_TRIAGE_DECISION',
      'LEGAL_WORDING_RISK+MATERIAL_CANARY=>TRIAGE',
      'NAMED_PATH_UNRESOLVED+MATERIAL_CANARY=>TRIAGE',
      'DENOMINATOR_INCOMPLETE+MATERIAL_CANARY=>TRIAGE',
      'MULTI_PERSPECTIVE>=2+MATERIAL_CANARY=>TRIAGE',
      'QUANTIZE_BEFORE_TEAM_FANOUT',
      'N_SIM_TEAMS_ALLOWED',
      'SIM_TEAM!=LIVE_TEAM',
      'SELF_REPAIR_BEFORE_INTERNAL_LIVE_FANOUT',
      'SELF_REPAIR_BEFORE_EXTERNAL_LIVE_FANOUT',
      'INTERNAL_LIVE_FANOUT=0_DURING_ROOT_REPAIR',
      'EXTERNAL_LIVE_FANOUT=0_DURING_ROOT_REPAIR',
      'TEAM_PROJECTION!=DISPATCH',
      'TRIAGE_REQUIRED+SERIAL_SELF_RESEARCH=TIMING_FAIL',
      'LIVE_MATERIALIZATION_REQUIRES_ACK_AND_PROGRESS_GATE'
    ]
  })));
}
