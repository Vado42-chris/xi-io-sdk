#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-file-cube-'));
const input=path.join(tmp,'cube.json');
const file={
  file_id:'cli.primitive.1',
  artifact_role:'sdk.primitive',
  semantic_generation:'sem:g1',
  profile_id:'json.semantic.v1',
  payload:{hello:'world'},
  source_bindings:[{ref:'source:cli',generation:'src:g1',role:'primary'}],
  dependency_bindings:[],
  projection_refs:[],
  provider_projections:[]
};
const floor={
  schema:'xiio.hex.global-floor-projection/v1',
  fleet_generation:'fleet:g1',
  subject_denominator:1,
  qualification_state:'QUALIFIED',
  source_currentness:'HEX_QUALIFIED_CURRENT',
  subjects:[{product_ref:'sdk.primitive',product_generation:'sem:g1',projection_ref:'sha256:subject',qualification_state:'QUALIFIED',source_currentness:'HEX_QUALIFIED_CURRENT',missing_punchcards:[],open_cells_without_punchcards:[]}],
  missing_punchcards:[],open_cells_without_punchcards:[],
  effect_authority:false,release_authority:false,billing_authority:false,live_authority:false,
  projection_ref:'sha256:global'
};
fs.writeFileSync(input,JSON.stringify({
  cube_id:'cube:cli.primitive.1',
  file,
  dependency_policy:'NONE_REQUIRED',
  parser_profile:{profile_id:'json.semantic.v1'},
  consumer_profile:{profile_id:'json.semantic.v1'},
  hex_floor:floor,
  hex_subject_ref:'sdk.primitive',
  hex_subject_generation:'sem:g1',
  bins_custody:{resource_version_ref:'bins:rv:cli',sha256:'a'.repeat(64),byte_length:12,source_ref:'source:cli'},
  transfer_readback:{source_sha256:'b'.repeat(64),destination_sha256:'b'.repeat(64),source_bytes:12,destination_bytes:12,final_readback_ref:'transfer:cli'},
  parser_readback:{state:'PASS',profile_id:'json.semantic.v1',receipt_ref:'parser:cli'},
  consumer_readback:{state:'PASS',profile_id:'json.semantic.v1',receipt_ref:'consumer:cli'},
  authority_gate:{required:false,held:false}
},null,2));

const run=spawnSync(process.execPath,['bin/xi.mjs','file','cube','--input',input],{encoding:'utf8'});
assert.equal(run.status,0,run.stderr);
const cube=JSON.parse(run.stdout);
assert.equal(cube.schema,'xiio.sdk.portable-artifact-cube/v1');
assert.equal(cube.denominator,10);
assert.equal(cube.state,'PASS');
assert.equal(cube.closure_100,true);

const fileInput=path.join(tmp,'file.json');
fs.writeFileSync(fileInput,JSON.stringify(file));
const runFile=spawnSync(process.execPath,['bin/xi.mjs','file','compile','--input',fileInput],{encoding:'utf8'});
assert.equal(runFile.status,0,runFile.stderr);
const compiled=JSON.parse(runFile.stdout);
assert.equal(compiled.schema,'xiio.sdk.portable-semantic-file/v1');
assert.equal(compiled.file_id,'cli.primitive.1');

fs.rmSync(tmp,{recursive:true,force:true});
console.log(JSON.stringify({schema:'xiio.sdk.file-cube-cli-check/v1',state:'PASS',commands:2,effects:0},null,2));
