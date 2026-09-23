#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const bin=path.join(root,'bin','xi.mjs');
const src=fs.readFileSync(bin,'utf8');

assert.match(src,/xi-io studio start\s+Start installed Studio shell and require :3099 readback/);
assert.match(src,/installedHexBin\('studio-start\.sh'\)/);
assert.match(src,/STUDIO_START_PRIMITIVE_NOT_INSTALLED/);
assert.match(src,/STUDIO_3099_READBACK_FAILED/);
assert.match(src,/OPEN != START/);
assert.match(src,/LOCAL_3099_PASS != PUBLIC_LIVE/);

const home=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-studio-start-'));
const r=spawnSync(process.execPath,[bin,'studio','start'],{
  cwd:root,encoding:'utf8',timeout:10000,
  env:{...process.env,HOME:home,XDG_STATE_HOME:path.join(home,'.state')}
});
let body={};
try{body=JSON.parse(r.stdout||'{}');}catch{}
assert.equal(body.schema,'xiio.cli.studio/v1');
assert.equal(body.state,'TRUE_WAIT');
assert.equal(body.first_red,'STUDIO_START_PRIMITIVE_NOT_INSTALLED');
assert.equal(body.effect_authority,0);

fs.rmSync(home,{recursive:true,force:true});
console.log('STUDIO_CLI_START=PASS missing_primitive=TRUE_WAIT open_ne_start=1 readback_required=1 public_live_separate=1');
