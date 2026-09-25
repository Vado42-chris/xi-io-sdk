import { expandFlatpackArtifact } from '../flatpack/executable-packet.mjs';
import { compileProjectionGyroscope } from '../orchestration/gyroscope.mjs';

export const SELF_REVIEW_ACK_SCHEMA='xiio.sdk.self-review-ack-projection/v1';

export const SELF_REVIEW_HARD=Object.freeze([
  'SELF_REVIEW != SELF_VERIFY',
  'CANONICAL_FLATPACK != CURRENT_PROJECTION',
  'PROJECTION != SOURCE_TRUTH',
  'OPPOSITE_PROJECTION != INDEPENDENT_OBSERVER',
  'DECLARED_PASS != OBSERVED_PASS',
  'GYROSCOPE_SPEED != CLOSURE',
  'RECURSION_REUSES_CARRIER_NOT_NEW_FILE_TYPE',
  'NEXT_GENERATION_REQUIRES_RESULT_RETURN_APPLY_READBACK',
  'DRIFT_CANNOT_AVERAGE_OUT',
  'SILENT_REMAINDER=0',
]);

const text=(v)=>String(v??'').trim();
const opposite=d=>String(d).toUpperCase()==='FORWARD'?'REVERSE':'FORWARD';

function qualifierWork(stage1){
  const expansion=expandFlatpackArtifact(stage1);
  return expansion.stage1.canonical_packet.qualifiers.map((q,index)=>({
    work_ref:`qualifier:${q.id}`,
    qualifier_id:q.id,
    state:q.state==='FAIL'?'BLOCKED':'READY',
    priority:q.state==='FAIL'?100:q.state==='TRUE_WAIT'?90:q.state==='UNKNOWN'?80:10-index,
    blocked_by:q.state==='FAIL'?['DECLARED_FAIL_REQUIRES_REPAIR_BEFORE_PROMOTION']:[],
    first_red:q.state==='FAIL'?q.id:null,
    declared_state:q.state,
    evidence_ref:q.evidence_ref||null,
    return_target:q.return_target||null,
  }));
}

export function compileSelfReviewAckProjection({
  stage1,
  gear=1,
  axis='DIRECTION',
  direction='FORWARD',
  observer_ref,
  producer_ref='self:current-projection',
  scale='MICRO',
}={}){
  const expansion=expandFlatpackArtifact(stage1);
  const packet=expansion.stage1.canonical_packet;
  const blast=expansion.stage1.blast_radius;
  const observer=text(observer_ref);
  if(!observer) return {ok:false,code:'OBSERVER_REF_REQUIRED',hard:SELF_REVIEW_HARD};

  const gy=compileProjectionGyroscope({
    spine:{
      root_ref:`packet:${packet.packet_id}`,
      generation_ref:packet.generation,
      denominator_ref:`qualifier-denominator:${packet.qualifier_denominator}`,
      return_target_ref:blast.return_targets?.[0]||`return:${packet.packet_id}`,
      effect_ceiling:'NO_EFFECT',
      privacy_ceiling:'INHERIT_PACKET_POLICY',
      source_refs:[`flatpack:${packet.semantic_digest}`,`blast:${blast.semantic_digest}`],
    },
    gear,
    axis,
    direction,
    work_items:qualifierWork(stage1),
  });
  if(!gy.ok) return gy;

  const byRef=new Map(qualifierWork(stage1).map(x=>[x.work_ref,x]));
  const review_requests=gy.gyroscope.selected.map((row)=>{
    const src=byRef.get(row.work_ref);
    return {
      schema:'xiio.sdk.self-review-request/v1',
      packet_id:packet.packet_id,
      generation:packet.generation,
      semantic_digest:packet.semantic_digest,
      blast_radius_digest:blast.semantic_digest,
      qualifier_ref:row.work_ref,
      qualifier_id:src.qualifier_id,
      declared_state:src.declared_state,
      declared_evidence_ref:src.evidence_ref,
      producer_ref:text(producer_ref)||'self:current-projection',
      observer_ref:observer,
      scale,
      forward_projection:{axis:String(axis).toUpperCase(),direction:String(direction).toUpperCase()},
      counter_projection:{axis:String(axis).toUpperCase(),direction:opposite(direction)},
      required_return:['observed_state','evidence_ref','readback_ref','drift_state','first_red'],
      authority_granted:false,
      provider_effect:false,
    };
  });

  return {
    ok:true,
    projection:{
      schema:SELF_REVIEW_ACK_SCHEMA,
      packet_id:packet.packet_id,
      generation:packet.generation,
      semantic_digest:packet.semantic_digest,
      blast_radius_digest:blast.semantic_digest,
      carrier_schema:packet.schema,
      new_file_type_created:false,
      gyroscope:gy.gyroscope,
      review_requests,
      denominator:packet.qualifier_denominator,
      selected_denominator:review_requests.length,
      independent_observer_required:true,
      self_verified:false,
      effect_authority:0,
      hard:SELF_REVIEW_HARD,
    }
  };
}

