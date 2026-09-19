export const FULLSTACK_CANARY_INPUT_SCHEMA='xiio.sdk.fullstack-continuity-canary-input/v1';
export const FULLSTACK_CANARY_SCHEMA='xiio.sdk.fullstack-continuity-canary/v1';
const DISP=new Set(['APPLICABLE','N_A_WITH_EVIDENCE','NO_EFFECT_WITH_EVIDENCE','UNKNOWN_BLOCKS_CLOSURE']);
const text=(v,n)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(n+' required');return v.trim();};
export function compileFullstackContinuityCanary(input){
 if(!input||input.schema!==FULLSTACK_CANARY_INPUT_SCHEMA)throw new TypeError('input schema mismatch');
 const occurrence_ref=text(input.occurrence_ref,'occurrence_ref');
 const classification=text(input.classification,'classification');
 if(!Array.isArray(input.registered_rows)||input.registered_rows.length===0)throw new TypeError('registered_rows required');
 const seen=new Set(); const rows=input.registered_rows.map(r=>{
  const project_ref=text(r.project_ref,'project_ref'); if(seen.has(project_ref))throw new TypeError('duplicate project_ref'); seen.add(project_ref);
  const disposition=text(r.disposition,'disposition'); if(!DISP.has(disposition))throw new TypeError('disposition invalid');
  const evidence_refs=Array.isArray(r.evidence_refs)?[...new Set(r.evidence_refs.map(x=>text(x,'evidence_ref')))]:[];
  const return_ref=r.return_ref==null?null:text(r.return_ref,'return_ref');
  const apply_return_ref=r.apply_return_ref==null?null:text(r.apply_return_ref,'apply_return_ref');
  const blockers=[];
  if(disposition==='UNKNOWN_BLOCKS_CLOSURE')blockers.push('UNKNOWN');
  if(disposition!=='UNKNOWN_BLOCKS_CLOSURE'&&evidence_refs.length===0)blockers.push('DISPOSITION_WITHOUT_EVIDENCE');
  if(disposition==='APPLICABLE'&&(!return_ref||!apply_return_ref))blockers.push('AFFECTED_RETURN_OPEN');
  return Object.freeze({project_ref,disposition,evidence_refs,return_ref,apply_return_ref,blockers:Object.freeze(blockers)});
 }).sort((a,b)=>a.project_ref.localeCompare(b.project_ref));
 const blockers=[];
 if(input.primitive_patched_bit!==1)blockers.push('PRIMITIVE_NOT_PATCHED');
 if(input.fresh_session_replay_bit!==1)blockers.push('FRESH_SESSION_REPLAY_OPEN');
 if(Number(input.owner_restatement_count)!==0)blockers.push('OWNER_RESTATEMENT_NONZERO');
 if(Number(input.silent_remainder_count)!==0)blockers.push('SILENT_REMAINDER_NONZERO');
 if(rows.some(r=>r.blockers.length))blockers.push('AFFECTED_ADOPTER_RETURN_OPEN');
 return Object.freeze({schema:FULLSTACK_CANARY_SCHEMA,occurrence_ref,classification,registered_denominator:rows.length,rows:Object.freeze(rows),blockers:Object.freeze(blockers),closure:blockers.length===0,authority_granted:false,provider_effect:false,hard:Object.freeze(['EVERY_USER_INGRESS=CANARY_OCCURRENCE','CANARY_WITHOUT_CONSUMPTION=FLATPLANE','COMMENT!=PRIMITIVE_PROMOTION','PRIMITIVE_PATCH_WITHOUT_AFFECTED_ADOPTION=FLATPLANE','OWNER_RESTATEMENT_REQUIRED!=PASS','FRACTAL_ERROR!=RESTART'])});
}
