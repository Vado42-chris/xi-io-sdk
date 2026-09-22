export const PROMPT_TAIL_STEPS=Object.freeze([
 'READ_CURRENT',
 'WALK_10_TO_1',
 'X_FRACTAL_GREEN_START',
 'REAP_INWARD',
 'USER_TEST_MIRROR',
 'SOW_OUTWARD',
 'X_FRACTAL_GREEN_END',
 'WALK_1_TO_10',
 'RESULT',
 'RETURN',
 'APPLY_RETURN',
 'READBACK',
 'REAP_FINAL',
 'NEXT_WAKE'
]);
const OUTCOMES=new Set(['PASS','WAIT','BLOCKED','N_A_WITH_EVIDENCE','UNKNOWN']);
const FACETS=new Set(['GOLDEN','SUBTERRANEAN']);
const MODES=new Set(['QUAL','QUANT']);
const DIRECTIONS=new Set(['HORIZONTAL','VERTICAL','X_UP','X_DOWN','TRIANGULATION_X']);
const PLANES=new Set(['XY','XZ','YZ']);
const ROLES=new Set(['EXECUTE_RESOLVE','DISCOVER_HOSTILE','UX_QUAL_QUANT']);
const MIRRORS=new Set(['USER_TO_AI','AI_TO_USER']);
const BLAST=new Set(['CONTAINED','STEW_OVERFLOW']);
const text=(v,k)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(k+'_REQUIRED');return v.trim();};
const list=(v,k)=>{if(!Array.isArray(v))throw new TypeError(k+'_ARRAY_REQUIRED');return v.map(String).filter(Boolean);};

