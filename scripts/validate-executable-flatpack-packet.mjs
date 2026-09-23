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

console.log(JSON.stringify({
  status:'PASS',
  schema:'xiio.sdk.flatpack-packet/v0',
  carrier:'ONE+TWO+QUALIFIERS',
  binary_resolved:true,
  unresolved_typed:true,
  roundtrip:true,
  effects:0,
}));
