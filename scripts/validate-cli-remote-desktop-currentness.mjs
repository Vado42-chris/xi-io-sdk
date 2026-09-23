#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-remote-desktop-state-'));
const statePath=path.join(tmp,'remote-desktop.current.json');
fs.writeFileSync(statePath,JSON.stringify({
  schema:'xiio.studio.remote-desktop-current/v1',
  provider:'Remote Desktop Commander',
  authentication:{state:'PASS',user_authenticated:true,supabase_connected:true,device_count:1},
  device_registration:{
    state:'PASS',
    device_id:'aries-test',
    device_name:'aries',
    auth_token_state:'VALID',
    advertised_capabilities:{app_version:'0.2.51',transport_broadcast_v1:true}
  },
  live_device_session:{
    state:'FAIL_CURRENT',
    provider_status:'offline',
    last_seen:'2026-09-23T18:54:45.183Z'
  },
  aries_machine_state:{state:'UNKNOWN_FROM_REMOTE_DESKTOP_TRANSPORT'}
},null,2));

const env={...process.env,XIIO_REMOTE_DESKTOP_STATE_PATH:statePath,XIIO_INVOKED_AS:'xi-io'};
const run=spawnSync(process.execPath,['bin/xi.mjs','status','--json'],{encoding:'utf8',env});
assert.equal(run.status,0,run.stderr);
const body=JSON.parse(run.stdout);
assert.equal(body.remote_desktop.plugin_auth_state,'PASS');
assert.equal(body.remote_desktop.device_registration_state,'PASS');
assert.equal(body.remote_desktop.live_device_session_state,'FAIL_CURRENT');
assert.equal(body.remote_desktop.aries_machine_state,'UNKNOWN_FROM_REMOTE_DESKTOP_TRANSPORT');
assert.equal(body.remote_desktop.auth_token_state,'VALID');
assert.equal(body.remote_desktop.transport_broadcast_v1,true);
assert.equal(body.io.remote_desktop.plugin_auth_state,'PASS');
assert.equal(body.io.remote_desktop.live_device_session_state,'FAIL_CURRENT');

const gates=spawnSync(process.execPath,['bin/xi.mjs','gates','--check','--json'],{encoding:'utf8',env});
const gb=JSON.parse(gates.stdout);
const byId=Object.fromEntries(gb.cells.map(x=>[x.id,x.state]));
assert.equal(byId.REMOTE_PLUGIN_AUTH,'PASS');
assert.equal(byId.REMOTE_DEVICE_REGISTRATION,'PASS');
assert.equal(byId.REMOTE_LIVE_SESSION,'FAIL_CURRENT');

const missing=spawnSync(process.execPath,['bin/xi.mjs','status','--json'],{
  encoding:'utf8',
  env:{...process.env,XIIO_REMOTE_DESKTOP_STATE_PATH:path.join(tmp,'missing.json'),XIIO_INVOKED_AS:'xi-io'}
});
const mb=JSON.parse(missing.stdout);
assert.equal(mb.remote_desktop.state,'TRUE_WAIT');
assert.equal(mb.remote_desktop.plugin_auth_state,'UNKNOWN');
assert.equal(mb.remote_desktop.first_red,'REMOTE_DESKTOP_STATE_PROJECTION_MISSING');

fs.rmSync(tmp,{recursive:true,force:true});
console.log(JSON.stringify({
  schema:'xiio.sdk.cli-remote-desktop-currentness-check/v1',
  state:'PASS',
  auth_pass_preserved:true,
  registration_pass_preserved:true,
  live_session_fail_preserved:true,
  missing_projection_is_wait_not_not_authenticated:true,
  effect_authority:0
},null,2));
