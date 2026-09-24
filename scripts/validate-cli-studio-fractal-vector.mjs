#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-studio-vector-'));
const vectorPath=path.join(tmp,'fractal-vector.current.json');
const vector={
  packet_id:'packet:studio-vector',
  generation:'g1',
  semantic_digest:'sem:studio-vector',
  blast_radius_digest:'blast:studio-vector',
  affected_refs:['api','bins','cli','hex','ibal','search','studio','switchboard'],
  return_targets:['return:api','return:bins','return:cli','return:hex','return:ibal','return:search','return:studio','return:switchboard'],
  first_red:'Q_SEARCH_BINS'
};
fs.writeFileSync(vectorPath,JSON.stringify(vector,null,2));

function run(pathValue){
  return spawnSync(process.execPath,['bin/xi.mjs','studio','vector','--json'],{
    encoding:'utf8',
    env:{...process.env,XIIO_FRACTAL_VECTOR_PATH:pathValue}
  });
}

let run1=run(vectorPath);
assert.equal(run1.status,0,run1.stderr);
let body=JSON.parse(run1.stdout);
assert.equal(body.schema,'xiio.cli.studio-fractal-vector/v1');
assert.equal(body.state,'PASS');
assert.deepEqual(body.vector,vector);
assert.equal(body.packet_id,vector.packet_id);
assert.equal(body.generation,vector.generation);
assert.equal(body.semantic_digest,vector.semantic_digest);
assert.equal(body.blast_radius_digest,vector.blast_radius_digest);
assert.deepEqual(body.affected_refs,vector.affected_refs);
assert.deepEqual(body.return_targets,vector.return_targets);
assert.equal(body.first_red,vector.first_red);
assert.equal(body.authority_granted,false);
assert.equal(body.provider_effect,false);

const missing=run(path.join(tmp,'missing.json'));
body=JSON.parse(missing.stdout);
assert.equal(body.state,'TRUE_WAIT');
assert.equal(body.first_red,'FRACTAL_VECTOR_UNREADABLE');

fs.writeFileSync(vectorPath,JSON.stringify({packet_id:'bad'}));
const incomplete=run(vectorPath);
body=JSON.parse(incomplete.stdout);
assert.equal(body.state,'BLOCKED');
assert.match(body.first_red,/FRACTAL_VECTOR_FIELD_REQUIRED/);

fs.rmSync(tmp,{recursive:true,force:true});
console.log(JSON.stringify({
  schema:'xiio.sdk.cli-studio-fractal-vector-check/v1',
  state:'PASS',
  exact_projection:true,
  missing_waits:true,
  incomplete_blocks:true,
  ledger_dependency:false,
  effect_authority:0
},null,2));
