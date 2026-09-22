import crypto from 'node:crypto';
import { compileAckItemTrinity } from '../acks/item-trinity.mjs';
import { compileTriageIngress } from './triage-ingress.mjs';
import { compileIbalTeamKit, IBAL_TEAM_ROLES } from './team-kit.mjs';
import { compileQualQuantTopography } from '../data/qual-quant-topography.mjs';
import { compileFlatpackPatch } from '../flatpack/primitives.mjs';

export const IBAL_ACK_ROTFL_COMPILER_INPUT_SCHEMA='xiio.sdk.ibal-ack-rotfl-compiler-input/v1';
export const IBAL_ACK_ROTFL_COMPILER_SCHEMA='xiio.sdk.ibal-ack-rotfl-compiler/v1';

const txt=(v,k,max=1024)=>{if(typeof v!=='string'||!v.trim()||v.trim()!==v||v.length>max)throw new TypeError(k+'_REQUIRED');return v;};
const arr=(v,k)=>{if(!Array.isArray(v))throw new TypeError(k+'_ARRAY_REQUIRED');return v;};
const int=(v,k,min=0,max=1_000_000_000)=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw new TypeError(k+'_INVALID');return v;};
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const hash=v=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const freeze=v=>Object.freeze(JSON.parse(JSON.stringify(v)));

function derivePartitions(ack){
  const open=new Set(ack.open_item_refs);
  return ack.trinity.filter(x=>open.has(x.item_ref)).map((entry)=>({
    partition_ref:'ack-partition:'+hash(entry.item_ref).slice(7,23),
    semantic_key:entry.item_ref,
    state:entry.score_card.projected_state==='UNKNOWN'?'UNKNOWN':'AFFECTED',
    equivalence_key:[
      entry.score_card.projected_state,
      entry.checklist.first_open?.id||'NO_FIRST_OPEN',
      entry.punch_card.next||'NO_NEXT'
    ].join('|'),
    evidence_refs:[...new Set(entry.score_card.evidence_refs||[])],
    wake:entry.punch_card.next||entry.checklist.first_open?.reason||'RESOLVE_ACK_ITEM'
  }));
}

function compileCogThrottle(raw={},openRefs=[]){
  const ownerCurrent=int(raw.owner_current??0,'owner_current',0);
  const ownerBudget=int(raw.owner_budget??0,'owner_budget',0);
  const aiCurrent=int(raw.ai_current??0,'ai_current',0);
  const aiBudget=int(raw.ai_budget??0,'ai_budget',0);
  const maxActive=int(raw.max_active_items??1,'max_active_items',1,10);
  const ownerOver=ownerCurrent>ownerBudget;
  const aiOver=aiCurrent>aiBudget;
  const active=ownerOver||aiOver;
  const activeRefs=active?openRefs.slice(0,Math.min(maxActive,1)):openRefs.slice(0,maxActive);
  const deferredRefs=openRefs.filter(x=>!activeRefs.includes(x));
  return freeze({
    state:active?'COG_THROTTLE_ACTIVE':'WITHIN_COG_BUDGET',
    active,
    owner:{current:ownerCurrent,budget:ownerBudget,over:ownerOver},
    ai:{current:aiCurrent,budget:aiBudget,over:aiOver},
    max_active_items:active?1:maxActive,
    active_refs:activeRefs,
    deferred_refs:deferredRefs,
    suppressed_fanout:active,
    hard:[
      'OWNER_COG_OVER_BUDGET=>COLLAPSE',
      'AI_COG_OVER_BUDGET=>COLLAPSE',
      'COG_THROTTLE_ACTIVE=>ONE_FIRST_RED_ONLY',
      'COG_THROTTLE_ACTIVE=>NO_NEW_TEAM_KITS',
      'DEFERRED_WORK!=DROPPED_WORK',
      'COG_BUDGET!=EFFECT_AUTHORITY'
    ]
  });
}

