#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const gen='cd0958240f2e98e6bce87979cf5e9f15e4543147';
for(const id of ['page-shell','flatplane-cube','portable-artifact-cube']){
  const run=spawnSync(process.execPath,['bin/xi.mjs','file','prepare','--primitive',id,'--generation',gen],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const body=JSON.parse(run.stdout);
  assert.equal(body.schema,'xiio.sdk.registered-primitive-shipment-preparation/v1');
  assert.equal(body.primitive_id,id);
  assert.equal(body.cube.denominator,10);
  assert.equal(body.cube.first_red.id,'F05_HEX_CURRENTNESS');
  assert.equal(body.ready_to_ship,false);
}
const bad=spawnSync(process.execPath,['bin/xi.mjs','file','prepare','--primitive','no-such-primitive','--generation',gen],{encoding:'utf8'});
assert.notEqual(bad.status,0);

console.log(JSON.stringify({
  schema:'xiio.sdk.file-prepare-cli-check/v1',
  state:'PASS',
  prepared:3,
  invalid_primitive_rejected:true,
  effect_authority:0
},null,2));
