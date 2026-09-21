import { compileGraduationPreflight } from './graduation.mjs';

export const PROGRESS_GATED_ROLES = Object.freeze([
  Object.freeze({
    role:'LIGHT_CANARY',
    ordinal:10,
    progress_gate:'PG10_LIGHT_CANARY',
    previous_role:'UNQUALIFIED',
    mission:'Plan, census, observe and binary-test the smallest current denominator.',
    required_profiles:Object.freeze(['ROOT_R0_R13','ACK_ROTFL_O0_O13']),
    hostile_denominator_minimum:100,
    meta_wake_required:false,
  }),
  Object.freeze({
    role:'MEDIUM_MINER',
    ordinal:20,
    progress_gate:'PG20_MEDIUM_MINER',
    previous_role:'LIGHT_CANARY',
    mission:'Repair one failed or unknown machine-workerable affected cell with the smallest tested hot patch.',
    required_profiles:Object.freeze(['ROOT_R0_R13','ACK_ROTFL_O0_O13','WORK_0_15']),
    hostile_denominator_minimum:100,
    meta_wake_required:false,
  }),
  Object.freeze({
    role:'HEAVY_FOREMAN',
    ordinal:30,
    progress_gate:'PG30_HEAVY_FOREMAN',
    previous_role:'MEDIUM_MINER',
    mission:'Orchestrate fan-in, currentness, promotion lease, return/apply/reap and independent verification.',
    required_profiles:Object.freeze(['ROOT_R0_R13','ACK_ROTFL_O0_O13','WORK_0_15','RELEASE_P0_P13']),
    hostile_denominator_minimum:100,
    meta_wake_required:false,
  }),
  Object.freeze({
    role:'META_ARCHITECT',
    ordinal:40,
    progress_gate:'PG40_META_ARCHITECT',
    previous_role:'HEAVY_FOREMAN',
    mission:'Promote a universal primitive or organizational-intent change only from repeated independent evidence or explicit owner universalization.',
    required_profiles:Object.freeze(['ROOT_R0_R13','ACK_ROTFL_O0_O13','WORK_0_15','TEMPLATE_L1_L10']),
    hostile_denominator_minimum:100,
    meta_wake_required:true,
  }),
]);

const BASELINES=Object.freeze([
  'SDK_BASELINE_CURRENT',
  'ACK_BASELINE_CURRENT',
  'ORGANIZATIONAL_INTENT_CURRENT',
  'CURRENT_SELECTOR_CURRENT',
]);
const RETURN_CELLS=Object.freeze(['RESULT','RETURN','APPLY_RETURN','READBACK','REAP']);
const META_WAKE_KINDS=new Set([
  'OWNER_EXPLICIT_UNIVERSALIZATION',
  'SAME_DEFECT_TWO_OR_MORE_INDEPENDENT_CHILD_RETURNS',
  'SAME_ADOPTER_FAILURE_TWO_OR_MORE_PRODUCTS_OR_LANES',
]);

function text(v,k,max=1024){
  if(typeof v!=='string'||!v.trim()||v.trim()!==v||v.length>max) throw new TypeError(k+'_INVALID');
  return v;
}
function integer(v,k,min=0,max=1000000){
  if(!Number.isInteger(v)||v<min||v>max) throw new TypeError(k+'_INVALID');
  return v;
}
function roleSpec(role){
  const spec=PROGRESS_GATED_ROLES.find(x=>x.role===role);
  if(!spec) throw new TypeError('target_role_INVALID');
  return spec;
}
function evidencePass(row){
  return row?.state==='PASS' && Array.isArray(row.evidence_refs) && row.evidence_refs.length>0
    && row.evidence_refs.every(x=>typeof x==='string'&&x.trim());
}

