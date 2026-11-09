#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-flatpack-cli-'));
const packetPath=path.join(tmp,'packet.json');
const reducedPath=path.join(tmp,'reduced.json');
const expandedPath=path.join(tmp,'expanded.json');

const packet={
  packet_id:'flatpack:cli-physical-frontdoor',
  generation:'g-cli-1',
  one:{subject_ref:'search:local-file',current_coordinate:{target_ref:'search:local-file',step_depth:2}},
  two:{left_ref:'search:local-file',right_ref:'bins:resource-version',relation:'RECIPROCAL'},
  blast_radius:{
    radius:10,
    coordinate_ref:'cube:cli',
    affected_refs:['search','bins','studio'],
    return_targets:['search:return','bins:return','studio:return']
  },
  qualifiers:[
    {id:'Q01_IDENTITY',state:'PASS',bit:1,evidence_ref:'cli:test'},
    {id:'Q02_SOURCE',state:'PASS',bit:1,evidence_ref:'cli:test'},
    {id:'Q03_RUNTIME',state:'TRUE_WAIT',bit:null,return_target:'aries:return'}
  ]
};
fs.writeFileSync(packetPath,JSON.stringify(packet,null,2));

function run(args,{outFile=null}={}){
  const result=spawnSync(process.execPath,['bin/xi.mjs',...args],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
  if(outFile){
    assert.equal(fs.existsSync(outFile),true,'expected CLI output file');
    return JSON.parse(fs.readFileSync(outFile,'utf8'));
  }
  assert.ok(result.stdout.trim(),'expected CLI stdout');
  return JSON.parse(result.stdout);
}

const missingBlastPath=path.join(tmp,'missing-blast.json');
fs.writeFileSync(missingBlastPath,JSON.stringify({
  packet_id:'flatpack:cli-missing-blast',
  generation:'g-cli-1',
  one:{current_coordinate:{target_ref:'leaf:search-bins',step_depth:2}},
  two:{left_ref:'leaf:search-bins',right_ref:'parent:flatplane',relation:'RECIPROCAL'},
  qualifiers:[{id:'Q1',state:'PASS',bit:1}],
}));
const missingBlast=spawnSync(process.execPath,['bin/xi.mjs','flatpack','reduce','--input',missingBlastPath],{encoding:'utf8'});
assert.notEqual(missingBlast.status,0);
assert.match(missingBlast.stderr,/invalid input or unsupported command/);

const compiled=run(['flatpack','compile','--input',packetPath]);
assert.equal(compiled.schema,'xiio.sdk.flatpack-packet/v0');
assert.equal(compiled.packet_id,packet.packet_id);
assert.equal(compiled.state,'TRUE_WAIT');
assert.equal(compiled.first_red.id,'Q03_RUNTIME');

const reduced=run(['flatpack','reduce','--input',packetPath,'--out',reducedPath],{outFile:reducedPath});
assert.equal(reduced.schema,'xiio.sdk.flatpack-reduction-trace/v1');
assert.equal(reduced.reduction,'3->2->1');
assert.equal(reduced.stage1.blast_radius.step_depth,2);
assert.equal(reduced.stage1.blast_radius.x_up_required,true);
assert.deepEqual(reduced.stage1.blast_radius.affected_refs,['bins','search','studio']);
assert.deepEqual(reduced.stage1.blast_radius.return_targets,['aries:return','bins:return','search:return','studio:return']);
assert.equal(fs.existsSync(reducedPath),true);

const stage1Path=path.join(tmp,'stage1.json');
fs.writeFileSync(stage1Path,JSON.stringify(reduced.stage1,null,2));
const expanded=run(['flatpack','expand','--input',stage1Path,'--out',expandedPath],{outFile:expandedPath});
assert.equal(expanded.schema,'xiio.sdk.flatpack-expansion-trace/v1');
assert.equal(expanded.expansion,'1->2->3');
assert.deepEqual(expanded.stage3.blast_radius,reduced.stage3.blast_radius);
assert.deepEqual(expanded.stage3.parts,reduced.stage3.parts);
assert.equal(fs.existsSync(expandedPath),true);

console.log(JSON.stringify({
  status:'PASS',
  command_surface:[
    'xi-io flatpack compile',
    'xi-io flatpack reduce',
    'xi-io flatpack expand'
  ],
  blast_radius_preserved:true,
  step2_blast_radius_guard:true,
  x_up_required:true,
  return_targets_preserved:true,
  disk_outputs:[reducedPath,expandedPath],
  effects:0
}));
