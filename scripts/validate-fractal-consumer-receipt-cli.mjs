#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-fractal-receipt-cli-'));
const vectorPath=path.join(tmp,'vector.json');
fs.writeFileSync(vectorPath,JSON.stringify({
  packet_id:'packet:cli',
  generation:'g1',
  semantic_digest:'sem:cli',
  blast_radius_digest:'blast:cli',
  affected_refs:['hex','studio'],
  return_targets:['return:hex','return:studio'],
  first_red:'Q_CURRENT'
},null,2));

const run=spawnSync(process.execPath,[
  'bin/xi.mjs','receipt','fractal',
  '--consumer','HEX',
  '--scale','MICRO',
  '--input',vectorPath,
  '--producer','hex:producer',
  '--observer','benchmark:observer',
  '--source','hex:projection',
  '--readback','hex:readback'
],{encoding:'utf8'});

assert.equal(run.status,0,run.stderr);
const body=JSON.parse(run.stdout);
assert.equal(body.schema,'xiio.studio.fractal-consumer-receipt/v1');
assert.equal(body.consumer_id,'HEX');
assert.equal(body.scale,'MICRO');
assert.equal(body.producer_ref,'hex:producer');
assert.equal(body.observer_ref,'benchmark:observer');
assert.equal(body.readback_ref,'hex:readback');
assert.equal(body.conserved.packet_id,'packet:cli');
assert.deepEqual(body.conserved.affected_refs,['hex','studio']);
assert.equal(body.effect_authority,0);

const bad=spawnSync(process.execPath,[
  'bin/xi.mjs','receipt','fractal',
  '--consumer','HEX',
  '--scale','MICRO',
  '--input',vectorPath
],{encoding:'utf8'});
assert.notEqual(bad.status,0);

fs.rmSync(tmp,{recursive:true,force:true});
console.log(JSON.stringify({
  schema:'xiio.sdk.fractal-consumer-receipt-cli-check/v1',
  state:'PASS',
  command:'xi-io receipt fractal',
  effect_authority:0
},null,2));
