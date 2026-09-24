#!/usr/bin/env node
import assert from 'node:assert/strict';
import { reduceFlatpackArtifact } from '../src/flatpack/executable-packet.mjs';
import { compileFlatpackContinuationPlan } from '../src/cadence/flatpack-continuation.mjs';

const stage1=reduceFlatpackArtifact({
  packet_id:'flatpack:three-loop-canary',
  generation:'g1',
  one:{current_coordinate:{target_ref:'leaf:search-bins',step_depth:2}},
  two:{left_ref:'leaf:search-bins',right_ref:'parent:flatplane',relation:'RECIPROCAL'},
  blast_radius:{
    coordinate_ref:'cube:parent',
    affected_refs:['search','bins','hex','studio'],
    return_targets:['search:return','bins:return','hex:return','studio:return'],
  },
  qualifiers:[
    {id:'Q_IDENTITY',state:'PASS',bit:1,evidence_ref:'packet:g1'},
    {id:'Q_RUNTIME',state:'TRUE_WAIT',bit:null,return_target:'aries:return'},
  ],
}).stage1;

const cadence={
  root_ref:'flatpack:three-loop-canary',
  worker_ref:'triage:flatpack',
  subject_generation:'g1',
  current_generation:'g1',
  phase_event:'POST_RESULT',
  pass_state:'TRUE_WAIT',
  backlog:[{id:'W1',state:'RUNNABLE',priority:1}],
  returns:[],
  residue:[],
  occurrences:[],
  worker_inbox:{ref:'inbox:triage',current:true,actionable_count:0},
  async_continuation_required:true,
  four_scale:{MICRO:'PASS',MESO:'PASS',MACRO:'PASS',META:'PASS'},
};

const loop1=compileFlatpackContinuationPlan({stage1,cadence});
const loop2=compileFlatpackContinuationPlan({stage1,cadence,previous_plan:loop1});
const loop3=compileFlatpackContinuationPlan({stage1,cadence,previous_plan:loop2});

assert.deepEqual([loop1.loop_index,loop2.loop_index,loop3.loop_index],[1,2,3]);
assert.equal(loop1.blast_radius_digest,loop2.blast_radius_digest);
assert.equal(loop2.blast_radius_digest,loop3.blast_radius_digest);
assert.deepEqual(loop1.affected_refs,loop3.affected_refs);
assert.deepEqual(loop1.return_targets,loop3.return_targets);
assert.equal(loop3.packet_generation,'g1');
assert.equal(loop3.qualifier_state.state,'TRUE_WAIT');
assert.equal(loop3.cadence_disposition,'CONTINUE_WORK');
assert(loop3.next_actions.includes('CONTINUE_NEXT_GOLDEN_WORK'));

assert.throws(()=>compileFlatpackContinuationPlan({
  stage1,
  cadence,
  previous_plan:{...loop2,blast_radius_digest:'drift'},
}),/PREVIOUS_BLAST_RADIUS_DIGEST_DRIFT/);

assert.throws(()=>compileFlatpackContinuationPlan({
  stage1,
  cadence,
  previous_plan:{...loop2,affected_refs:['search']},
}),/PREVIOUS_AFFECTED_SET_DRIFT/);

assert.throws(()=>compileFlatpackContinuationPlan({
  stage1,
  cadence,
  previous_plan:{...loop2,return_targets:['search:return']},
}),/PREVIOUS_RETURN_TARGET_DRIFT/);

console.log(JSON.stringify({
  status:'PASS',
  schema:'xiio.sdk.flatpack-continuation-plan/v1',
  loops_proven:3,
  blast_radius_preserved:true,
  affected_set_preserved:true,
  return_targets_preserved:true,
  qualifier_state_preserved:true,
  generation_preserved:true,
  effects:0,
}));