export function compileProgressGateGraduation(input={}){
  const subject_ref=text(input.subject_ref,'subject_ref');
  const source_generation=text(input.source_generation,'source_generation');
  const target=roleSpec(input.target_role);
  const current_role=input.current_role||'UNQUALIFIED';
  const cells=[];
  const add=(id,state,evidence_refs=[],reason=null)=>cells.push({id,state,evidence_refs:[...new Set(evidence_refs)],reason});

  add('G01_SEQUENTIAL_ROLE',
    current_role===target.previous_role?'PASS':'FAIL',
    [`current:${current_role}`,`required_previous:${target.previous_role}`],
    current_role===target.previous_role?null:'ROLE_SKIP_OR_WRONG_PREVIOUS_ROLE');

  const baselines=input.project_baselines||{};
  for(const id of BASELINES){
    const row=baselines[id];
    add(`G02_BASELINE_${id}`,evidencePass(row)?'PASS':'FAIL',row?.evidence_refs||[],evidencePass(row)?null:'BASELINE_NOT_CURRENT_WITH_EVIDENCE');
  }

  const receipts=input.preflight_receipts||{};
  for(const profile of target.required_profiles){
    const raw=receipts[profile];
    let compiled=null;
    try {
      compiled=raw?.compiled_receipt || (raw?.input ? compileGraduationPreflight(raw.input) : null);
    } catch {}
    const pass=compiled?.profile===profile && compiled?.source_generation===source_generation
      && compiled?.release_eligible===true && compiled?.authority_granted===false;
    add(`G03_PROFILE_${profile}`,pass?'PASS':'FAIL',
      pass?[raw?.evidence_ref||`preflight:${profile}:${source_generation}`].filter(Boolean):[],
      pass?null:'PROFILE_NOT_CURRENT_RELEASE_ELIGIBLE');
  }

  const hostile=input.hostile_test||{};
  const hostileDen=Number.isInteger(hostile.denominator)?hostile.denominator:0;
  const detected=Number.isInteger(hostile.hostile_rejected)?hostile.hostile_rejected:-1;
  const falseGreen=Number.isInteger(hostile.false_green)?hostile.false_green:-1;
  const hostilePass=hostileDen>=target.hostile_denominator_minimum && detected===hostileDen && falseGreen===0
    && typeof hostile.fixture_ref==='string' && hostile.fixture_ref.length>0
    && typeof hostile.receipt_ref==='string' && hostile.receipt_ref.length>0;
  add('G04_HOSTILE_100S',hostilePass?'PASS':'FAIL',
    hostilePass?[hostile.fixture_ref,hostile.receipt_ref]:[],
    hostilePass?null:'HOSTILE_DENOMINATOR_OR_FALSE_GREEN_FAIL');

  const review=input.independent_review||{};
  const independent=review.state==='PASS'
    && typeof review.reviewer_ref==='string' && review.reviewer_ref.length>0
    && review.reviewer_ref!==subject_ref
    && typeof review.evidence_ref==='string' && review.evidence_ref.length>0;
  add('G05_INDEPENDENT_REVIEW',independent?'PASS':'FAIL',
    independent?[review.evidence_ref]:[],
    independent?null:'INDEPENDENT_REVIEW_REQUIRED');

  const econ=input.owner_economy||{};
  const restatement=Number.isInteger(econ.owner_restatement_count)?econ.owner_restatement_count:-1;
  const routing=Number.isInteger(econ.owner_manual_routing_count)?econ.owner_manual_routing_count:-1;
  const talkOnly=Number.isInteger(econ.talk_only_steps)?econ.talk_only_steps:-1;
  const econPass=restatement===0 && routing===0 && talkOnly===0
    && typeof econ.evidence_ref==='string' && econ.evidence_ref.length>0;
  add('G06_OWNER_COG_BORING',econPass?'PASS':'FAIL',
    econPass?[econ.evidence_ref]:[],
    econPass?null:'OWNER_RESTATEMENT_MANUAL_ROUTING_OR_TALK_ONLY_NONZERO');

  const capability=input.capability||{};
  const capPass=capability.current===true && capability.ack_eligible===true
    && capability.economically_eligible===true && capability.effect_ceiling_compatible===true
    && typeof capability.evidence_ref==='string' && capability.evidence_ref.length>0;
  add('G07_CAPABILITY_AND_EFFECT_COMPATIBILITY',capPass?'PASS':'FAIL',
    capPass?[capability.evidence_ref]:[],
    capPass?null:'CAPABILITY_ACK_ECONOMY_OR_EFFECT_MISMATCH');

  const cycle=input.return_cycle||{};
  for(const id of RETURN_CELLS){
    const row=cycle[id];
    add(`G08_${id}`,evidencePass(row)?'PASS':'FAIL',row?.evidence_refs||[],evidencePass(row)?null:`${id}_NOT_PROVEN`);
  }

  if(target.meta_wake_required){
    const wake=input.meta_wake||{};
    const kindOk=META_WAKE_KINDS.has(wake.kind);
    const independentReturns=Number.isInteger(wake.independent_return_count)?wake.independent_return_count:0;
    const countOk=wake.kind==='OWNER_EXPLICIT_UNIVERSALIZATION' || independentReturns>=2;
    const evidenceOk=Array.isArray(wake.evidence_refs)&&wake.evidence_refs.length>0;
    const metaPass=kindOk&&countOk&&evidenceOk;
    add('G09_META_WAKE',metaPass?'PASS':'FAIL',metaPass?wake.evidence_refs:[],metaPass?null:'META_WAKE_NOT_QUALIFIED');
  } else {
    add('G09_META_WAKE','N_A_WITH_EVIDENCE',['role:'+target.role], 'NOT_REQUIRED_FOR_TARGET_ROLE');
  }

  const gamify=input.gamify||{};
  const gamifyEvidence=typeof gamify.receipt_ref==='string'&&gamify.receipt_ref.length>0
    ? [gamify.receipt_ref] : [];
  add('G10_GAMIFY_TELEMETRY',gamifyEvidence.length?'PASS':'N_A_WITH_EVIDENCE',
    gamifyEvidence.length?gamifyEvidence:['gamify:optional'],
    gamifyEvidence.length?null:'OPTIONAL_MOTIVATION_NOT_QUALIFICATION');

  const fail=cells.filter(x=>x.state==='FAIL');
  const accounting100=cells.every(x=>['PASS','FAIL','N_A_WITH_EVIDENCE'].includes(x.state));
  const graduated=accounting100 && fail.length===0;

  return Object.freeze(JSON.parse(JSON.stringify({
    schema:'xiio.sdk.progress-gated-role-graduation/v1',
    subject_ref,
    source_generation,
    current_role,
    target_role:target.role,
    progress_gate:target.progress_gate,
    role_ordinal:target.ordinal,
    required_profiles:[...target.required_profiles],
    hostile_denominator_minimum:target.hostile_denominator_minimum,
    cells,
    denominator:cells.length,
    pass:cells.filter(x=>x.state==='PASS').length,
    fail:fail.length,
    n_a_with_evidence:cells.filter(x=>x.state==='N_A_WITH_EVIDENCE').length,
    accounting_100:accounting100,
    graduated,
    graduation_receipt_state:graduated?'EARNED_CURRENT_GENERATION':'NOT_EARNED',
    selectable_role:graduated?target.role:current_role,
    next_role:graduated?(PROGRESS_GATED_ROLES.find(x=>x.previous_role===target.role)?.role||null):target.role,
    first_red:fail[0]||null,
    gamify_may_motivate:true,
    gamify_may_graduate:false,
    authority_granted:false,
    provider_effect:false,
    rank_promotion_authority:false,
    hard:[
      'PROGRESS_GATED_ROLE!=GAMIFY_LEVEL',
      'GAMIFY_BONUS!=GRADUATION',
      'ROLE_SKIP!=GRADUATION',
      'CURRENT_BASELINES_REQUIRED_EACH_ATTEMPT',
      'PROFILE_PASS_FROM_OLD_GENERATION!=CURRENT_GRADUATION',
      'HOSTILE_DENOMINATOR_LT_100!=GRADUATION',
      'FALSE_GREEN_GT_0!=GRADUATION',
      'SELF_REVIEW!=INDEPENDENT_REVIEW',
      'OWNER_RESTATEMENT_COUNT_GT_0!=BORING_GRADUATION',
      'OWNER_MANUAL_ROUTING_COUNT_GT_0!=BORING_GRADUATION',
      'TALK_ONLY_STEPS_GT_0!=BORING_GRADUATION',
      'RESULT!=RETURN!=APPLY_RETURN!=READBACK!=REAP',
      'META_ARCHITECT_REQUIRES_META_WAKE',
      'GRADUATION_RECEIPT!=EFFECT_AUTHORITY',
      'GRADUATION_RECEIPT!=PROVIDER_AUTHORITY',
    ],
  })));
}

export function progressGatedRoleCatalog(){
  return Object.freeze(JSON.parse(JSON.stringify({
    schema:'xiio.sdk.progress-gated-role-catalog/v1',
    roles:PROGRESS_GATED_ROLES,
    policy:'LOWEST_COST_QUALIFIED_ROLE_FIRST; next role selectable only after current-generation graduation receipt.',
    authority_granted:false,
    provider_effect:false,
  })));
}
