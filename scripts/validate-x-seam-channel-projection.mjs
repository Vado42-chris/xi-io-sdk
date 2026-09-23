import assert from 'node:assert/strict';
import {expectedXSeamChannelId,compileXSeamChannelProjection,verifyXSeamChannelProjection} from '../src/projections/x-seam-channel.mjs';

const endpoint_uuids=[
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001'
];
const port_ref='x:10.000000000,10.000000000,10.000000000';
const channel={
  schema:'xiio.x-seam.derived-channel/v1',
  channel_id:expectedXSeamChannelId(endpoint_uuids,port_ref),
  endpoint_uuids,
  port_ref,
  mode:'WEBSOCKET',
  bidirectional:true,
  authority:'NONE',
  effect_authority:false
};

const out=compileXSeamChannelProjection({
  channel,
  endpoint_coordinate_refs:['topo:b','topo:a'],
  source_ref:'Vado42-chris/xi-io.net#1065',
  generation_ref:'46211fc9a94ac69ffce81eb6b24412796ff2fded',
  currentness_ref:'framework:x-seam:g1'
});
assert.equal(out.schema,'xiio.sdk.x-seam-channel-projection/v1');
assert.deepEqual(out.endpoint_uuids,[...endpoint_uuids].sort());
assert.deepEqual(out.endpoint_coordinate_refs,['topo:a','topo:b']);
assert.equal(out.message_schema,'xiio.sdk.internal-agent-message/v1');
assert.equal(out.ack_required,true);
assert.equal(out.geometry_owner,'Vado42-chris/xi-io.net#1065');
assert.equal(out.authority_granted,false);
assert.equal(verifyXSeamChannelProjection(out).state,'PASS');

assert.throws(()=>compileXSeamChannelProjection({
  channel:{...channel,channel_id:'sha256:bad'},
  endpoint_coordinate_refs:['topo:a','topo:b'],
  source_ref:'framework#1065',generation_ref:'g1',currentness_ref:'c1'
}),/CHANNEL_ID_MISMATCH/);

assert.throws(()=>compileXSeamChannelProjection({
  channel,
  endpoint_coordinate_refs:['topo:a'],
  source_ref:'framework#1065',generation_ref:'g1',currentness_ref:'c1'
}),/ENDPOINT_COORDINATE_REF_TWO_REQUIRED/);

assert.throws(()=>compileXSeamChannelProjection({
  channel:{...channel,mode:'SMTP'},
  endpoint_coordinate_refs:['topo:a','topo:b'],
  source_ref:'framework#1065',generation_ref:'g1',currentness_ref:'c1'
}),/CHANNEL_MODE_INVALID/);

assert.throws(()=>compileXSeamChannelProjection({
  channel:{...channel,authority:'EFFECT'},
  endpoint_coordinate_refs:['topo:a','topo:b'],
  source_ref:'framework#1065',generation_ref:'g1',currentness_ref:'c1'
}),/CHANNEL_AUTHORITY_INFLATION/);

assert.throws(()=>compileXSeamChannelProjection({
  channel,
  endpoint_coordinate_refs:['topo:a','topo:b'],
  source_ref:'framework#1065',generation_ref:'',currentness_ref:'c1'
}),/GENERATION_REF_REQUIRED/);

const stale={...out,currentness_ref:''};
assert.equal(verifyXSeamChannelProjection(stale).state,'FAIL');
assert(verifyXSeamChannelProjection(stale).failed.includes('CURRENTNESS'));

console.log(JSON.stringify({
  schema:'xiio.sdk.x-seam-channel-projection-check/v1',
  state:'PASS',
  positive:1,
  hostiles:5,
  geometry_recomputed:false,
  message_schema_reused:true,
  authority:false
},null,2));
