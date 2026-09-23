#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  compileFlatpackPacket,
  projectFlatpackQualifiers,
  validateFlatpackPacketRoundtrip,
  reduceFlatpackArtifact,
  expandFlatpackArtifact,
  validateFlatpackReductionRoundtrip,
} from '../src/flatpack/executable-packet.mjs';

const packet=compileFlatpackPacket({
  packet_id:'flatpack:demo',
  generation:'g1',
  one:{subject_ref:'thing:1',payload:{answer:42}},
  two:{left_ref:'thing:1',right_ref:'target:2',relation:'RECIPROCAL'},
  qualifiers:[
    {id:'Q02_SOURCE',state:'PASS',bit:1,evidence_ref:'source:g1'},
    {id:'Q01_IDENTITY',state:'PASS',bit:1,evidence_ref:'identity:g1'},
    {id:'Q03_CURRENT',state:'TRUE_WAIT',bit:null,return_target:'hex:floor'},
    {id:'Q04_UNUSED',state:'N_A',bit:null},
  ],
});

assert.equal(packet.schema,'xiio.sdk.flatpack-packet/v0');
assert.equal(packet.qualifier_denominator,3);
assert.deepEqual(packet.qualifier_counts,{pass:2,fail:0,true_wait:1,unknown:0,n_a:1});
assert.equal(packet.state,'TRUE_WAIT');
assert.equal(packet.closure_100,false);
assert.equal(packet.first_red.id,'Q03_CURRENT');
assert.deepEqual(packet.qualifiers.map((x)=>x.id),['Q01_IDENTITY','Q02_SOURCE','Q03_CURRENT','Q04_UNUSED']);

const projection=projectFlatpackQualifiers(packet);
assert.equal(projection.packet_id,'flatpack:demo');
assert.equal(projection.state,'TRUE_WAIT');

const replay=validateFlatpackPacketRoundtrip(packet);
assert.equal(replay.pass,true);

const green=compileFlatpackPacket({
  packet_id:'flatpack:green',
  generation:'g1',
  one:{subject_ref:'a'},
  two:{left_ref:'a',right_ref:'b',relation:'PAIR'},
  qualifiers:[
    {id:'Q1',state:'PASS',bit:1},
    {id:'Q2',state:'PASS',bit:1},
  ],
});
assert.equal(green.state,'PASS');
assert.equal(green.closure_100,true);

const red=compileFlatpackPacket({
  packet_id:'flatpack:red',
  generation:'g1',
  one:{subject_ref:'a'},
  two:{left_ref:'a',right_ref:'b',relation:'PAIR'},
  qualifiers:[
    {id:'Q1',state:'PASS',bit:1},
    {id:'Q2',state:'FAIL',bit:0},
  ],
});
assert.equal(red.state,'FAIL');
assert.equal(red.first_red.id,'Q2');

assert.throws(()=>compileFlatpackPacket({
  packet_id:'bad',
  generation:'g1',
  one:{},
  two:{},
  qualifiers:[{id:'Q',state:'PASS',bit:0}],
}),/PASS_REQUIRES_BIT_1/);

assert.throws(()=>compileFlatpackPacket({
  packet_id:'bad',
  generation:'g1',
  one:{},
  two:{},
  qualifiers:[{id:'Q',state:'UNKNOWN',bit:1}],
}),/UNRESOLVED_QUALIFIER_BIT_MUST_BE_NULL/);

assert.throws(()=>compileFlatpackPacket({
  packet_id:'bad',
  generation:'g1',
  one:{},
  two:{},
  qualifiers:[
    {id:'Q',state:'PASS',bit:1},
    {id:'Q',state:'PASS',bit:1},
  ],
}),/QUALIFIER_ID_DUPLICATE/);


