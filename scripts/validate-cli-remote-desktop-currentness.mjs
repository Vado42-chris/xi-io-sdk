#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-remote-desktop-state-'));
const statePath=path.join(tmp,'remote-desktop.current.json');
fs.writeFileSync(statePath,JSON.stringify({
  schema:'xiio.studio.home-cloud-bridge-current/v1',
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
  aries_machine_state:{state:'UNKNOWN_FROM_REMOTE_DESKTOP_TRANSPORT'},
  bridge:{
    home_node:{
      role:'DURABLE_EXECUTION_AND_CUSTODY_EDGE',
      device_ref:'aries',
      registration_state:'PASS',
      machine_state:'UNKNOWN_FROM_REMOTE_DESKTOP_TRANSPORT',
      service_expectation:'LONG_LIVED_RECONNECTING_AGENT'
    },
    relay:{
      role:'AUTHENTICATED_CONTROL_AND_TRANSPORT_RELAY',
      provider:'Remote Desktop Commander',
      authentication_state:'PASS',
      transport_broadcast_v1:true,
      authority:'RELAY_ONLY_NOT_HOME_STATE_OWNER'
    },
    live_session:{
      state:'FAIL_CURRENT',
      session_ref:'session:test',
      last_seen:'2026-09-23T18:54:45.183Z',
      reconnect_policy:'AUTOMATIC_HOME_AGENT_RECONNECT',
      owner_relay_required:false
    },
    client_projection:{
      access_model:'ANY_AUTHORIZED_CLIENT_ANYWHERE',
      source_of_truth:'HOME_NODE',
      cloud_role:'PROJECT_AND_ROUTE',
      local_ui_required:false,
      home_keyboard_presence_required:false
    },
    cord_free:{
      target:true,
      state:'WAIT_LIVE_SESSION',
      requires:['HOME_AGENT_LONG_LIVED','AUTH_CURRENT','DEVICE_REGISTERED','RELAY_REACHABLE','LIVE_SESSION_CURRENT','CAPABILITY_PROJECTION_CURRENT'],
      first_red:'LIVE_HOME_AGENT_SESSION_NOT_CURRENT'
    }
  }
},null,2));

const env={...process.env,XIIO_REMOTE_DESKTOP_STATE_PATH:statePath,XIIO_INVOKED_AS:'xi-io'};
const run=spawnSync(process.execPath,['bin/xi.mjs','status','--json'],{encoding:'utf8',env});
assert([1,2].includes(run.status),`typed remote-session red should produce WAIT/REJECT exit, got ${run.status}: ${run.stderr}`);
const body=JSON.parse(run.stdout);
assert.equal(body.remote_desktop.plugin_auth_state,'PASS');
assert.equal(body.remote_desktop.device_registration_state,'PASS');
assert.equal(body.remote_desktop.live_device_session_state,'FAIL_CURRENT');
assert.equal(body.remote_desktop.aries_machine_state,'UNKNOWN_FROM_REMOTE_DESKTOP_TRANSPORT');
assert.equal(body.remote_desktop.auth_token_state,'VALID');
assert.equal(body.remote_desktop.transport_broadcast_v1,true);
assert.equal(body.remote_desktop.home_node_role,'DURABLE_EXECUTION_AND_CUSTODY_EDGE');
assert.equal(body.remote_desktop.relay_role,'AUTHENTICATED_CONTROL_AND_TRANSPORT_RELAY');
assert.equal(body.remote_desktop.relay_authority,'RELAY_ONLY_NOT_HOME_STATE_OWNER');
assert.equal(body.remote_desktop.client_access_model,'ANY_AUTHORIZED_CLIENT_ANYWHERE');
assert.equal(body.remote_desktop.client_source_of_truth,'HOME_NODE');
assert.equal(body.remote_desktop.local_ui_required,false);
assert.equal(body.remote_desktop.home_keyboard_presence_required,false);
assert.equal(body.remote_desktop.reconnect_policy,'AUTOMATIC_HOME_AGENT_RECONNECT');
assert.equal(body.remote_desktop.owner_relay_required,false);
assert.equal(body.remote_desktop.cord_free_target,true);
assert.equal(body.remote_desktop.cord_free_state,'WAIT_LIVE_SESSION');
assert.equal(body.remote_desktop.cord_free_first_red,'LIVE_HOME_AGENT_SESSION_NOT_CURRENT');
assert.equal(body.io.remote_desktop.plugin_auth_state,'PASS');
assert.equal(body.io.remote_desktop.live_device_session_state,'FAIL_CURRENT');
assert.equal(body.io.remote_desktop.cord_free_state,'WAIT_LIVE_SESSION');
assert.equal(body.io.remote_desktop.home_node_role,'DURABLE_EXECUTION_AND_CUSTODY_EDGE');
assert.equal(body.io.remote_desktop.client_access_model,'ANY_AUTHORIZED_CLIENT_ANYWHERE');

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
assert([0,1,2].includes(missing.status),`missing projection must remain typed, got ${missing.status}: ${missing.stderr}`);
const mb=JSON.parse(missing.stdout);
assert.equal(mb.remote_desktop.state,'TRUE_WAIT');
assert.equal(mb.remote_desktop.plugin_auth_state,'UNKNOWN');
assert.equal(mb.remote_desktop.first_red,'REMOTE_DESKTOP_STATE_PROJECTION_MISSING');

fs.rmSync(tmp,{recursive:true,force:true});
console.log(JSON.stringify({
  schema:'xiio.sdk.cli-home-cloud-bridge-currentness-check/v1',
  state:'PASS',
  auth_pass_preserved:true,
  registration_pass_preserved:true,
  live_session_fail_preserved:true,
  missing_projection_is_wait_not_not_authenticated:true,
  home_node_remains_authoritative_during_session_loss:true,
  cloud_relay_is_not_home_state_owner:true,
  client_disconnect_does_not_require_home_keyboard:true,
  automatic_reconnect_required:true,
  cord_free_wait_preserved:true,
  effect_authority:0
},null,2));
