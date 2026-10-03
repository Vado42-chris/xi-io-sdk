#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { initializeRotflOrderRuntime, advanceRotflOrderRuntime } from '../src/preflight/order-runtime.mjs';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const bin=fileURLToPath(new URL('../bin/xi.mjs',import.meta.url));
const agent=fs.readFileSync(new URL('../bin/xi-local-agent.mjs',import.meta.url),'utf8');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-one-shot-oor-'));
const oorState=path.join(tmp,'order.current.json');
const sdkHead=spawnSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
const managedCurrent={
  provider_current_ref:'fixture:provider-current',
  studio_handoff_ref:'fixture:studio-handoff',
  studio_session_ingress_ref:'fixture:studio-session',
  current_selector_ref:'fixture:selector',
  waterfall_ref:'fixture:waterfall',
  registered_backlog_ref:'fixture:backlog',
  waterfall_generation:'g1',
  registered_backlog_generation:'g1',
  owner_restatement_count:0,
};
initializeRotflOrderRuntime({source_generation:sdkHead,managed_current:managedCurrent,state_path:oorState});
for(let i=0;i<=11;i++) advanceRotflOrderRuntime({
  step_id:`O${i}`,
  evidence_ref:`fixture:evidence:O${i}`,
  preflight_ref:`fixture:preflight:O${i}`,
  current_source_generation:sdkHead,
  state_path:oorState,
});

function invoke(args,{input=''}={}){
  const run=spawnSync(process.execPath,[bin,'chat',...args],{
    cwd:root,
    input,
    encoding:'utf8',
    timeout:10_000,
    maxBuffer:1_048_576,
    env:{...process.env,XIIO_OOR_STATE_PATH:oorState,XIIO_OLLAMA_MODEL:'validation-model-do-not-call'},
  });
  assert.equal(run.error,undefined);
  assert.equal(run.stderr,'');
  const value=JSON.parse(run.stdout);
  return {code:run.status,value,output:run.stdout};
}

// Source boundary: the headless mode must stay local, bounded, and explicit.
assert.match(agent,/process\.argv\.includes\('--once'\)/);
assert.match(agent,/argValue\('--input'\)/);
assert.match(agent,/MAX_ONCE_INPUT_BYTES = 65_536/);
assert.match(agent,/http:\/\/127\.0\.0\.1:11434/);
assert.match(agent,/automatic_cloud_fallback:false/);
assert.match(agent,/provider_effect:false/);
assert.match(agent,/RESULT -> RETURN -> APPLY_RETURN/);
assert.match(agent,/SHELL_STRING_DENIED/);
assert.match(agent,/GIT_COMMAND_DENIED/);
assert.match(agent,/TOOL_SPIN_LIMIT/);
assert.doesNotMatch(agent,/api\.openai\.com|anthropic\.com|generativelanguage\.googleapis\.com/i);

// Empty one-shot input must fail before any Ollama request and still emit typed JSON.
const empty=invoke(['--once'],{input:''});
assert.equal(empty.code,1);
assert.equal(empty.value.schema,'xiio.cli.local-one-shot/v1');
assert.equal(empty.value.status,'BLOCKED');
assert.equal(empty.value.first_red,'ONCE_INPUT_EMPTY');
assert.equal(empty.value.provider_effect,false);
assert.equal(empty.value.automatic_cloud_fallback,false);
assert.equal(empty.value.execution,'PREVIEW');

// Workspace traversal must be rejected before model/provider contact.
const escape=invoke(['--once','--input','../escape']);
assert.equal(escape.code,1);
assert.equal(escape.value.schema,'xiio.cli.local-one-shot/v1');
assert.equal(escape.value.status,'BLOCKED');
assert.equal(escape.value.first_red,'PATH_DENIED');
assert.equal(escape.value.provider_effect,false);
assert.equal(escape.value.automatic_cloud_fallback,false);

// --execute changes only the bounded-tool admission flag; it does not grant provider effects.
const bounded=invoke(['--execute','--once'],{input:''});
assert.equal(bounded.code,1);
assert.equal(bounded.value.status,'BLOCKED');
assert.equal(bounded.value.first_red,'ONCE_INPUT_EMPTY');
assert.equal(bounded.value.execution,'BOUNDED');
assert.equal(bounded.value.provider_effect,false);
assert.equal(bounded.value.automatic_cloud_fallback,false);

fs.rmSync(tmp,{recursive:true,force:true});

console.log(JSON.stringify({
  status:'PASS',
  schema:'xiio.cli.local-one-shot/v1',
  hostile_cases:3,
  model_calls:0,
  provider_effects:0,
  cloud_fallback:false,
  next:'QUALIFIED_HOST_RUNTIME_PROOF_WITH_LOCAL_OLLAMA'
}));