// FINAL LESSON BACKBEAT:
// 1) preserve the tiny seed canary,
// 2) follow it with a massive detonator,
// 3) final triage proves neither half nor the blast radius was forgotten.
const seedCanary=compileFlatpackPacket({
  packet_id:'flatpack:seed-canary',
  generation:'g-seed',
  one:{subject_ref:'seed:small'},
  two:{left_ref:'seed:small',right_ref:'kernel:packet',relation:'CANARY'},
  qualifiers:[
    {id:'Q_SEED_IDENTITY',state:'PASS',bit:1,evidence_ref:'seed:identity'},
    {id:'Q_SEED_RELATION',state:'PASS',bit:1,evidence_ref:'seed:relation'},
  ],
});
assert.equal(seedCanary.closure_100,true);

const massiveDetonator=compileFlatpackPacket({
  packet_id:'flatpack:massive-detonator',
  generation:'g-detonator',
  one:{subject_ref:'detonator:100',blast_radius:100},
  two:{left_ref:'detonator:100',right_ref:'affected:*',relation:'BLAST_RADIUS'},
  qualifiers:Array.from({length:100},(_,i)=>({
    id:'D'+String(i+1).padStart(3,'0'),
    state:'PASS',
    bit:1,
    evidence_ref:'detonation:'+String(i+1).padStart(3,'0'),
  })),
});
assert.equal(massiveDetonator.qualifier_denominator,100);
assert.equal(massiveDetonator.qualifier_counts.pass,100);
assert.equal(massiveDetonator.closure_100,true);

const finalTriage=compileFlatpackPacket({
  packet_id:'flatpack:final-triage',
  generation:'g-triage',
  one:{
    seed_digest:seedCanary.semantic_digest,
    detonator_digest:massiveDetonator.semantic_digest,
    detonator_denominator:massiveDetonator.qualifier_denominator,
  },
  two:{
    left_ref:seedCanary.packet_id,
    right_ref:massiveDetonator.packet_id,
    relation:'SEED_PLUS_DETONATOR_BACKBEAT',
  },
  qualifiers:[
    {id:'T01_SEED_PRESERVED',state:'PASS',bit:1,evidence_ref:seedCanary.semantic_digest},
    {id:'T02_DETONATOR_PRESERVED',state:'PASS',bit:1,evidence_ref:massiveDetonator.semantic_digest},
    {id:'T03_BLAST_RADIUS_PRESERVED',state:'PASS',bit:1,evidence_ref:'denominator:100'},
  ],
});
assert.equal(finalTriage.state,'PASS');
assert.equal(finalTriage.closure_100,true);
assert.equal(finalTriage.one.detonator_denominator,100);
assert.equal(validateFlatpackPacketRoundtrip(finalTriage).pass,true);



const levelWalk=compileFlatpackPacket({
  packet_id:'flatpack:level-walk',
  generation:'g1',
  one:{
    current_coordinate:{
      target_ref:'leaf:search-bins',
      axis_z_scale:'10S',
      step_depth:2
    },
    local_state:'BLAST_RADIUS_AT_RISK'
  },
  two:{
    relation:'X_UP_PARENT_VIEW',
    left_ref:'leaf:search-bins',
    right_ref:'parent:flatplane',
    projection:'LOOK_DOWN_FROM_PARENT'
  },
  qualifiers:[
    {id:'Q_BURN_MAP_VISIBLE',state:'PASS',bit:1,evidence_ref:'parent:burn-map'},
    {id:'Q_COLD_MAP_VISIBLE',state:'PASS',bit:1,evidence_ref:'parent:cold-map'},
    {id:'Q_LOCAL_BLAST_RADIUS_CURRENT',state:'UNKNOWN',bit:null,return_target:'parent:flatplane'},
    {id:'Q_PARENT_TOPOLOGY_CURRENT',state:'PASS',bit:1,evidence_ref:'parent:g1'},
  ],
});
assert.equal(levelWalk.two.relation,'X_UP_PARENT_VIEW');
assert.equal(levelWalk.state,'UNKNOWN');
assert.equal(levelWalk.first_red.id,'Q_LOCAL_BLAST_RADIUS_CURRENT');
assert.equal(levelWalk.qualifier_denominator,4);
assert.equal(levelWalk.one.current_coordinate.step_depth,2);

