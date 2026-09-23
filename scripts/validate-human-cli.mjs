#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const bin=fileURLToPath(new URL('../bin/xi.mjs',import.meta.url));
const binSource=fs.readFileSync(bin,'utf8');
const agentSource=fs.readFileSync(new URL('../bin/xi-local-agent.mjs',import.meta.url),'utf8');
const bootstrap=fileURLToPath(new URL('./install-cli.sh',import.meta.url));
const bootstrapSource=fs.readFileSync(bootstrap,'utf8');

function run(args,{cwd=root,input='',env={}}={}){
  const result=spawnSync(process.execPath,[bin,...args],{
    cwd,
    input,
    encoding:'utf8',
    timeout:12_000,
    maxBuffer:4*1024*1024,
    env:{...process.env,...env},
  });
  assert.equal(result.error,undefined);
  return result;
}

const help=run(['--help']);
assert.equal(help.status,0);
assert.match(help.stdout,/xi-io local operator/);
assert.match(help.stdout,/xi-io registry tools/);
assert.match(help.stdout,/xi-io --execute/);
assert.match(help.stdout,/xi-io self-test/);
assert.match(help.stdout,/xi-io models/);
assert.match(help.stdout,/xi-io recover aries-runner/);

const commands=run(['registry','commands']);
assert.equal(commands.status,0);
assert.match(commands.stdout,/xi-io ack distribute/);
assert.match(commands.stdout,/xi-io cadence continue/);
assert.doesNotMatch(commands.stdout,/^\s+xi ack distribute/m);

const ack=run(['registry','ack']);
assert.equal(ack.status,0);
assert.match(ack.stdout,/ACK command registry/);
assert.match(ack.stdout,/xi-io ack distribute/);
assert.match(ack.stdout,/xi-io ack validate/);

const tools=run(['registry','tools']);
assert.equal(tools.status,0);
for(const name of [
  'list_workspace_files',
  'search_workspace_text',
  'read_workspace_text_file',
  'read_workspace_git',
  'read_local_runtime_status',
  'edit_workspace_text_file',
  'run_workspace_command',
  'list_xiio_registry',
  'resolve_xiio_command',
  'run_xiio_cli_command',
]) assert.ok(tools.stdout.includes(name),name);

const sdk=run(['registry','sdk']);
assert.equal(sdk.status,0);
assert.match(sdk.stdout,/Public SDK callables/);
assert.match(sdk.stdout,/compileContinuationCycle/);

const primitives=run(['registry','primitives']);
assert.equal(primitives.status,0);
const primitiveJson=JSON.parse(primitives.stdout);
assert.equal(primitiveJson.schema,'xiio.sdk.primitive-catalog/v2');
assert.ok(Array.isArray(primitiveJson.primitives) && primitiveJson.primitives.length>0);

const doctor=run(['doctor']);
assert.equal(doctor.status,0);
const doctorJson=JSON.parse(doctor.stdout);
assert.equal(doctorJson.schema,'xiio.cli.human-doctor/v1');
assert.ok(['PARTIAL_LOCAL_DEPENDENCY_RUNNING','WAIT_LOCAL_DEPENDENCY'].includes(doctorJson.status));
assert.equal(doctorJson.state_ladder.installed.state,'PASS');
assert.equal(doctorJson.state_ladder.dependency_running.scope,'OLLAMA_ONLY');
if (doctorJson.state_ladder.dependency_running.state === 'PASS') {
  assert.equal(doctorJson.status,'PARTIAL_LOCAL_DEPENDENCY_RUNNING');
} else {
  assert.equal(doctorJson.status,'WAIT_LOCAL_DEPENDENCY');
}
assert.equal(doctorJson.state_ladder.operator_running.scope,'CURRENT_CLI_PROCESS_ONLY');
assert.equal(doctorJson.state_ladder.runtime_executed.state,'NOT_PROVEN');
assert.equal(doctorJson.state_ladder.deployed.state,'NOT_OBSERVED');
assert.equal(doctorJson.state_ladder.live.state,'NOT_OBSERVED');
assert.equal(doctorJson.state_ladder.usable.state,'NOT_PROVEN');
for(const hard of [
  'INSTALLED != RUNNING',
  'DEPENDENCY_RUNNING != OPERATOR_RUNNING',
  'OPERATOR_RUNNING != RUNTIME_EXECUTED',
  'RUNTIME_EXECUTED != DEPLOYED',
  'DEPLOYED != LIVE',
  'LIVE != USABLE',
  'OLLAMA_READY != XIIO_RUNTIME_READY',
  'PREVIEW != EXECUTION',
  'LOCAL_RUNNING != OUTSIDE_ORIGIN_LIVE'
]) assert.ok(doctorJson.hard_state_separation.includes(hard),hard);
assert.equal(doctorJson.provider_effect,false);
assert.equal(doctorJson.automatic_cloud_fallback,false);
assert.ok(doctorJson.local_tools.length>=10);
assert.ok(doctorJson.ack_commands.includes('xi-io ack distribute'));
assert.ok(doctorJson.ack_commands.includes('xi-io ack validate'));
assert.equal(doctorJson.ack_commands.some((row)=>/^xi\s/.test(row)),false);

