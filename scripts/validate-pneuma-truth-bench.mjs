#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {executePneuma} from '../src/runtime/pneuma-frontdoor.mjs';

const mk=()=>fs.mkdtempSync(path.join(os.tmpdir(),'xiio-pneuma-truth-bench-'));
const write=(root,rel,value)=>{const f=path.join(root,...rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(value,null,2)+'\n');};
const packet={packet_id:'flatpack:bench',generation:'g1',semantic_digest:'sem:1',blast_radius_digest:'blast:1',occurrence_count:3,affected_refs:['bins','hex','studio'],return_targets:['return:bins','return:hex','return:studio']};
const chain=[
 {projection_ref:'step:1',packet_generation:'g1',blast_radius_digest:'blast:1',source_occurrence_count:3,affected_refs:['bins','hex','studio']},
 {projection_ref:'step:2',packet_generation:'g1',blast_radius_digest:'blast:1',source_occurrence_count:3,affected_refs:['bins','studio']},
 {projection_ref:'step:3',packet_generation:'g1',blast_radius_digest:'blast:1',source_occurrence_count:3,affected_refs:['studio']}
];
function seed(root,{live='PASS',blast='blast:1',custody=true,ward='PASS',hex='HEX_QUALIFIED_CURRENT'}={}){
 const c=chain.map(x=>({...x})); c[2].blast_radius_digest=blast;
 write(root,['studio','pneuma.current.json'],{schema:'xiio.studio.pneuma-recursion/v1',state:'PASS',recursion_ref:'bench:r1',packet_vector:packet,projection_chain:c,rotation_engine:{face_denominator:6,projection_denominator:24,reciprocal_projection_denominator:48}});
 write(root,['studio','lifecycle.current.json'],{schema:'xiio.studio.rotfl-lifecycle/v1',generation:'life:g1',state:'HOT_RUNNABLE'});
 write(root,['hex','floor.current.json'],{schema:'xiio.hex.global-floor-projection/v1',fleet_generation:'hex:g1',projection_ref:'hex:p1',source_currentness:hex,missing_punchcards:[],open_cells_without_punchcards:[]});
 write(root,['studio','search-bins.current.json'],{schema:'xiio.studio.search-bins-readback/v1',state:'PASS',resource_ref:'bins:r1',version_ref:'bins:v1',sha256:'a'.repeat(64),ct16_verified:custody,ct17_verified:custody});
 write(root,['remote-desktop.current.json'],{schema:'xiio.studio.remote-desktop-current/v1',authentication:{state:'PASS'},device_registration:{state:'PASS'},live_device_session:{state:live}});
 write(root,['studio','ward-adoption.current.json'],{schema:'xiio.ward.native-adoption-readback/v1',state:ward});
}
const results=[];
async function candidate(id,opts,expect){
 const root=mk(); seed(root,opts);
 const server=net.createServer(s=>s.end()); await new Promise((r,j)=>server.listen(0,'127.0.0.1',e=>e?j(e):r()));
 const port=server.address().port;
 const out=await executePneuma({root:'local',aries:'root',bus:`ws://127.0.0.1:${port}/aries/bus`,exec_rotfl:true,state_root:root});
 await new Promise(r=>server.close(r)); fs.rmSync(root,{recursive:true,force:true});
 assert.equal(out.state,expect.state,id); if(expect.first_red) assert.equal(out.first_red,expect.first_red,id);
 results.push({id,state:out.state,first_red:out.first_red,proof_scope:out.proof_scope,false_green:out.state==='PASS'});
}
await candidate('CONTROL_SYNTHETIC_ALL_GREEN',{}, {state:'TRUE_WAIT',first_red:'SYNTHETIC_STATE_ROOT_NOT_PHYSICAL_READBACK'});
await candidate('CHAOS_STEP3_BLAST_DRIFT',{blast:'blast:drift'}, {state:'FAIL',first_red:'BLAST_RADIUS_DIGEST_DRIFT'});
await candidate('CHAOS_REMOTE_OFFLINE',{live:'FAIL_CURRENT'}, {state:'TRUE_WAIT',first_red:'REMOTE_LIVE_SESSION_NOT_PASS'});
const falseGreens=results.filter(x=>x.false_green).length;
assert.equal(falseGreens,0);
console.log(JSON.stringify({schema:'xiio.sdk.pneuma-three-point-truth-bench/v1',state:'PASS',candidate_count:results.length,false_green_count:falseGreens,candidates:results,hard:['SYNTHETIC_FIXTURE != PHYSICAL_READBACK','CONTROL + CHAOS + CURRENT_SOURCE_REQUIRED','FALSE_GREEN_COUNT_MUST_EQUAL_0']},null,2));
