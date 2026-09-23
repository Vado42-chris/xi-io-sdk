#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const bin='bin/xi.mjs';
const src=fs.readFileSync(bin,'utf8');
assert.match(src,/xi-io status --json/);
assert.match(src,/schema:'xiio\.cli\.status\/v1'/);
assert.match(src,/XIIO_INVOKED_AS/);
assert.match(src,/productRuntime\('hex','status'\)/);
assert.match(src,/productRuntime\('studio','status'\)/);
assert.match(src,/productRuntime\('inbox','status'\)/);

function run(alias){
  const r=spawnSync(process.execPath,[bin,'status','--json'],{
    encoding:'utf8',
    timeout:30000,
    env:{...process.env,XIIO_INVOKED_AS:alias},
  });
  assert.equal(r.status,0,`${alias} exit ${r.status}: ${r.stderr}`);
  const body=JSON.parse(r.stdout);
  assert.equal(body.schema,'xiio.cli.status/v1');
  assert.equal(body.invoked_as,alias);
  assert.equal(body.provider_effect,false);
  assert.equal(body.authority_granted,false);
  assert.ok(body.compass);
  assert.ok(body.machine_topology);
  assert.ok(body.runner);
  assert.ok(body.products?.hex);
  assert.ok(body.products?.studio);
  assert.ok(body.products?.inbox);
  return body;
}
const io=run('xi-io');
const xi=run('xi');
for(const key of ['sdk_version','sdk_root','state']) assert.deepEqual(io[key],xi[key],key);
assert.deepEqual(io.products,xi.products);
assert.deepEqual(io.machine_topology,xi.machine_topology);
assert.deepEqual(io.runner,xi.runner);
console.log('CLI_STATUS_ALIAS_PARITY=PASS aliases=xi-io,xi schema=xiio.cli.status/v1');
