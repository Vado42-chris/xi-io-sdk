#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  compileFlatpackPacket,
  projectFlatpackQualifiers,
  validateFlatpackPacketRoundtrip,
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

console.log(JSON.stringify({
  status:'PASS',
  schema:'xiio.sdk.flatpack-packet/v0',
  carrier:'ONE+TWO+QUALIFIERS',
  binary_resolved:true,
  unresolved_typed:true,
  roundtrip:true,
  effects:0,
}));