function compileEconomy(raw={}){
  const measured=raw.measured_elapsed_ms==null?null:int(raw.measured_elapsed_ms,'measured_elapsed_ms',0);
  const rateRaw=raw.rate_card||null;
  let rate=null;
  if(rateRaw!=null){
    rate={
      pricing_ref:txt(rateRaw.pricing_ref,'pricing_ref'),
      rate_microunits_per_second:int(rateRaw.rate_microunits_per_second,'rate_microunits_per_second',0),
    };
  }
  const numerator=measured!=null&&rate?measured*rate.rate_microunits_per_second:null;
  const denominator=numerator==null?null:1000;
  const exact=numerator==null?null:numerator%1000===0?numerator/1000:null;
  const ownerCogs=raw.owner_cogs==null?null:int(raw.owner_cogs,'owner_cogs',0);
  const measuredTokens=raw.measured_tokens==null?null:int(raw.measured_tokens,'measured_tokens',0);
  return freeze({
    measured_elapsed_ms:measured,
    whole_1s_units:measured==null?null:Math.floor(measured/1000),
    remainder_ms:measured==null?null:measured%1000,
    measured_tokens:measuredTokens,
    owner_cogs:ownerCogs,
    pricing_ref:rate?.pricing_ref||null,
    rate_microunits_per_second:rate?.rate_microunits_per_second??null,
    exact_cost_microunits_numerator:numerator,
    exact_cost_microunits_denominator:denominator,
    exact_cost_microunits:exact,
    exact_cost_rational:numerator==null?null:`${numerator}/1000`,
    time_money_state:measured==null?'UNMEASURED':rate==null?'MEASURED_TIME_UNPRICED':'MEASURED_TIME_RATE_BOUND_CANDIDATE',
    time_money_bound_bit:measured!=null&&rate!=null?1:0,
    billing_authorized:false,
    savings_claim_authorized:false,
    hard:[
      'TIME_UNIT_TRANSLATION!=BILLING_AUTHORITY',
      'MEASURED_TIME!=MONEY_WITHOUT_RATE_CARD',
      'SIMULATED_TIME!=MEASURED_TIME',
      'OWNER_COG!=MONEY',
      'PLANNED_SAVING!=VERIFIED_SAVING'
    ]
  });
}

function compilePatchPrep(entry,material,bindings,rotfl){
  const targetRed=`${entry.item_ref}#${entry.checklist.first_open?.id||'VERIFY'}`;
  const patchId=material?.patch_id||('patch:'+hash([entry.item_ref,targetRed]).slice(7,23));
  const required=[
    'patch_contents','preflight_gates','logic_gates','scale_gates',
    'pass_condition','fail_condition','true_wait_condition'
  ];
  const missing=material?required.filter(k=>material[k]==null):required;
  if(!material||missing.length){
    return {
      item_ref:entry.item_ref,
      patch_id:patchId,
      state:'WAIT_PATCH_MATERIAL',
      missing,
      target_red:targetRed,
      flatpack_template_ref:bindings.flatpack_template_ref,
      hot_folder_ref:bindings.hot_folder_ref,
      pack_ready:false,
      pack:null,
      error:null
    };
  }
  try{
    const pack=compileFlatpackPatch({
      patch_id:patchId,
      patch_owner:material.patch_owner||'Ibal',
      target_red:targetRed,
      affected_flatplane_cube:material.affected_flatplane_cube||`cube:${entry.item_ref}`,
      patch_contents:material.patch_contents,
      preflight_gates:material.preflight_gates,
      logic_gates:material.logic_gates,
      scale_gates:material.scale_gates,
      expected_return:material.expected_return||`Return exact patch result for ${entry.item_ref}`,
      apply_return_target:material.apply_return_target||rotfl.apply_return_target_ref,
      readback_target:material.readback_target||rotfl.cold_start_readback_ref,
      bins_custody_target:material.bins_custody_target||rotfl.bins_resource_refs[0],
      reap_target:material.reap_target||rotfl.reap_refs[0],
      owner_cog_delta:Number.isFinite(material.owner_cog_delta)?material.owner_cog_delta:0,
      pass_condition:material.pass_condition,
      fail_condition:material.fail_condition,
      true_wait_condition:material.true_wait_condition,
      effect_ceiling:0
    });
    return {
      item_ref:entry.item_ref,
      patch_id:patchId,
      state:pack.detonation_admitted?'PACK_READY_NO_EFFECT':'PACK_BLOCKED_BY_GATES',
      missing:[],
      target_red:targetRed,
      flatpack_template_ref:bindings.flatpack_template_ref,
      hot_folder_ref:bindings.hot_folder_ref,
      pack_ready:pack.detonation_admitted,
      pack,
      error:null
    };
  }catch(error){
    return {
      item_ref:entry.item_ref,
      patch_id:patchId,
      state:'FAIL_PATCH_PREP',
      missing:[],
      target_red:targetRed,
      flatpack_template_ref:bindings.flatpack_template_ref,
      hot_folder_ref:bindings.hot_folder_ref,
      pack_ready:false,
      pack:null,
      error:String(error?.message||error)
    };
  }
}

