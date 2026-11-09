#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const bin=path.resolve('bin/xi.mjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-cargo-boundary-'));
const workspace=path.join(tmp,'workspace');
const outside=path.join(tmp,'outside');
const cache=path.join(tmp,'cache');
fs.mkdirSync(workspace,{recursive:true});
fs.mkdirSync(outside,{recursive:true});
fs.writeFileSync(path.join(workspace,'Cargo.toml'),'[package]\nname="fixture"\nversion="0.0.0"\n');

function run(args,cwd=workspace){
  const r=spawnSync(process.execPath,[bin,...args],{
    cwd,encoding:'utf8',timeout:30000,
    env:{...process.env,HOME:tmp,XDG_CACHE_HOME:cache},
  });
  let body=null; try{body=JSON.parse(r.stdout||'{}');}catch{}
  return {status:r.status,stdout:r.stdout,stderr:r.stderr,body};
}
function existsCargoCache(){
  return fs.existsSync(path.join(cache,'xi-io','cargo-targets'));
}

try{
  let r=run(['cargo','--','check']);
  assert.equal(r.status,13);
  assert.equal(r.body?.state,'BLOCKED');
  assert.equal(r.body?.first_red,'EXECUTION_NOT_ADMITTED');
  assert.equal(r.body?.local_effect,false);
  assert.equal(existsCargoCache(),false,'no-execute path must not materialize cargo cache');

  r=run(['cargo','--workspace',outside,'--','check']);
  assert.equal(r.status,13);
  assert.equal(r.body?.state,'BLOCKED');
  assert.equal(r.body?.first_red,'WORKSPACE_OUTSIDE_SELECTED_ROOT');
  assert.equal(r.body?.local_effect,false);
  assert.equal(existsCargoCache(),false,'outside workspace rejection must remain read-only');

  for(const sub of ['run','test','check','build']){
    r=run(['cargo','--',sub]);
    assert.equal(r.status,13,sub);
    assert.equal(r.body?.first_red,'EXECUTION_NOT_ADMITTED',sub);
    assert.equal(existsCargoCache(),false,sub);
  }

  const nested=path.join(workspace,'nested');
  fs.mkdirSync(nested,{recursive:true});
  r=run(['cargo','--workspace',nested,'--','test']);
  assert.equal(r.status,13);
  assert.equal(r.body?.first_red,'EXECUTION_NOT_ADMITTED');
  assert.equal(existsCargoCache(),false);

  console.log('CLI_CARGO_EXECUTION_BOUNDARY=PASS no_execute=1 outside_workspace=1 hostile_subcommands=4 no_fs_creation=1');
} finally {
  fs.rmSync(tmp,{recursive:true,force:true});
}
