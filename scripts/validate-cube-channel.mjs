import assert from 'node:assert/strict';
import {deriveCubeChannel,pointOnCubeX,evaluateChannelConservation} from '../src/geometry/cube-channel.mjs';

function cube(uuid,center,r,streaming=true,half=10){
  return {uuid,center,half_extent:half,blast_radius:r,blast_radius_ref:'token-budget:test',streaming};
}
function stack(r){
  const cubes=[];
  let i=0;
  for(const x of [0,20]) for(const y of [0,20]) for(const z of [0,20]){
    cubes.push(cube('cube-'+(++i),[x,y,z],r));
  }
  return cubes;
}
function count(r){
  const cubes=stack(r);
  let n=0;
  for(let i=0;i<cubes.length;i++) for(let j=i+1;j<cubes.length;j++){
    if(deriveCubeChannel(cubes[i],cubes[j]).state==='CHANNEL') n++;
  }
  return n;
}

assert.equal(count(9.999999),0);
assert.equal(count(10),12);
assert.equal(count(10*Math.SQRT2),24);
assert.equal(count(10*Math.sqrt(3)),28);

const a=cube('A',[0,0,0],10,true);
const b=cube('B',[20,0,0],10,true);
const ab=deriveCubeChannel(a,b);
const ba=deriveCubeChannel(b,a);
assert.equal(ab.state,'CHANNEL');
assert.equal(ab.channel_id,ba.channel_id);
assert.deepEqual(ab.port,ba.port);
assert.equal(ab.mode,'WEBSOCKET');
assert.equal(pointOnCubeX(a,ab.port),true);
assert.equal(pointOnCubeX(b,ab.port),true);

// Shared face center is NOT on either center-to-corner X.
assert.equal(pointOnCubeX(a,[10,0,0]),false);
assert.equal(pointOnCubeX(b,[10,0,0]),false);

// Circles overlap, but cubes/X do not meet: no channel.
const gapA=cube('gap-a',[0,0,0],10,true,5);
const gapB=cube('gap-b',[15,0,0],10,true,5);
const gap=deriveCubeChannel(gapA,gapB);
assert.equal(gap.state,'NO_CHANNEL');
assert.equal(gap.reason,'NO_SHARED_X_POINT');

// Transport mode degrades to API unless both sides stream.
const api=deriveCubeChannel(a,{...b,streaming:false});
assert.equal(api.mode,'API');

assert.equal(evaluateChannelConservation({sent:3,received:3,acknowledged:3}).state,'PASS');
assert.equal(evaluateChannelConservation({sent:3,received:2,acknowledged:2}).state,'FAIL');

console.log(JSON.stringify({
  schema:'xiio.sdk.cube-channel-check/v0',
  state:'PASS',
  known_answer_counts:{
    'r<10':0,
    'r=10':12,
    'r=10sqrt2':24,
    'r=10sqrt3':28
  },
  hostiles:{
    off_x_port_rejected:true,
    overlap_without_shared_x_rejected:true,
    leaked_egress_rejected:true
  },
  direction_invariant:true,
  authority:false
},null,2));