export function compileIbalAckRotfl(input={}){
  if(input.schema!==IBAL_ACK_ROTFL_COMPILER_INPUT_SCHEMA)throw new TypeError('SCHEMA_INVALID');
  if((input.effect_ceiling??0)!==0)throw new TypeError('EFFECT_CEILING_MUST_BE_ZERO');

  const root_ref=txt(input.root_ref,'root_ref');
  const work_ref=txt(input.work_ref,'work_ref');
  const project_ref=txt(input.project_ref,'project_ref');
  const studio_root_ref=txt(input.studio_root_ref,'studio_root_ref');
  const root_generation=txt(input.root_generation,'root_generation');
  const occurrence_ref=txt(input.occurrence_ref,'occurrence_ref');
  const checklist_ref=txt(input.checklist_ref,'checklist_ref');

  const ack=compileAckItemTrinity({
    schema:'xiio.sdk.ack-item-trinity-input/v1',
    root_ref,
    root_generation,
    studio_root_ref,
    rotfl_context:input.rotfl_context,
    ack_sources:input.ack_sources,
  });

  const cog=compileCogThrottle(input.cog_pressure||{},ack.open_item_refs);
  const autoPartitions=derivePartitions(ack);
  const partitions=Array.isArray(input.partitions)&&input.partitions.length?input.partitions:autoPartitions;
  const signals={
    ...(input.signals||{}),
    material_canary:(input.signals?.material_canary===true)||ack.open_item_refs.length>0
  };
  const triage=compileTriageIngress({
    schema:'xiio.sdk.triage-ingress/v1',
    occurrence_ref,
    generation:root_generation,
    root_ref,
    work_ref,
    checklist_ref,
    signals,
    partitions,
    history:input.history||{}
  });

  const bindings=input.bindings||{};
  const teamKits=[];
  const teamSource=cog.active?[]:triage.simulated_teams;
  for(const team of teamSource){
    for(const role of IBAL_TEAM_ROLES){
      teamKits.push(compileIbalTeamKit({
        team_ref:`${team.simulated_team_ref}:${role}`,
        generation:root_generation,
        parent_root_ref:root_ref,
        partition_ref:team.quantized_partition_ref,
        role,
        progress_role:input.progress_role||'LIGHT_CANARY',
        skill_refs:bindings.skill_refs,
        script_refs:bindings.script_refs,
        flatpack_template_ref:bindings.flatpack_template_ref,
        hot_folder_ref:bindings.hot_folder_ref,
        ack_template_refs:bindings.ack_template_refs,
        return_target_ref:bindings.return_target_ref||input.rotfl_context?.apply_return_target_ref,
        disclosure_ref:bindings.disclosure_ref||bindings.flatpack_template_ref,
        tool_call_budget:bindings.tool_call_budget??3,
        max_items_per_pass:bindings.max_items_per_pass??10,
        effect_ceiling:0,
      }));
    }
  }

  const topography=input.topography?compileQualQuantTopography(input.topography):null;
  const patchMaterials=input.patch_materials&&typeof input.patch_materials==='object'?input.patch_materials:{};
  const open=new Set(ack.open_item_refs);
  const activeOpen=new Set(cog.active?cog.active_refs:ack.open_item_refs);
  const deferredOpen=ack.open_item_refs.filter(x=>!activeOpen.has(x));
  const patchPrep=ack.trinity.filter(x=>activeOpen.has(x.item_ref)).map(entry=>
    compilePatchPrep(entry,patchMaterials[entry.item_ref],bindings,input.rotfl_context)
  );
  const economy=compileEconomy(input.metering||{});
  const ready=patchPrep.filter(x=>x.pack_ready).length;
  const patchFail=patchPrep.filter(x=>x.state==='FAIL_PATCH_PREP').length;
  const patchWait=patchPrep.filter(x=>x.state==='WAIT_PATCH_MATERIAL'||x.state==='PACK_BLOCKED_BY_GATES').length;

  const next=cog.active&&ack.open_item_refs.length
    ? 'COG_THROTTLE_FIRST_RED_ONLY'
    : ack.open_item_refs.length===0
      ? 'VERIFY_SUPPLIED_ACKS_THEN_RETURN'
      : patchFail>0
      ? 'FIX_PATCH_PREP_FAILURES'
      : triage.triage_required
        ? 'RUN_SIM_TRIAGE_THEN_REDUCE_AND_PREP_PACKS'
        : 'RESOLVE_OPEN_ACKS_THEN_PREP_PACKS';

  return freeze({
    schema:IBAL_ACK_ROTFL_COMPILER_SCHEMA,
    root_ref,work_ref,project_ref,studio_root_ref,root_generation,occurrence_ref,checklist_ref,
    ack_trinity:ack,
    ack_summary:{
      sources:ack.ack_source_count,
      items:ack.ack_item_count,
      open_items:ack.open_item_refs.length,
      n_a:ack.n_a_count,
      accounting_100:ack.trinity_accounting_100,
      silent_remainder:ack.silent_remainder
    },
    triage,
    cog_throttle:cog,
    active_first_red:cog.active_refs[0]||ack.open_item_refs[0]||null,
    deferred_open_ack_refs:deferredOpen,
    team_kit_denominator:teamKits.length,
    team_kits:teamKits,
    topography_state:topography?(topography.quorum.complete?'QUORUM_COMPLETE':'BLOCKED_QUORUM'):'NOT_BOUND',
    topography,
    flatpack_prep:{
      denominator:patchPrep.length,
      deferred_denominator:deferredOpen.length,
      deferred_item_refs:deferredOpen,
      ready,
      wait:patchWait,
      fail:patchFail,
      rows:patchPrep
    },
    economy,
    next,
    compiler_state:patchFail>0?'FAIL_PATCH_PREP':ack.open_item_refs.length?'OPEN_ACKS_COMPILED':'VERIFY_SUPPLIED_ACKS',
    result_return_required:true,
    authority_granted:false,
    provider_effect:false,
    billing_authorized:false,
    live_worker_count:0,
    hard:[
      'IBAL_COMPILER!=EFFECT_AUTHORITY',
      'ACK_PASS!=PATCH_READY',
      'ACK_ITEM!=WORKER',
      'OPEN_ACKS_QUANTIZE_BEFORE_TEAM_FANOUT',
      'RECIPROCAL_COG_OVERLOAD=>ONE_FIRST_RED_ONLY',
      'RECIPROCAL_COG_OVERLOAD=>NO_NEW_TEAM_KITS',
      'DEFERRED_OPEN_ACKS_REMAIN_VISIBLE',
      'SIM_TEAM!=LIVE_TEAM',
      'TEAM_KIT!=DISPATCH',
      'PATCH_PREP!=PATCH_DEPLOY',
      'FLATPACK_READY!=EFFECT_ADMITTED',
      'QUAL_QUANT_QUORUM!=TRUTH_AUTHORITY',
      'TIME_UNIT_TRANSLATION!=BILLING_AUTHORITY',
      'MEASURED_TIME!=MONEY_WITHOUT_RATE_CARD',
      'RESULT!=RETURN!=APPLY_RETURN!=READBACK!=REAP'
    ]
  });
}
