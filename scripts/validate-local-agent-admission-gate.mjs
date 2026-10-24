#!/usr/bin/env node
// The direct local-agent entry must consume the same shared ROTFL lifecycle admission as
// bin/xi.mjs before any effectful tool runs, and must not over-block once admitted.
// Synthetic loopback model only; every write stays in a disposable temp workspace.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initializeRotflOrderRuntime, advanceRotflOrderRuntime } from '../src/preflight/order-runtime.mjs';

const repo = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const direct = path.join(repo, 'bin/xi-local-agent.mjs');
const head = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding:'utf8' }).stdout.trim();
const managed_current = {
  provider_current_ref:'github:xi-io-sdk@test', studio_handoff_ref:'studio:handoff:test',
  studio_session_ingress_ref:'studio:session:test', current_selector_ref:'studio:selector:test',
  waterfall_ref:'waterfall:test', registered_backlog_ref:'backlog:test',
  waterfall_generation:'g1', registered_backlog_generation:'g1', owner_restatement_count:0,
};
const marker = 'synthetic-admission-marker.txt';
const cells = [];

function admittedState(file, generation) {
  initializeRotflOrderRuntime({ source_generation:generation, managed_current, state_path:file });
  for (let i = 0; i <= 11; i += 1) {
    const r = advanceRotflOrderRuntime({ step_id:`O${i}`, evidence_ref:`evidence:O${i}`, preflight_ref:`preflight:O${i}`, current_source_generation:generation, state_path:file });
    assert.equal(r.state, 'PASS', `O${i}`);
  }
}

function runCase(name, prepare) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xiio-admitgate-'));
  try {
    const preload = path.join(dir, 'fake-ollama.mjs');
    fs.writeFileSync(preload, [
      'globalThis.fetch=async(url,{body}={})=>{',
      ' const u=new URL(String(url)); if(u.hostname!=="127.0.0.1"||u.port!=="11434"||u.pathname!=="/api/chat") throw Error("ALL_EXTERNAL_NETWORK_DENIED_BY_TEST");',
      ' const req=JSON.parse(body||"{}"); const tool=req.messages.find(m=>m?.role==="tool");',
      ' const message=tool?{role:"assistant",content:"tool said: "+tool.content}',
      `  :{role:"assistant",tool_calls:[{function:{name:"edit_workspace_text_file",arguments:{path:${JSON.stringify(marker)},operation:"create",new_text:"ok\\n"}}}]};`,
      ' return {ok:true,json:async()=>({message})};};',
    ].join('\n'));
    const statePath = path.join(dir, 'oor.json');
    prepare(statePath);
    const run = spawnSync(process.execPath, [direct, '--execute', '--once'], {
      cwd:dir, input:'synthetic request', encoding:'utf8', timeout:15000,
      env:{ ...process.env, HOME:dir, XDG_STATE_HOME:path.join(dir, 'state'), XIIO_OOR_STATE_PATH:statePath, XIIO_OLLAMA_MODEL:'test-model', NODE_OPTIONS:`--import=${preload}` },
    });
    const wrote = fs.existsSync(path.join(dir, marker));
    const out = JSON.parse(run.stdout);
    return { name, wrote, result:String(out.result || ''), status:out.status };
  } finally { fs.rmSync(dir, { recursive:true, force:true }); }
}

const t = (name, fn) => { fn(); cells.push(name); };
t('no lifecycle state: --execute alone does not write', () => {
  const c = runCase('missing', () => {});
  assert.equal(c.wrote, false); assert.match(c.result, /ROTFL_OOR_RUNTIME_STATE_MISSING/);
});
t('lifecycle started but O11 not complete: no write', () => {
  const c = runCase('incomplete', (f) => initializeRotflOrderRuntime({ source_generation:head, managed_current, state_path:f }));
  assert.equal(c.wrote, false); assert.match(c.result, /ROTFL_OOR_O11_NOT_COMPLETE/);
});
t('admission for another source generation: no write', () => {
  const c = runCase('drift', (f) => admittedState(f, 'sdk:some-other-generation'));
  assert.equal(c.wrote, false); assert.match(c.result, /ROTFL_OOR_SOURCE_GENERATION_DRIFT/);
});
t('admitted for this exact generation: the bounded write proceeds (no over-blocking)', () => {
  const c = runCase('admitted', (f) => admittedState(f, head));
  assert.equal(c.wrote, true);
});
console.log(JSON.stringify({ check:'LOCAL_AGENT_ADMISSION_GATE', status:'PASS', source_generation:head, cases:cells.length, provider_effects:0 }));