export function applySelfReviewReturns(projection,returns=[]){
  if(projection?.schema!==SELF_REVIEW_ACK_SCHEMA) return {ok:false,code:'SELF_REVIEW_PROJECTION_REQUIRED',hard:SELF_REVIEW_HARD};
  if(!Array.isArray(returns)) return {ok:false,code:'RETURNS_ARRAY_REQUIRED',hard:SELF_REVIEW_HARD};
  const byId=new Map();
  for(const r of returns){
    if(text(r?.packet_id)!==projection.packet_id) return {ok:false,code:'RETURN_PACKET_MISMATCH',hard:SELF_REVIEW_HARD};
    if(text(r?.generation)!==projection.generation) return {ok:false,code:'RETURN_GENERATION_MISMATCH',hard:SELF_REVIEW_HARD};
    if(text(r?.semantic_digest)!==projection.semantic_digest) return {ok:false,code:'RETURN_SEMANTIC_DIGEST_MISMATCH',hard:SELF_REVIEW_HARD};
    if(text(r?.blast_radius_digest)!==projection.blast_radius_digest) return {ok:false,code:'RETURN_BLAST_RADIUS_MISMATCH',hard:SELF_REVIEW_HARD};
    const id=text(r?.qualifier_id);
    if(!id) return {ok:false,code:'RETURN_QUALIFIER_ID_REQUIRED',hard:SELF_REVIEW_HARD};
    if(byId.has(id)) return {ok:false,code:'RETURN_QUALIFIER_DUPLICATE',hard:SELF_REVIEW_HARD};
    byId.set(id,r);
  }

  const joined=projection.review_requests.map(req=>{
    const ret=byId.get(req.qualifier_id)||null;
    if(!ret) return {...req,review_state:'TRUE_WAIT',first_red:'INDEPENDENT_REVIEW_RETURN_MISSING'};
    if(text(ret.observer_ref)!==req.observer_ref) return {...req,review_state:'FAIL',first_red:'OBSERVER_REF_MISMATCH'};
    if(!text(ret.readback_ref)||!text(ret.evidence_ref)) return {...req,review_state:'TRUE_WAIT',first_red:'READBACK_AND_EVIDENCE_REQUIRED'};
    const observed=text(ret.observed_state).toUpperCase();
    const drift=text(ret.drift_state).toUpperCase();
    if(!['PASS','FAIL','TRUE_WAIT','UNKNOWN'].includes(observed)) return {...req,review_state:'FAIL',first_red:'OBSERVED_STATE_INVALID'};
    if(!['SAME','DRIFT','BLOCKED','UNKNOWN'].includes(drift)) return {...req,review_state:'FAIL',first_red:'DRIFT_STATE_INVALID'};
    return {
      ...req,
      review_state:drift==='DRIFT'||observed==='FAIL'?'FAIL':drift==='SAME'&&observed==='PASS'?'PASS':'TRUE_WAIT',
      observed_state:observed,
      drift_state:drift,
      evidence_ref:ret.evidence_ref,
      readback_ref:ret.readback_ref,
      first_red:text(ret.first_red)||null,
    };
  });

  const fail=joined.filter(x=>x.review_state==='FAIL');
  const wait=joined.filter(x=>x.review_state==='TRUE_WAIT');
  const pass=joined.filter(x=>x.review_state==='PASS');

  return {
    ok:true,
    result:{
      schema:'xiio.sdk.self-review-ack-result/v1',
      packet_id:projection.packet_id,
      generation:projection.generation,
      state:fail.length?'FAIL':wait.length?'TRUE_WAIT':pass.length===joined.length?'PASS':'TRUE_WAIT',
      denominator:joined.length,
      pass:pass.length,
      fail:fail.length,
      true_wait:wait.length,
      silent_remainder:0,
      rows:joined,
      recurse:{
        same_carrier:true,
        next_generation_allowed:fail.length===0&&wait.length===0,
        required_chain:['RESULT','RETURN','APPLY_RETURN','READBACK'],
      },
      self_verified:false,
      authority_granted:false,
      provider_effect:false,
      hard:SELF_REVIEW_HARD,
    }
  };
}
