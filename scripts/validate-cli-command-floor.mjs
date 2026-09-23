#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const bin=path.resolve('bin/xi.mjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-command-floor-'));
const env={...process.env,HOME:tmp,XDG_STATE_HOME:path.join(tmp,'.state')};

function run(args,{input=null}={}){
  const r=spawnSync(process.execPath,[bin,...args],{encoding:'utf8',timeout:30000,env,input});
  let body=null;
  try{body=JSON.parse(r.stdout||'{}');}catch{}
  return {status:r.status,stdout:r.stdout,stderr:r.stderr,body};
}
try{
  let r=run(['status','--json']);
  assert.ok([0,1,2].includes(r.status));
  assert.equal(r.body?.schema,'xiio.cli.command-envelope/v1');
  assert.equal(r.body?.command,'status');
  assert.equal(r.body?.data?.schema,'xiio.cli.status/v1');

  r=run(['gates','--check','--json']);
  assert.ok([0,1,2].includes(r.status));
  assert.equal(r.body?.schema,'xiio.cli.command-envelope/v1');
  assert.equal(r.body?.command,'gates.check');
  assert.equal(r.body?.data?.schema,'xiio.cli.gates-check/v1');
  assert.equal(r.body?.data?.silent_remainder,0);

  const pass={schema:'fixture/v1',denominator:100,silent_remainder:0,false_green:0};
  r=run(['verify','--stdin','--json'],{input:JSON.stringify(pass)});
  assert.equal(r.status,0);
  assert.equal(r.body?.ok,true);
  assert.equal(r.body?.command,'verify');
  assert.equal(r.body?.data?.state,'PASS');

  const wait={denominator:100,silent_remainder:0,false_green:0};
  r=run(['verify','--stdin','--json'],{input:JSON.stringify(wait)});
  assert.equal(r.status,1);
  assert.equal(r.body?.state,'PASS_WITH_WAITS');
  assert.equal(r.body?.data?.first_red,'SCHEMA_DECLARED');

  const fail={schema:'fixture/v1',denominator:100,silent_remainder:1,false_green:0};
  r=run(['verify','--stdin','--json'],{input:JSON.stringify(fail)});
  assert.equal(r.status,2);
  assert.equal(r.body?.state,'FAIL');
  assert.equal(r.body?.data?.first_red,'SILENT_REMAINDER');

  r=run(['verify','--stdin','--json'],{input:'{bad json'});
  assert.equal(r.status,2);
  assert.equal(r.body?.schema,'xiio.cli.command-envelope/v1');
  assert.equal(r.body?.error?.code,'INVALID_JSON');

  const file=path.join(tmp,'fixture.json');
  fs.writeFileSync(file,JSON.stringify(pass));
  r=run(['verify','--file',file,'--json']);
  assert.equal(r.status,0);
  assert.equal(r.body?.data?.source_ref,path.resolve(file));

  console.log('CLI_COMMAND_FLOOR=PASS status=1 gates=1 verify_pass=1 verify_wait=1 verify_fail=1 invalid_json=1 file=1 exit_map=0/1/2');
} finally {
  fs.rmSync(tmp,{recursive:true,force:true});
}
