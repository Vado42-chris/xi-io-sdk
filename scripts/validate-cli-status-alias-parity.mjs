#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const bin=path.resolve('bin/xi.mjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-cli-alias-'));
try{
  const env={...process.env,HOME:tmp,XDG_STATE_HOME:path.join(tmp,'.state')};
  const install=spawnSync(process.execPath,[bin,'install'],{encoding:'utf8',timeout:30000,env});
  assert.equal(install.status,0,`install exit ${install.status}: ${install.stderr}`);

  function run(alias){
    const wrapper=path.join(tmp,'.local','bin',alias);
    assert.equal(fs.existsSync(wrapper),true,`${alias} wrapper missing`);
    const r=spawnSync(wrapper,['status','--json'],{
      encoding:'utf8',timeout:30000,env
    });
    assert.equal(r.status,0,`${alias} exit ${r.status}: ${r.stderr}`);
    const body=JSON.parse(r.stdout);
    assert.equal(body.schema,'xiio.cli.status/v1');
    assert.equal(body.invoked_as,alias);
    assert.equal(body.provider_effect,false);
    assert.equal(body.authority_granted,false);
    assert.ok(body.xi);
    assert.ok(body.io);
    assert.notDeepEqual(body.xi,body.io);
    assert.equal(body.io.provider_egress_state,'NOT_EVALUATED');
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
  for(const key of ['sdk_version','sdk_root','state','xi','io']) assert.deepEqual(io[key],xi[key],key);
  assert.deepEqual(io.products,xi.products);
  assert.deepEqual(io.machine_topology,xi.machine_topology);
  assert.deepEqual(io.runner,xi.runner);
  console.log('CLI_STATUS_ALIAS_PARITY=PASS wrappers=real aliases=xi-io,xi schema=xiio.cli.status/v1');
} finally {
  fs.rmSync(tmp,{recursive:true,force:true});
}
