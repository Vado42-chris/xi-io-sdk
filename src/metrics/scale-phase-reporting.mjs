export const ROTFL_SCALE_PHASE_REPORTING_CONTRACT_REF =
  'Vado42-chris/xi-io.net:standards/punchcards/rotfl-scale-phase-reporting.v1.json';

export const ROTFL_SCALES=Object.freeze(['1s','10s','100s','1000s','10000s','100000s','1000000s']);
export const ROTFL_PHASES=Object.freeze(['PLAN','EXECUTE','RETURN']);
export const ROTFL_QUALIFICATIONS=Object.freeze(['BRONZE','SILVER','GOLD','PLATINUM']);
export const ROTFL_READINESS=Object.freeze(['PASS','FAIL','WAIT','UNKNOWN','N_A_WITH_EVIDENCE']);
export const ROTFL_PHASE_DIRECTIONS=Object.freeze({PLAN:'10_TO_1',EXECUTE:'1_TO_10',RETURN:'10_TO_1'});

function clone(v){return JSON.parse(JSON.stringify(v));}

export function validateScalePhaseTuple(input={}){
  const errors=[];
  if(!ROTFL_SCALES.includes(input.scale)) errors.push('SCALE_INVALID');
  if(!ROTFL_PHASES.includes(input.phase)) errors.push('PHASE_INVALID');
  if(ROTFL_PHASE_DIRECTIONS[input.phase]!==input.direction) errors.push('DIRECTION_PHASE_MISMATCH');
  if(!ROTFL_QUALIFICATIONS.includes(input.qualification)) errors.push('QUALIFICATION_INVALID');
  if(!ROTFL_READINESS.includes(input.readiness)) errors.push('READINESS_INVALID');
  if(typeof input.currentness!=='string'||!input.currentness) errors.push('CURRENTNESS_REQUIRED');
  if(input.effect_ceiling===undefined) errors.push('EFFECT_CEILING_REQUIRED');
  if(input.reporting_mutates_state===true) errors.push('REPORTING_MUTATES_STATE');
  if(input.scale_inferred_from_count===true) errors.push('COUNT_USED_AS_SCALE');

  if(input.scale!=='1s'){
    if(!Array.isArray(input.exact_child_refs)||input.exact_child_refs.length!==10) errors.push('TEN_CHILD_REFS_REQUIRED');
    if(!input.plan_receipt) errors.push('PLAN_RECEIPT_REQUIRED');
    if(!Array.isArray(input.execution_receipts)||input.execution_receipts.length!==10) errors.push('EXECUTION_RECEIPTS_REQUIRED');
    if(!input.return_receipt) errors.push('RETURN_RECEIPT_REQUIRED');
    if(!input.parent_recompute_receipt) errors.push('PARENT_RECOMPUTE_REQUIRED');
    if(input.silent_remainder!==0) errors.push('SILENT_REMAINDER_NONZERO');
  }
  if(input.qualification==='GOLD'&&input.readiness!=='PASS') errors.push('GOLD_WITHOUT_PASS');
  if(input.qualification==='PLATINUM'&&(input.readiness!=='PASS'||input.independent_replay!==true)) errors.push('PLATINUM_WITHOUT_INDEPENDENT_REPLAY');

  return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors)});
}

export function compileScalePhaseProjection(input={}){
  const validation=validateScalePhaseTuple(input);
  if(!validation.ok) return Object.freeze({ok:false,errors:validation.errors});
  const projection={
    contract_ref:ROTFL_SCALE_PHASE_REPORTING_CONTRACT_REF,
    scale:input.scale,
    phase:input.phase,
    direction:input.direction,
    qualification:input.qualification,
    readiness:input.readiness,
    currentness:input.currentness,
    effect_ceiling:input.effect_ceiling,
    first_red:input.first_red??null,
    next:input.next??null,
    parent_ref:input.parent_ref??null,
    exact_child_refs:Object.freeze([...(input.exact_child_refs??[])]),
    reporting_read_only:true,
  };
  return Object.freeze({ok:true,projection:Object.freeze(clone(projection))});
}


export const ROTFL_COMPOUND_APPROVE_CONTRACT_REF =
  'Vado42-chris/xi-io.net:standards/punchcards/rotfl-scale-phase-reporting.v1.json#compound_prove_approve_contract';

const WHOLE_NOTE_FIELDS=Object.freeze([
  'prove_receipt',
  'return_receipt',
  'apply_return_receipt',
  'whole_note_projection',
  'higher_user_visible_readback',
  'parent_recompute_receipt',
]);

function receiptPresent(value){
  return value===true || (typeof value==='string' && value.trim().length>0);
}

export function proveWholeNote(input={}){
  const missing=WHOLE_NOTE_FIELDS.filter((field)=>!receiptPresent(input[field]));
  const factor=missing.length===0?1:0;
  return Object.freeze({
    ref:input.ref??null,
    scale:input.scale??null,
    parent_ref:input.parent_ref??null,
    factor,
    proved:factor===1,
    missing:Object.freeze(missing),
    first_red:factor===1?null:`WHOLE_NOTE_NOT_PROVED — ${input.ref??'unknown'} owes ${missing.join(', ')}`,
    effect_authority:0,
  });
}

export function compileCompoundApprove({ref=null,scale=null,parent_ref=null,principals=[]}={}){
  const crew=principals.map((principal)=>{
    if(principal?.approves){
      const nested=principal.approves;
      const factor=nested.product===1?1:0;
      return Object.freeze({
        ref:principal.ref??nested.ref??null,
        nested:true,
        factor,
        missing:Object.freeze([...(nested.missing??[])]),
        first_red:factor?null:(nested.first_red??'SUB_CREW_NOT_PROVED'),
      });
    }
    return proveWholeNote(principal);
  });
  const product=crew.reduce((acc,row)=>acc*row.factor,crew.length?1:0);
  const missing=crew.flatMap((row)=>(row.missing??[]).map((m)=>`${row.ref}:${m}`));
  return Object.freeze({
    contract_ref:ROTFL_COMPOUND_APPROVE_CONTRACT_REF,
    ref,
    scale,
    parent_ref,
    principals:crew.length,
    equation:`${crew.map((row)=>row.factor).join(' × ')} = ${product}`,
    product,
    state:product===1?'APPROVED_PROOF':'NOT_APPROVED_PROOF',
    missing:Object.freeze(missing),
    crew:Object.freeze(crew),
    first_red:product===1?null:(crew.find((row)=>row.first_red)?.first_red??'NOTHING_TO_APPROVE'),
    whole_note_user_visibility_required:true,
    effect_authority:0,
    authorization_granted:false,
  });
}

export const hard=Object.freeze([
  'SCALE!=COUNT','SCALE!=PHASE','SCALE!=QUALIFICATION','SCALE!=READINESS',
  'REPORT!=PHASE','REPORTING_IS_READ_ONLY_PROJECTION','UNKNOWN!=FALSE',
  'OBSERVED!=READY','UNAVAILABLE!=FALSE','NO_SKIPPED_SCALE',
  'PROVE!=APPROVE','APPROVE!=AUTHORIZE','NO_INVISIBLE_APPROVAL','WHOLE_NOTE_VISIBLE_BEFORE_PARENT_APPROVE'
]);
