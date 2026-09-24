#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {executePneuma} from '../src/runtime/pneuma-frontdoor.mjs';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-pneuma-'));
const root=path.join(tmp,'state','xi-io');
fs.mkdirSync(path.join(root,'studio'),{recursive:true});
fs.mkdirSync(path.join(root,'hex'),{recursive:true});

function write(rel,value){
  const file=path.join(root,...rel);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
}
const packetVector={
  packet_id:'flatpack:test',
  generation:'g1',
  semantic_digest:'semantic:1',
  blast_radius_digest:'blast:1',
  affected_refs:['bins','hex','sam_law','studio'],
  return_targets:['return:sam_law','return:studio'],
  first_red:null
};
write(['studio','pneuma.current.json'],{
  schema:'xiio.studio.pneuma-recursion/v1',
  state:'PASS',
  recursion_ref:'pneuma:r1',
  packet_vector:packetVector,
  rotation_engine:{face_denominator:6,projection_denominator:24,reciprocal_projection_denominator:48}
});
write(['studio','lifecycle.current.json'],{
  schema:'xiio.studio.rotfl-lifecycle/v1',generation:'life:g1',state:'HOT_RUNNABLE'
});
write(['hex','floor.current.json'],{
  schema:'xiio.hex.global-floor-projection/v1',fleet_generation:'hex:g1',projection_ref:'hex:p1'
});
write(['studio','search-bins.current.json'],{
  schema:'xiio.studio.search-bins-readback/v1',state:'TRUE_WAIT'
});
write(['remote-desktop.current.json'],{
  schema:'xiio.studio.remote-desktop-current/v1',
  authentication:{state:'PASS'},
  device_registration:{state:'PASS'},
  live_device_session:{state:'FAIL_CURRENT'}
});
write(['studio','ward-adoption.current.json'],{
  schema:'xiio.ward.native-adoption-readback/v1',state:'TRUE_WAIT'
});

const hostile=await executePneuma({
  root:'local',
  aries:'root',
  bus:'ws://localhost:4390/aries/bus',
  exec_rotfl:false,
  state_root:root
});
assert.equal(hostile.state,'TRUE_WAIT');
assert.equal(hostile.claims.ct16_byte_custody_verified,false);
assert.equal(hostile.claims.ct17_byte_custody_verified,false);
assert.equal(hostile.claims.zero_unverified_stubs,false);
assert.equal(hostile.claims.rotfl_loop_closed,false);
assert.equal(hostile.claims.pneuma_pulse_active,false);
assert(hostile.first_red);

write(['studio','search-bins.current.json'],{
  schema:'xiio.studio.search-bins-readback/v1',
  state:'PASS',
  resource_ref:'bins:r1',
  version_ref:'bins:v1',
  sha256:'a'.repeat(64),
  ct16_verified:true,
  ct17_verified:true,
});
write(['studio','pneuma.current.json'],{
  schema:'xiio.studio.pneuma-recursion/v1',
  state:'PASS',
  recursion_ref:'pneuma:r1',
  packet_vector:packetVector,
  rotation_engine:{face_denominator:6,projection_denominator:24,reciprocal_projection_denominator:48},
  zero_unverified_stubs:true
});
write(['remote-desktop.current.json'],{
  schema:'xiio.studio.remote-desktop-current/v1',
  authentication:{state:'PASS'},
  device_registration:{state:'PASS'},
  live_device_session:{state:'PASS'}
});
write(['studio','ward-adoption.current.json'],{
  schema:'xiio.ward.native-adoption-readback/v1',state:'PASS'
});

const server=net.createServer(socket=>socket.end());
await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',err=>err?reject(err):resolve()));
const port=server.address().port;
const pulsePath=path.join(root,'studio','pneuma-pulse.current.json');

const pass=await executePneuma({
  root:'local',
  aries:'root',
  bus:`ws://127.0.0.1:${port}/aries/bus`,
  exec_rotfl:true,
  state_root:root,
  output_path:pulsePath,
  probe_timeout_ms:1000
});
assert.equal(pass.state,'PASS');
assert.equal(pass.claims.ct16_byte_custody_verified,true);
assert.equal(pass.claims.ct17_byte_custody_verified,true);
assert.equal(pass.claims.zero_unverified_stubs,true);
assert.equal(pass.claims.rotfl_loop_closed,true);
assert.equal(pass.claims.pneuma_pulse_active,true);
assert(fs.existsSync(pulsePath));

await new Promise(resolve=>server.close(resolve));

assert.throws(()=>executePneuma({root:'cloud',aries:'root',state_root:root}),/PNEUMA_ROOT_MUST_BE_LOCAL/);
await assert.rejects(()=>executePneuma({root:'local',aries:'root',bus:'ws://example.com:4390/aries/bus',state_root:root}),/BUS_MUST_BE_LOOPBACK/);

fs.rmSync(tmp,{recursive:true,force:true});
console.log(JSON.stringify({
  schema:'xiio.sdk.pneuma-frontdoor-check/v1',
  state:'PASS',
  hostile_false_claims_blocked:true,
  loopback_exec_pulse:true,
  exact_command_shape_supported:true,
  effect_authority:0
},null,2));
