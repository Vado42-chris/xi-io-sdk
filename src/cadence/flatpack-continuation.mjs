import crypto from 'node:crypto';
import { expandFlatpackArtifact } from '../flatpack/executable-packet.mjs';
import { compileContinuationCycle } from './continuation.mjs';

export const FLATPACK_CONTINUATION_PLAN_SCHEMA='xiio.sdk.flatpack-continuation-plan/v1';

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,stable(value[key])]));
  }
  return value;
}
function digest(value){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function refs(value){
  return Object.freeze([...new Set((Array.isArray(value)?value:[]).filter((v)=>typeof v==='string'&&v.trim()).map((v)=>v.trim()))].sort());
}
function sameRefs(a,b){
  const aa=refs(a);
  const bb=refs(b);
  return aa.length===bb.length&&aa.every((value,index)=>value===bb[index]);
}
function object(value,key){
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new TypeError(key+'_OBJECT_REQUIRED');
  return value;
}

export function compileFlatpackContinuationPlan(input={}){
  const stage1=object(input.stage1,'stage1');
  const expansion=expandFlatpackArtifact(stage1);
  const packet=expansion.stage1.canonical_packet;
  const blast=expansion.stage1.blast_radius;
  const cadence=compileContinuationCycle(object(input.cadence,'cadence'));

  const affected_refs=refs(blast.affected_refs);
  const return_targets=refs(blast.return_targets);
  if(!blast.semantic_digest) throw new TypeError('BLAST_RADIUS_DIGEST_REQUIRED');
  if(!affected_refs.length) throw new TypeError('AFFECTED_REFS_REQUIRED');
  if(!return_targets.length) throw new TypeError('RETURN_TARGETS_REQUIRED');

  const previous=input.previous_plan==null?null:object(input.previous_plan,'previous_plan');
  const loop_index=previous?Number(previous.loop_index)+1:1;
  if(!Number.isInteger(loop_index)||loop_index<1) throw new TypeError('LOOP_INDEX_INVALID');

  const previousSteps=previous?Number(previous.steps_since_hotpatch ?? previous.loop_index):0;
  if(!Number.isInteger(previousSteps)||previousSteps<0) throw new TypeError('PREVIOUS_STEPS_SINCE_HOTPATCH_INVALID');
  const hotpatchRequired=previousSteps>=3;
  const hotpatch=input.hotpatch_receipt==null?null:object(input.hotpatch_receipt,'hotpatch_receipt');
  if(hotpatchRequired){
    if(!hotpatch) throw new TypeError('THREE_STEP_HOTPATCH_REQUIRED');
    if(hotpatch.state!=='APPLIED') throw new TypeError('HOTPATCH_RECEIPT_NOT_APPLIED');
    if(hotpatch.applied_after_loop!==previous.loop_index) throw new TypeError('HOTPATCH_RECEIPT_LOOP_MISMATCH');
    if(hotpatch.packet_generation!==packet.generation) throw new TypeError('HOTPATCH_RECEIPT_GENERATION_DRIFT');
    if(hotpatch.blast_radius_digest!==blast.semantic_digest) throw new TypeError('HOTPATCH_RECEIPT_BLAST_RADIUS_DRIFT');
  }
  const steps_since_hotpatch=hotpatchRequired?1:previousSteps+1;

  if(previous){
    if(previous.schema!==FLATPACK_CONTINUATION_PLAN_SCHEMA) throw new TypeError('PREVIOUS_PLAN_SCHEMA_INVALID');
    if(previous.packet_id!==packet.packet_id) throw new TypeError('PREVIOUS_PACKET_ID_DRIFT');
    if(previous.packet_generation!==packet.generation) throw new TypeError('PREVIOUS_PACKET_GENERATION_DRIFT');
    if(previous.packet_semantic_digest!==packet.semantic_digest) throw new TypeError('PREVIOUS_PACKET_SEMANTIC_DIGEST_DRIFT');
    if(previous.blast_radius_digest!==blast.semantic_digest) throw new TypeError('PREVIOUS_BLAST_RADIUS_DIGEST_DRIFT');
    if(!sameRefs(previous.affected_refs,affected_refs)) throw new TypeError('PREVIOUS_AFFECTED_SET_DRIFT');
    if(!sameRefs(previous.return_targets,return_targets)) throw new TypeError('PREVIOUS_RETURN_TARGET_DRIFT');
  }

  const qualifier_state=Object.freeze({
    state:packet.state,
    closure_100:packet.closure_100,
    denominator:packet.qualifier_denominator,
    counts:packet.qualifier_counts,
    first_red:packet.first_red,
  });

  const core=stable({
    packet_id:packet.packet_id,
    packet_generation:packet.generation,
    packet_semantic_digest:packet.semantic_digest,
    blast_radius_digest:blast.semantic_digest,
    affected_refs,
    return_targets,
    qualifier_state,
    loop_index,
    steps_since_hotpatch,
    hotpatch_applied:Boolean(hotpatchRequired&&hotpatch),
    hotpatch_required_next:steps_since_hotpatch>=3,
    cadence_disposition:cadence.disposition,
    cadence_reason:cadence.reason,
    next_actions:cadence.next_actions,
  });

  return Object.freeze({
    schema:FLATPACK_CONTINUATION_PLAN_SCHEMA,
    ...core,
    plan_digest:digest(core),
    terminal:cadence.terminal,
    cadence,
    effect_authority:false,
    hard:Object.freeze([
      'CONTINUATION_PLAN != SECOND_TRUTH',
      'PLAN_DERIVES_FROM_CANONICAL_FLATPACK_PLUS_CADENCE',
      'EVERY_LOOP_CARRIES_ROOT_BLAST_RADIUS',
      'EVERY_LOOP_CARRIES_AFFECTED_SET',
      'EVERY_LOOP_CARRIES_RETURN_TARGETS',
      'EVERY_LOOP_CARRIES_PACKET_GENERATION',
      'EVERY_LOOP_CARRIES_QUALIFIER_STATE',
      'STEP_2 != PERMISSION_TO_FORGET_PARENT_RADIUS',
      'THREE_STEPS_WITHOUT_HOTPATCH = FAIL_CLOSED',
      'STEP_4_REQUIRES_APPLIED_HOTPATCH_AFTER_STEP_3',
      'HOTPATCH_MUST_BIND_PACKET_GENERATION_AND_BLAST_RADIUS',
      'LOOP_COUNT != BLAST_RADIUS',
      'REPORT != LOOP_EXIT',
    ]),
  });
}
