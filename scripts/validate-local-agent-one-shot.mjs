#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const bin=fileURLToPath(new URL('../bin/xi.mjs',import.meta.url));
const agent=fs.readFileSync(new URL('../bin/xi-local-agent.mjs',import.meta.url),'utf8');

function invoke(args,{input=''}={}){
  const run=spawnSync(process.execPath,[bin,'chat',...args],{
    cwd:root,
    input,
    encoding:'utf8',
    timeout:10_000,
    maxBuffer:1_048_576,
    env:{...process.env,XIIO_OLLAMA_MODEL:'validation-model-do-not-call'},
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

console.log(JSON.stringify({
  status:'PASS',
  schema:'xiio.cli.local-one-shot/v1',
  hostile_cases:3,
  model_calls:0,
  provider_effects:0,
  cloud_fallback:false,
  next:'QUALIFIED_HOST_RUNTIME_PROOF_WITH_LOCAL_OLLAMA'
}));