export function compileUniversalPromptTail(input={}){
 const current_ref=text(input.current_ref,'current_ref');
 const task_ref=text(input.task_ref,'task_ref');
 const required_skills=list(input.required_skills||[],'required_skills');
 const outcome=String(input.task_outcome?.state||'UNKNOWN').toUpperCase();
 if(!OUTCOMES.has(outcome))throw new TypeError('task_outcome_STATE_INVALID');
 const outcome_reason=text(input.task_outcome?.reason||outcome,'task_outcome_reason');

 const axes={
  facet:String(input.axes?.facet||'GOLDEN').toUpperCase(),
  mode:String(input.axes?.mode||'QUAL').toUpperCase(),
  direction:String(input.axes?.direction||'HORIZONTAL').toUpperCase(),
  render_plane:String(input.axes?.render_plane||'XY').toUpperCase(),
  trinity_role:String(input.axes?.trinity_role||'UX_QUAL_QUANT').toUpperCase(),
  mirror_direction:String(input.axes?.mirror_direction||'USER_TO_AI').toUpperCase(),
  blast_radius_state:String(input.axes?.blast_radius_state||'CONTAINED').toUpperCase()
 };
 if(!FACETS.has(axes.facet)||!MODES.has(axes.mode)||!DIRECTIONS.has(axes.direction)||!PLANES.has(axes.render_plane)
  ||!ROLES.has(axes.trinity_role)||!MIRRORS.has(axes.mirror_direction)||!BLAST.has(axes.blast_radius_state)){
   throw new TypeError('PROMPT_TAIL_AXIS_INVALID');
 }

 const supplied=new Set(list(input.steps||PROMPT_TAIL_STEPS,'steps'));
 const missing=PROMPT_TAIL_STEPS.filter(s=>!supplied.has(s));
 const xStart=input.x_green_start!==false;
 const xEnd=input.x_green_end!==false;
 const mirror={
  user_occurrence_ref:text(input.mirror?.user_occurrence_ref,'user_occurrence_ref'),
  system_response_ref:text(input.mirror?.system_response_ref,'system_response_ref'),
  mirror_delta_ref:text(input.mirror?.mirror_delta_ref,'mirror_delta_ref')
 };
 const rope={
  start_state:String(input.rope?.start_state||'X_FRACTAL_GREEN'),
  first_half:String(input.rope?.first_half||'REAP_INWARD'),
  seam:String(input.rope?.seam||'USER_TEST_MIRROR'),
  second_half:String(input.rope?.second_half||'SOW_OUTWARD'),
  end_state:String(input.rope?.end_state||'X_FRACTAL_GREEN')
 };
 const ropeClosed=
  rope.start_state==='X_FRACTAL_GREEN' &&
  rope.first_half==='REAP_INWARD' &&
  rope.seam==='USER_TEST_MIRROR' &&
  rope.second_half==='SOW_OUTWARD' &&
  rope.end_state==='X_FRACTAL_GREEN';

 const blockers=[
  ...missing.map(s=>'MISSING_STEP:'+s),
  ...(!xStart?['X_GREEN_START_LOST']:[]),
  ...(!xEnd?['X_GREEN_END_LOST']:[]),
  ...(!ropeClosed?['ROPE_REAP_MIRROR_SOW_NOT_CLOSED']:[])
 ];
 const tail_valid=blockers.length===0;
 const task_complete=outcome==='PASS'||outcome==='N_A_WITH_EVIDENCE';
 const task_effect_authorized=input.task_outcome?.effect_authorized===true;
 const disposition=
  !tail_valid?'TAIL_INVALID':
  outcome==='PASS'?'RETURN_PASS_TO_NEXT':
  outcome==='N_A_WITH_EVIDENCE'?'RETURN_N_A_TO_NEXT':
  outcome==='WAIT'?'RETURN_TYPED_WAIT':
  outcome==='BLOCKED'?'RETURN_BLOCKED':
  'RETURN_UNKNOWN';

 return Object.freeze({
  schema:'xiio.sdk.universal-prompt-tail/v1',
  task_ref,current_ref,required_skills:Object.freeze(required_skills),axes:Object.freeze(axes),
  mirror:Object.freeze(mirror),rope:Object.freeze(rope),
  task_outcome:Object.freeze({state:outcome,reason:outcome_reason,effect_authorized:task_effect_authorized}),
  tail:Object.freeze({
   valid:tail_valid,
   steps:Object.freeze([...PROMPT_TAIL_STEPS]),
   missing:Object.freeze(missing),
   blockers:Object.freeze(blockers),
   disposition,
   x_green_start:xStart,
   x_green_end:xEnd,
   blast_radius_state:axes.blast_radius_state
  }),
  task_complete,
  completion_credit:task_complete?1:0,
  effect_authority_granted:false,
  hard:Object.freeze([
   'PROMPT_TAIL!=TASK_SPECIFIC_GATE',
   'TAIL_VALID!=TASK_PASS',
   'WAIT_BLOCKED_UNKNOWN_MUST_SURVIVE_TAIL',
   'N_A_WITH_EVIDENCE_MAY_CLOSE_WITHOUT_WORK',
   'X_GREEN=STRUCTURAL_CONTINUITY_NOT_PASS',
   'STEW_OVERFLOW!=TAIL_FAILURE',
   'REAP_MIRROR_SOW_ORDER_REQUIRED',
   'USER_OCCURRENCE+SYSTEM_RESPONSE+DELTA_REQUIRED',
   'PROMPT_TAIL!=EFFECT_AUTHORITY'
  ])
 });
}

export function universalPromptTailCatalog(){
 return Object.freeze({
  schema:'xiio.sdk.universal-prompt-tail-catalog/v1',
  steps:[...PROMPT_TAIL_STEPS],
  axes:{
   facets:[...FACETS],modes:[...MODES],directions:[...DIRECTIONS],planes:[...PLANES],
   trinity_roles:[...ROLES],mirror_directions:[...MIRRORS],blast_radius_states:[...BLAST]
  },
  rule:'Every task may terminate through the same mirror tail, but task-specific gates determine PASS/WAIT/BLOCKED/N_A independently.',
  authority_granted:false
 });
}
