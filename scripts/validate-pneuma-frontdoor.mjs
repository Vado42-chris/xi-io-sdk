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
  occurrence_count:10,
  affected_refs:['bins','hex','sam_law','studio'],
  return_targets:['return:sam_law','return:studio'],
  first_red:null
};
const projectionChain=[
  {projection_ref:'step:1',packet_generation:'g1',blast_radius_digest:'blast:1',source_occurrence_count:10,affected_refs:['bins','hex','sam_law','studio']},
  {projection_ref:'step:2',packet_generation:'g1',blast_radius_digest:'blast:1',source_occurrence_count:10,affected_refs:['bins','sam_law','studio']},
  {projection_ref:'step:3',packet_generation:'g1',blast_radius_digest:'blast:1',source_occurrence_count:10,affected_refs:['sam_law','studio']},
];
write(['studio','pneuma.current.json'],{
  schema:'xiio.studio.pneuma-recursion/v1',
  state:'PASS',
  recursion_ref:'pneuma:r1',
  packet_vector:packetVector,
  projection_chain:projectionChain,
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

const driftChain=projectionChain.map((row)=>({...row}));
driftChain[2].blast_radius_digest='blast:reconstructed';
write(['studio','pneuma.current.json'],{
  schema:'xiio.studio.pneuma-recursion/v1',
  state:'PASS',
  recursion_ref:'pneuma:r1',
  packet_vector:packetVector,
  projection_chain:driftChain,
  rotation_engine:{face_denominator:6,projection_denominator:24,reciprocal_projection_denominator:48}
});
const stepThreeDrift=await executePneuma({
  root:'local',
  aries:'root',
  bus:'ws://localhost:4390/aries/bus',
  exec_rotfl:false,
  state_root:root
});
assert.equal(stepThreeDrift.state,'FAIL');
assert.equal(stepThreeDrift.checks.find(x=>x.id==='BLAST_RADIUS_CONTINUITY').first_red,'BLAST_RADIUS_DIGEST_DRIFT');

const occurrenceDriftChain=projectionChain.map((row)=>({...row}));
occurrenceDriftChain[2].source_occurrence_count=1;
write(['studio','pneuma.current.json'],{
  schema:'xiio.studio.pneuma-recursion/v1',
  state:'PASS',
  recursion_ref:'pneuma:r1',
  packet_vector:packetVector,
  projection_chain:occurrenceDriftChain,
  rotation_engine:{face_denominator:6,projection_denominator:24,reciprocal_projection_denominator:48}
});
const occurrenceDrift=await executePneuma({
  root:'local',aries:'root',bus:'ws://localhost:4390/aries/bus',exec_rotfl:false,state_root:root
});
assert.equal(occurrenceDrift.state,'FAIL');
assert.equal(occurrenceDrift.checks.find(x=>x.id==='BLAST_RADIUS_CONTINUITY').first_red,'SOURCE_OCCURRENCE_COUNT_DRIFT');

write(['studio','pneuma.current.json'],{
  schema:'xiio.studio.pneuma-recursion/v1',
  state:'PASS',
  recursion_ref:'pneuma:r1',
  packet_vector:packetVector,
  projection_chain:projectionChain,
  rotation_engine:{face_denominator:6,projection_denominator:24,reciprocal_projection_denominator:48}
});

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
  projection_chain:projectionChain,
  rotation_engine:{face_denominator:6,projection_denominator:24,reciprocal_projection_denominator:48},
  zero_unverified_stubs:true
});
write(['hex','floor.current.json'],{
  schema:'xiio.hex.global-floor-projection/v1',
  fleet_generation:'hex:g1',
  projection_ref:'hex:p1',
  source_currentness:'HEX_QUALIFIED_CURRENT',
  missing_punchcards:[],
  open_cells_without_punchcards:[]
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
assert.equal(pass.state,'TRUE_WAIT');
assert.equal(pass.proof_scope,'SYNTHETIC_FIXTURE');
assert.equal(pass.source_checks_pass,true);
assert.equal(pass.claims.ct16_byte_custody_verified,true);
assert.equal(pass.claims.ct17_byte_custody_verified,true);
assert.equal(pass.claims.zero_unverified_stubs,true);
assert.equal(pass.claims.rotfl_loop_closed,false);
assert.equal(pass.claims.pneuma_pulse_active,false);
assert.equal(pass.first_red,'SYNTHETIC_STATE_ROOT_NOT_PHYSICAL_READBACK');
assert.equal(pass.source_occurrence_count,10);
assert.equal(pass.checks.find(x=>x.id==='BLAST_RADIUS_CONTINUITY').source_occurrence_count,10);
assert(fs.existsSync(pulsePath));
const pulseBytes=fs.readFileSync(pulsePath);
const pulseSha=await import('node:crypto').then(m=>m.default.createHash('sha256').update(pulseBytes).digest('hex'));
assert.equal(pass.pulse_sha256,pulseSha);
assert.equal(pass.pulse_bytes,pulseBytes.length);

await new Promise(resolve=>server.close(resolve));

await assert.rejects(()=>executePneuma({root:'cloud',aries:'root',state_root:root}),/PNEUMA_ROOT_MUST_BE_LOCAL/);
await assert.rejects(()=>executePneuma({root:'local',aries:'root',bus:'ws://example.com:4390/aries/bus',state_root:root}),/BUS_MUST_BE_LOOPBACK/);

fs.rmSync(tmp,{recursive:true,force:true});
console.log(JSON.stringify({
  schema:'xiio.sdk.pneuma-frontdoor-check/v1',
  state:'PASS',
  hostile_false_claims_blocked:true,
  exact_persisted_pulse_hash:true,
  step_three_blast_radius_drift_blocked:true,
  source_occurrence_count_drift_blocked:true,
  duplicate_occurrence_fixture_count:10,
  loopback_exec_pulse:true,
  synthetic_fixture_cannot_claim_physical_loop_closure:true,
  source_checks_can_pass_without_runtime_elevation:true,
  exact_command_shape_supported:true,
  effect_authority:0
},null,2));