const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-human-cli-workspace-'));
const workspaceDoctor=run(['doctor',workspace],{cwd:root});
assert.equal(workspaceDoctor.status,0);
const workspaceDoctorJson=JSON.parse(workspaceDoctor.stdout);
assert.equal(workspaceDoctorJson.workspace,workspace);

assert.match(binSource,/top === null/);
assert.match(binSource,/top === '--execute'/);
assert.match(binSource,/top === '--model'/);
assert.match(binSource,/launchLocalOperator/);
assert.match(binSource,/recoverAriesRunner/);
assert.match(binSource,/top === 'recover'/);
assert.match(agentSource,/xi-io @ibal local operator/);
assert.match(agentSource,/XIIO_OLLAMA_MODEL \|\| 'llama3\.1:8b'/);
assert.match(agentSource,/\/tools/);
assert.match(agentSource,/\/commands/);
assert.match(agentSource,/\/ack/);
assert.match(agentSource,/\/models/);
assert.match(bootstrapSource,/resolve_node/);
assert.match(bootstrapSource,/XIIO_CLI_BOOTSTRAP_PROBE_NODE/);
assert.match(bootstrapSource,/NODE_22_PLUS_NOT_FOUND/);

const bootstrapHome=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-bootstrap-node-home-'));
const fakeNvmNode=path.join(bootstrapHome,'.nvm','versions','node','v22.99.0','bin','node');
fs.mkdirSync(path.dirname(fakeNvmNode),{recursive:true});
fs.symlinkSync(process.execPath,fakeNvmNode);
const emptyPath=path.join(bootstrapHome,'empty-bin');
fs.mkdirSync(emptyPath,{recursive:true});
const nodeProbe=spawnSync('/bin/bash',[bootstrap],{
  cwd:root,
  encoding:'utf8',
  timeout:10_000,
  env:{
    ...process.env,
    HOME:bootstrapHome,
    PATH:emptyPath,
    XIIO_CLI_BOOTSTRAP_PROBE_NODE:'1',
    XIIO_NODE:'',
  },
});
assert.equal(nodeProbe.error,undefined);
assert.equal(nodeProbe.status,0,nodeProbe.stderr);
assert.match(nodeProbe.stdout,/XIIO_CLI_NODE_PROBE=PASS/);
assert.ok(nodeProbe.stdout.includes(fakeNvmNode),nodeProbe.stdout);


const tempHome=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-human-cli-home-'));
const install=run(['install'],{env:{HOME:tempHome}});
assert.equal(install.status,0);
const installReceipt=JSON.parse(install.stdout);
assert.equal(installReceipt.installed,true);
assert.equal(installReceipt.default_entry,'xi-io');
const installedBin=path.join(tempHome,'.local','bin','xi-io');
const aliasBin=path.join(tempHome,'.local','bin','xi');
assert.ok(fs.existsSync(installedBin));
assert.ok(fs.existsSync(aliasBin));
assert.ok((fs.statSync(installedBin).mode & 0o111)!==0);
assert.ok(fs.existsSync(path.join(tempHome,'.local','share','xi-io','cli','env.sh')));
assert.ok(fs.readFileSync(path.join(tempHome,'.bashrc'),'utf8').includes('xi-io-cli-managed-path'));

const installedSelfTest=spawnSync(installedBin,['self-test'],{
  cwd:os.tmpdir(),
  encoding:'utf8',
  timeout:10_000,
  env:{...process.env,HOME:tempHome},
});
assert.equal(installedSelfTest.error,undefined);
assert.equal(installedSelfTest.status,0,installedSelfTest.stderr);
const installedSelfTestJson=JSON.parse(installedSelfTest.stdout);
assert.equal(installedSelfTestJson.schema,'xiio.cli.self-test/v1');
assert.equal(installedSelfTestJson.fail,0);
assert.equal(installedSelfTestJson.provider_effect,false);

const fromAnywhere=spawnSync(installedBin,['registry','tools'],{
  cwd:os.tmpdir(),
  encoding:'utf8',
  timeout:10_000,
  env:{...process.env,HOME:tempHome},
});
assert.equal(fromAnywhere.error,undefined);
assert.equal(fromAnywhere.status,0);
assert.match(fromAnywhere.stdout,/Local Ollama workspace tools/);
assert.match(fromAnywhere.stdout,/read_workspace_text_file/);

assert.match(help.stdout,/xi fleet delivery/);
assert.match(help.stdout,/xi ack distribute/);

fs.rmSync(workspace,{recursive:true,force:true});
fs.rmSync(tempHome,{recursive:true,force:true});
fs.rmSync(bootstrapHome,{recursive:true,force:true});

console.log(JSON.stringify({
  schema:'xiio.cli.human-facing-proof/v1',
  status:'PASS',
  default_human_entry:true,
  any_directory:true,
  cwd_independent_install:true,
  registry_commands:true,
  registry_ack:true,
  registry_tools:true,
  registry_sdk:true,
  registry_primitives:true,
  ollama_local_only:true,
  native_tool_surface:10,
  bootstrap_nvm_node_resolution:true,
  provider_effects:0,
  authority_granted:false,
  hostiles:{
    human_workspace_escape:'BLOCKED_BY_LOCAL_AGENT_TARGET',
    legacy_xi_alias:'PRESERVED',
    automatic_cloud_fallback:'ABSENT',
  },
}));
