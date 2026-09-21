export const IBAL_TEAM_KIT_SCHEMA='xiio.sdk.ibal-team-kit/v1';
export const IBAL_TEN_REDUCER_SCHEMA='xiio.sdk.ibal-ten-reducer/v1';
export const IBAL_TEAM_ROLES=Object.freeze(['EXECUTE_RESOLVE','DISCOVER_HOSTILE','UX_QUAL_QUANT']);
export const FIVE_LAYERS=Object.freeze(['MICRO','MESO','MACRO','MEGA','META']);

const clean=(v,k,max=512)=>{
  if(typeof v!=='string'||!v.trim()||v.trim()!==v||v.length>max) throw new TypeError(k+'_INVALID');
  return v;
};
const refs=(v,k)=>{
  if(!Array.isArray(v)||v.length===0) throw new TypeError(k+'_REQUIRED');
  const out=[...new Set(v.map((x)=>clean(x,k+'_REF',1024)))];
  if(out.length!==v.length) throw new TypeError(k+'_DUPLICATE');
  return Object.freeze(out);
};
const int=(v,k,min=0,max=1_000_000)=>{
  if(!Number.isInteger(v)||v<min||v>max) throw new TypeError(k+'_INVALID');
  return v;
};
const state=(v,k)=>{
  if(!['PASS','FAIL','WAIT','UNKNOWN','N_A_WITH_EVIDENCE'].includes(v)) throw new TypeError(k+'_INVALID');
  return v;
};

export function compileIbalTeamKit(input={}){
  const role=clean(input.role,'role');
  if(!IBAL_TEAM_ROLES.includes(role)) throw new TypeError('role_INVALID');
  const kit={
    schema:IBAL_TEAM_KIT_SCHEMA,
    team_ref:clean(input.team_ref,'team_ref'),
    generation:clean(input.generation,'generation'),
    parent_root_ref:clean(input.parent_root_ref,'parent_root_ref'),
    partition_ref:clean(input.partition_ref,'partition_ref'),
    role,
    progress_role:clean(input.progress_role||'LIGHT_CANARY','progress_role'),
    skill_refs:refs(input.skill_refs,'skill_refs'),
    script_refs:refs(input.script_refs,'script_refs'),
    flatpack_template_ref:clean(input.flatpack_template_ref,'flatpack_template_ref',1024),
    hot_folder_ref:clean(input.hot_folder_ref,'hot_folder_ref',1024),
    ack_template_refs:refs(input.ack_template_refs,'ack_template_refs'),
    return_target_ref:clean(input.return_target_ref,'return_target_ref',1024),
    disclosure_ref:clean(input.disclosure_ref||input.flatpack_template_ref,'disclosure_ref',1024),
    tool_call_budget:int(input.tool_call_budget??3,'tool_call_budget',1,10),
    max_items_per_pass:int(input.max_items_per_pass??10,'max_items_per_pass',1,25),
    effect_ceiling:input.effect_ceiling??0,
    authority_granted:false,
    provider_effect:false,
  };
  if(kit.effect_ceiling!==0) throw new TypeError('effect_ceiling_INVALID');
  return Object.freeze({
    ...kit,
    kit_complete:true,
    hard:Object.freeze([
      'TEAM_LABEL!=TEAM_KIT',
      'ROLE_SEAT!=LIVE_WORKER',
      'SKILL_REF_REQUIRED',
      'SCRIPT_REF_REQUIRED',
      'FLATPACK_TEMPLATE_REQUIRED',
      'HOT_FOLDER_REQUIRED',
      'ACK_TEMPLATE_REQUIRED',
      'RETURN_TARGET_REQUIRED',
      'PROGRESSIVE_DISCLOSURE_REQUIRED',
      'ONE_PASS_TOOL_CALLS_MUST_STAY_WITHIN_BUDGET',
      'ARTICLE_OR_FLATPACK_FIRST__DETAIL_ON_DEMAND',
      'TOOL_FLOOD=>HOTPATCH_AND_COLLAPSE',
      'TEAM_KIT!=EFFECT_AUTHORITY'
    ])
  });
}

function normalizeLayer(raw={},name){
  return Object.freeze({
    layer:name,
    state:state(raw.state||'UNKNOWN',name+'_state'),
    reap_ref:raw.reap_ref?clean(raw.reap_ref,name+'_reap_ref',1024):null,
    sow_ref:raw.sow_ref?clean(raw.sow_ref,name+'_sow_ref',1024):null,
    evidence_refs:Array.isArray(raw.evidence_refs)?Object.freeze([...new Set(raw.evidence_refs.map((x)=>clean(x,name+'_evidence_ref',1024))) ]):Object.freeze([]),
  });
}

