export const HEX_FLOOR_SCHEMA='xiio.hex.floor-projection/v1';

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
  if(subject_ref&&projection.product_ref!==subject_ref){
    return {state:'STALE',projection_ref:ref,blocker:'HEX_FLOOR_SUBJECT_MISMATCH',missing_punchcards:projection.missing_punchcards||[]};
  }
  if(subject_generation&&projection.product_generation!==subject_generation){
    return {state:'STALE',projection_ref:ref,blocker:'HEX_FLOOR_GENERATION_MISMATCH',missing_punchcards:projection.missing_punchcards||[]};
  }
  const state=projection.source_currentness;
  if(!['HEX_QUALIFIED_CURRENT','HEX_PARTIAL_CURRENTNESS'].includes(state)){
    return {state:'UNVERIFIED',projection_ref:ref,blocker:'HEX_FLOOR_CURRENTNESS_INVALID',missing_punchcards:projection.missing_punchcards||[]};
  }
  return {
    state,
    projection_ref:ref,
    blocker:state==='HEX_QUALIFIED_CURRENT'?null:'HEX_FLOOR_OPEN_CELLS',
    missing_punchcards:Array.isArray(projection.missing_punchcards)?projection.missing_punchcards:[],
  };
}
