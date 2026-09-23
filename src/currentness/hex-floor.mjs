export const HEX_FLOOR_SCHEMA='xiio.hex.global-floor-projection/v1';

function text(v){return typeof v==='string'&&v.trim()?v.trim():null;}

export function bindHexFloorCurrentness(projection,{subject_ref=null,subject_generation=null}={}){
  if(!projection) return {
    state:'UNVERIFIED',
    projection_ref:null,
    blocker:'HEX_FLOOR_NOT_SUPPLIED',
    missing_punchcards:[],
  };
  if(typeof projection!=='object'||Array.isArray(projection)||projection.schema!==HEX_FLOOR_SCHEMA){
    return {state:'UNVERIFIED',projection_ref:null,blocker:'HEX_FLOOR_SCHEMA_MISMATCH',missing_punchcards:[]};
  }
  if(projection.effect_authority!==false||projection.release_authority!==false||projection.billing_authority!==false||projection.live_authority!==false){
    return {state:'UNVERIFIED',projection_ref:text(projection.projection_ref),blocker:'HEX_FLOOR_AUTHORITY_INFLATION',missing_punchcards:[]};
  }
  const ref=text(projection.projection_ref);
  if(!ref) return {state:'UNVERIFIED',projection_ref:null,blocker:'HEX_FLOOR_REF_REQUIRED',missing_punchcards:[]};
  const subjects=Array.isArray(projection.subjects)?projection.subjects:[];
  let subject=null;
  if(subject_ref){
    const matches=subjects.filter((x)=>x?.product_ref===subject_ref);
    if(!matches.length){
      return {state:'STALE',projection_ref:ref,blocker:'HEX_FLOOR_SUBJECT_MISSING',missing_punchcards:[]};
    }
    subject=subject_generation
      ? matches.find((x)=>x?.product_generation===subject_generation)||null
      : matches[0];
    if(subject_generation&&!subject){
      return {state:'STALE',projection_ref:ref,blocker:'HEX_FLOOR_GENERATION_MISMATCH',missing_punchcards:matches.flatMap((x)=>x?.missing_punchcards||[])};
    }
  }
  const state=subject?.source_currentness || projection.source_currentness;
  const missing=subject
    ? (Array.isArray(subject.missing_punchcards)?subject.missing_punchcards:[])
    : (Array.isArray(projection.missing_punchcards)?projection.missing_punchcards:[]);
  if(!['HEX_QUALIFIED_CURRENT','HEX_PARTIAL_CURRENTNESS'].includes(state)){
    return {state:'UNVERIFIED',projection_ref:ref,blocker:'HEX_FLOOR_CURRENTNESS_INVALID',missing_punchcards:missing};
  }
  return {
    state,
    projection_ref:ref,
    blocker:state==='HEX_QUALIFIED_CURRENT'?null:'HEX_FLOOR_OPEN_CELLS',
    missing_punchcards:missing,
  };
}
