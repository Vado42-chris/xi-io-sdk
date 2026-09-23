const PASS_STATES=new Set(['PASS','N_A_WITH_EVIDENCE']);

export function reduceMultiplicativeFactors(factors=[]){
  if(!Array.isArray(factors)||factors.length===0) throw new Error('FACTORS_REQUIRED');
  let firstZero=null;
  const rows=factors.map((raw,index)=>{
    const id=String(raw?.id||`T${index+1}`);
    const observed=raw?.value===true?1:raw?.value===false?0:null;
    let state='WAIT';
    if(firstZero!==null){
      state='N_A_DOWNSTREAM';
    }else if(observed===1){
      state='PASS';
    }else if(observed===0){
      state='FAIL';
      firstZero=id;
    }
    return {id,index,observed,state,evidence_ref:raw?.evidence_ref||null};
  });
  const allObserved=factors.every(x=>typeof x?.value==='boolean');
  const product=firstZero?0:allObserved?1:null;
  return Object.freeze({
    schema:'xiio.multiplicative-transition-reducer/v1',
    denominator:factors.length,
    product,
    state:product===1?'PASS':firstZero?'BLOCKED':'WAIT',
    first_zero:firstZero,
    rows:Object.freeze(rows),
    hard:Object.freeze([
      'CHAIN_VALUE = PRODUCT_OF_TRANSITION_FACTORS',
      'ONE_ZERO_ANNIHILATES_CHAIN',
      'DOWNSTREAM_OF_FIRST_ZERO = N_A_DOWNSTREAM',
      'UNOBSERVED != ZERO',
    ]),
  });
}

export function compileTransitionProofMatrix({transitions=[],proof_planes=[],cells=[],proven_cell_ids=[]}={}){
  if(!Array.isArray(transitions)||transitions.length===0) throw new Error('TRANSITIONS_REQUIRED');
  if(!Array.isArray(proof_planes)||proof_planes.length===0) throw new Error('PROOF_PLANES_REQUIRED');
  const expected=[];
  for(const t of transitions) for(const p of proof_planes) expected.push(`${t}::${p}`);
  const map=new Map((Array.isArray(cells)?cells:[]).map(c=>[String(c.id),c]));
  const proven=new Set((Array.isArray(proven_cell_ids)?proven_cell_ids:[]).map(String));
  const rows=expected.map(id=>{
    const raw=map.get(id)||{};
    const state=proven.has(id)?'PASS':String(raw.state||'WAIT');
    return {id,state,evidence_ref:raw.evidence_ref||null,quotiented:proven.has(id)};
  });
  const active=rows.filter(r=>!r.quotiented&&!PASS_STATES.has(r.state));
  const falseGreen=rows.filter(r=>r.state==='PASS'&&!r.evidence_ref&&!r.quotiented);
  return Object.freeze({
    schema:'xiio.transition-proof-matrix/v1',
    transition_count:transitions.length,
    proof_plane_count:proof_planes.length,
    original_denominator:expected.length,
    proven_factor_count:proven.size,
    active_denominator:active.length,
    closed_count:rows.filter(r=>PASS_STATES.has(r.state)).length,
    false_green_count:falseGreen.length,
    state:active.length===0&&falseGreen.length===0?'PASS':'WAIT',
    cells:Object.freeze(rows),
    active_cells:Object.freeze(active),
    hard:Object.freeze([
      'N_TRANSITIONS × M_PROOF_PLANES = ORIGINAL_DENOMINATOR',
      'ALREADY_PROVEN_FACTORS_REMOVE_ACTIVE_COG_LOAD',
      'PASS_WITHOUT_EVIDENCE != CLOSED_UNLESS_PREPROVEN',
      'ACTIVE_DENOMINATOR = UNRESOLVED_NONQUOTIENTED_CELLS',
    ]),
  });
}