const reduction=reduceFlatpackArtifact({
  packet_id:'flatpack:blast',
  generation:'g2',
  one:{subject_ref:'source:1'},
  two:{left_ref:'source:1',right_ref:'target:2',relation:'RECIPROCAL'},
  blast_radius:{
    radius:10,
    coordinate_ref:'cube:0,0,0',
    affected_refs:['bins','search','hex'],
    return_targets:['studio:return'],
  },
  qualifiers:[
    {id:'Q1',state:'PASS',bit:1,return_target:'bins:return'},
    {id:'Q2',state:'TRUE_WAIT',bit:null,return_target:'search:return'},
    {id:'Q3',state:'N_A',bit:null},
  ],
});
assert.equal(reduction.reduction,'3->2->1');
assert.equal(reduction.stage3.stage,3);
assert.equal(reduction.stage2.stage,2);
assert.equal(reduction.stage1.stage,1);
assert.deepEqual(reduction.stage2.blast_radius,reduction.stage3.blast_radius);
assert.deepEqual(reduction.stage1.blast_radius,reduction.stage3.blast_radius);
assert.deepEqual(reduction.stage1.blast_radius.return_targets,['bins:return','search:return','studio:return']);
assert.deepEqual(reduction.stage1.blast_radius.affected_refs,['bins','hex','search']);
assert.equal(reduction.artifact_result.canonical_packet.packet_id,'flatpack:blast');
assert.equal(
  reduction.stage3.blast_radius.semantic_digest,
  reduction.stage2.blast_radius.semantic_digest
);
assert.equal(
  reduction.stage2.blast_radius.semantic_digest,
  reduction.stage1.blast_radius.semantic_digest
);

const expansion=expandFlatpackArtifact(reduction.stage1);
assert.equal(expansion.expansion,'1->2->3');
assert.deepEqual(expansion.stage2.blast_radius,reduction.stage2.blast_radius);
assert.deepEqual(expansion.stage3.blast_radius,reduction.stage3.blast_radius);
assert.deepEqual(expansion.stage3.parts,reduction.stage3.parts);
assert.deepEqual(expansion.stage2.qualifier_vector,reduction.stage2.qualifier_vector);

const reductionRoundtrip=validateFlatpackReductionRoundtrip({
  packet_id:'flatpack:blast',
  generation:'g2',
  one:{subject_ref:'source:1'},
  two:{left_ref:'source:1',right_ref:'target:2',relation:'RECIPROCAL'},
  blast_radius:{
    radius:10,
    coordinate_ref:'cube:0,0,0',
    affected_refs:['bins','search','hex'],
    return_targets:['studio:return'],
  },
  qualifiers:[
    {id:'Q1',state:'PASS',bit:1,evidence_ref:'e:q1',generation_ref:'g:q1',return_target:'bins:return'},
    {id:'Q2',state:'TRUE_WAIT',bit:null,evidence_ref:'e:q2',generation_ref:'g:q2',return_target:'search:return'},
    {id:'Q3',state:'N_A',bit:null},
  ],
});
assert.equal(reductionRoundtrip.state,'PASS');
assert.equal(reductionRoundtrip.same_blast_radius,true);
assert.equal(reductionRoundtrip.same_packet_topology,true);
assert.equal(reductionRoundtrip.external_state_reads,0);

console.log(JSON.stringify({
  status:'PASS',
  schema:'xiio.sdk.flatpack-packet/v0',
  carrier:'ONE+TWO+QUALIFIERS',
  binary_resolved:true,
  unresolved_typed:true,
  roundtrip:true,
  reduction_roundtrip:{
    state:reductionRoundtrip.state,
    reduction:reductionRoundtrip.reduction,
    expansion:reductionRoundtrip.expansion,
    blast_radius_digest:reductionRoundtrip.blast_radius_digest,
    external_state_reads:reductionRoundtrip.external_state_reads,
  },
  lesson_backbeat:{
    seed_canary:seedCanary.semantic_digest,
    massive_detonator:massiveDetonator.semantic_digest,
    final_triage:finalTriage.semantic_digest,
    detonator_denominator:massiveDetonator.qualifier_denominator,
  },
  effects:0,
}));