export function compileIbalTenReducer(input={}){
  const children=Array.isArray(input.children)?input.children:[];
  if(children.length!==10) throw new TypeError('TEN_CHILD_DENOMINATOR_MUST_EQUAL_10');
  const childRefs=children.map((x)=>clean(x.child_ref,'child_ref',1024));
  if(new Set(childRefs).size!==10) throw new TypeError('TEN_CHILD_IDENTITY_DUPLICATE');

  const layers=FIVE_LAYERS.map((name)=>normalizeLayer(input.layers?.[name],name));
  const layersPass=layers.every((x)=>x.state==='PASS'&&x.reap_ref&&x.sow_ref&&x.evidence_refs.length>0);

  const baselineLatency=int(input.pressure?.baseline_latency_ms??0,'baseline_latency_ms',0,60_000);
  const observedLatency=int(input.pressure?.observed_latency_ms??0,'observed_latency_ms',0,60_000);
  const latencyBudget=int(input.pressure?.latency_budget_ms??0,'latency_budget_ms',0,60_000);
  const stackWeight=int(input.pressure?.stack_weight??0,'stack_weight',0,1_000_000);
  const stackBudget=int(input.pressure?.stack_weight_budget??0,'stack_weight_budget',0,1_000_000);
  const teamBranches=int(input.pressure?.team_branch_count??0,'team_branch_count',0,10_000);
  const teamBranchBudget=int(input.pressure?.team_branch_budget??0,'team_branch_budget',0,10_000);

  const latencyPressure=observedLatency>baselineLatency+latencyBudget;
  const stackPressure=stackWeight>stackBudget;
  const teamPressure=teamBranches>teamBranchBudget;
  const hotpatchRequired=latencyPressure||stackPressure||teamPressure;

  const resultRef=input.result_ref?clean(input.result_ref,'result_ref',1024):null;
  const returnRef=input.return_ref?clean(input.return_ref,'return_ref',1024):null;
  const applyRef=input.apply_return_ref?clean(input.apply_return_ref,'apply_return_ref',1024):null;
  const readbackRef=input.readback_ref?clean(input.readback_ref,'readback_ref',1024):null;
  const reapRef=input.reap_ref?clean(input.reap_ref,'reap_ref',1024):null;
  const lifecyclePass=Boolean(resultRef&&returnRef&&applyRef&&readbackRef&&reapRef);
  const collapseTo1=layersPass&&lifecyclePass&&!hotpatchRequired;

  return Object.freeze({
    schema:IBAL_TEN_REDUCER_SCHEMA,
    ten_ref:clean(input.ten_ref,'ten_ref'),
    generation:clean(input.generation,'generation'),
    children:Object.freeze(childRefs),
    child_denominator:10,
    layers:Object.freeze(layers),
    five_layer_diff_pass:layersPass,
    pressure:Object.freeze({
      baseline_latency_ms:baselineLatency,
      observed_latency_ms:observedLatency,
      latency_budget_ms:latencyBudget,
      stack_weight:stackWeight,
      stack_weight_budget:stackBudget,
      team_branch_count:teamBranches,
      team_branch_budget:teamBranchBudget,
      latency_pressure:latencyPressure,
      stack_pressure:stackPressure,
      team_pressure:teamPressure,
      hotpatch_required:hotpatchRequired,
    }),
    result_ref:resultRef,
    return_ref:returnRef,
    apply_return_ref:applyRef,
    readback_ref:readbackRef,
    reap_ref:reapRef,
    lifecycle_pass:lifecyclePass,
    collapse_to_1:collapseTo1,
    next:hotpatchRequired?'HOTPATCH_PRESSURE_BEFORE_NEXT_TEN':!layersPass?'COMPLETE_5_LAYER_REAP_SOW_DIFF':!lifecyclePass?'COMPLETE_RESULT_RETURN_APPLY_READBACK_REAP':'ADMIT_NEXT_TEN',
    authority_granted:false,
    provider_effect:false,
    hard:Object.freeze([
      'TEN_ACCOUNTED_10!=TEN_TERMINAL',
      'TEN_REQUIRES_MICRO_MESO_MACRO_MEGA_META_DIFF',
      'REAP!=SOW',
      'TIC_11_BEFORE_TEN_COLLAPSE=FAIL',
      'STACK_OR_LATENCY_PRESSURE=>HOTPATCH',
      'TEAM_FANOUT_PRESSURE=>HOTPATCH',
      'HOTPATCH_REQUIRED=>COLLAPSE_FORBIDDEN',
      'NO_UNIVERSAL_LATENCY_THRESHOLD__BUDGET_IS_FLATPACK_BOUND',
      'RESULT!=RETURN!=APPLY_RETURN!=READBACK!=REAP',
      'COLLAPSE_TO_1!=AUTHORITY'
    ])
  });
}
