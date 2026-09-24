#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-cli-lifecycle-'));
const file=path.join(tmp,'lifecycle.current.json');
const lifecycle={
  schema:'xiio.studio.rotfl-lifecycle/v1',
  subject_ref:'work:test',
  generation:'g1',
  state:'WAIT_WAKE',
  selectable:false,
  currentness:{
    hot_current:true,
    wake_required:true,
    wake_current:false,
    binary_ingress_current:true,
    hex_current:true,
    detonator_current:true
  },
  continuation:{
    attempted:false,
    result_ready:false,
    return_bound:false,
    apply_return_current:false,
    readback_current:false,
    reap_eligible:false,
    ghost_nonselectable:false,
    historical_preserved:false,
    next_current:false
  },
  evidence:{wake_ref:'cadence:wake:g1'},
  source_generations:{cadence:'cadence:g1',studio:'studio:g1'},
  affected_refs:['bins','search'],
  return_targets:['return:bins','return:search'],
  errors:[],
  first_red:'WAKE_NOT_CURRENT',
  effect_authority:false,
  hard:['WAKE!=AUTHORITY','TRIGGER!=DETONATION']
};
fs.writeFileSync(file,JSON.stringify(lifecycle,null,2));
const env={...process.env,XIIO_LIFECYCLE_PATH:file,XIIO_INVOKED_AS:'xi-io'};

for(const action of ['status','next','explain']){
  const run=spawnSync(process.execPath,['bin/xi.mjs','lifecycle',action],{encoding:'utf8',env});
  assert.equal(run.status,0,run.stderr);
  const body=JSON.parse(run.stdout);
  assert.equal(body.state,'PASS');
  if(action==='status'){
    assert.deepEqual(body.lifecycle,lifecycle);
  }else{
    assert.equal(body.generation,'g1');
    assert.equal(body.lifecycle_state,'WAIT_WAKE');
    assert.equal(body.selectable,false);
    assert.equal(body.first_red,'WAKE_NOT_CURRENT');
    assert.deepEqual(body.affected_refs,['bins','search']);
    assert.deepEqual(body.return_targets,['return:bins','return:search']);
  }
}

const missing=spawnSync(process.execPath,['bin/xi.mjs','lifecycle','status'],{
  encoding:'utf8',
  env:{...process.env,XIIO_LIFECYCLE_PATH:path.join(tmp,'missing.json'),XIIO_INVOKED_AS:'xi-io'}
});
assert.equal(missing.status,1,missing.stderr);
const wait=JSON.parse(missing.stdout);
assert.equal(wait.state,'TRUE_WAIT');
assert.equal(wait.first_red,'LIFECYCLE_PROJECTION_MISSING');

const cold={...lifecycle,state:'COLD_NONRUNNABLE',selectable:false,first_red:'COLD_NOT_QUALIFIED'};
fs.writeFileSync(file,JSON.stringify(cold,null,2));
const coldRun=spawnSync(process.execPath,['bin/xi.mjs','lifecycle','next'],{encoding:'utf8',env});
const coldBody=JSON.parse(coldRun.stdout);
assert.equal(coldBody.selectable,false);
assert.equal(coldBody.lifecycle_state,'COLD_NONRUNNABLE');

const ghost={...lifecycle,state:'GHOST_NONSELECTABLE',selectable:false,first_red:null};
fs.writeFileSync(file,JSON.stringify(ghost,null,2));
const ghostRun=spawnSync(process.execPath,['bin/xi.mjs','lifecycle','next'],{encoding:'utf8',env});
const ghostBody=JSON.parse(ghostRun.stdout);
assert.equal(ghostBody.selectable,false);
assert.equal(ghostBody.lifecycle_state,'GHOST_NONSELECTABLE');

fs.rmSync(tmp,{recursive:true,force:true});
console.log(JSON.stringify({
  schema:'xiio.sdk.cli-lifecycle-projection-check/v1',
  state:'PASS',
  status_projection_exact:true,
  next_projection_no_recompute:true,
  explain_projection_no_recompute:true,
  missing_projection_wait:true,
  cold_nonselectable:true,
  ghost_nonselectable:true,
  effect_authority:0
},null,2));
