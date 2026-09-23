#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateXiioCliArgs, validateWorkspaceCommand } from '../bin/xi-local-agent.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const cli=fileURLToPath(new URL('../bin/xi.mjs',import.meta.url));
const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-cli-wargame-'));
const receipts=[];
let hostileCount=0;
let rejected=0;
let falseGreen=0;

function run(args,{home,cwd=root,input='',env={}}={}){
  const result=spawnSync(process.execPath,[cli,...args],{
    cwd,
    input,
    encoding:'utf8',
    timeout:15_000,
    maxBuffer:4*1024*1024,
    env:{...process.env,...(home?{HOME:home}:{}),...env},
  });
  assert.equal(result.error,undefined);
  return result;
}
function hostile(id,fn){
  hostileCount++;
  try{
    const ok=fn();
    if(ok===true){rejected++;receipts.push({id,state:'REJECTED_EXPECTED'});}
    else {falseGreen++;receipts.push({id,state:'FALSE_GREEN'});}
  }catch(error){
    falseGreen++;
    receipts.push({id,state:'HARNESS_ERROR',error:String(error?.message||error)});
  }
}
function typedCliError(result){
  if(result.status===0)return false;
  try{
    const body=JSON.parse(result.stderr);
    return body?.schema==='xiio.cli.error/v1' && body?.status==='BLOCKED' && body?.provider_effect===false && body?.authority_granted===false;
  }catch{return false;}
}
function typedWrapperError(result){
  if(result.status===0)return false;
  try{
    const body=JSON.parse(result.stderr);
    return body?.schema==='xiio.cli.wrapper-error/v1' && body?.status==='BLOCKED' && body?.provider_effect===false && body?.authority_granted===false;
  }catch{return false;}
}
function typedOneShotBlock(result,firstRed=null){
  if(result.status===0)return false;
  try{
    const body=JSON.parse(result.stdout);
    return body?.schema==='xiio.cli.local-one-shot/v1'
      && body?.status==='BLOCKED'
      && body?.provider_effect===false
      && body?.automatic_cloud_fallback===false
      && (!firstRed || body?.first_red===firstRed);
  }catch{return false;}
}
function installHome(name,shell='/bin/bash'){
  const home=path.join(sandbox,name);
  fs.mkdirSync(home,{recursive:true});
  const result=run(['install'],{home,env:{SHELL:shell}});
  assert.equal(result.status,0,result.stderr);
  const receipt=JSON.parse(result.stdout);
  assert.equal(receipt.schema,'xiio.cli.install/v1');
  assert.equal(receipt.installed,true);
  assert.equal(receipt.provider_effect,false);
  assert.equal(receipt.authority_granted,false);
  return {home,receipt,bin:path.join(home,'.local','bin','xi-io'),alias:path.join(home,'.local','bin','xi')};
}

// Golden sandbox install: path contains spaces and unrelated cwd.
const golden=installHome('home with spaces');
const outside=path.join(sandbox,'outside cwd with spaces');
fs.mkdirSync(outside,{recursive:true});
let normal=spawnSync(golden.bin,['doctor'],{cwd:outside,encoding:'utf8',timeout:10_000,env:{...process.env,HOME:golden.home}});
assert.equal(normal.status,0,normal.stderr);
let doctor=JSON.parse(normal.stdout);
assert.equal(doctor.schema,'xiio.cli.human-doctor/v1');
assert.equal(doctor.provider_effect,false);
assert.equal(doctor.automatic_cloud_fallback,false);

// Reinstall is idempotent and does not stack shell markers.
for(let i=0;i<10;i++){
  const result=run(['install'],{home:golden.home,env:{SHELL:'/bin/bash'}});
  assert.equal(result.status,0,result.stderr);
}
const bashrc=fs.readFileSync(path.join(golden.home,'.bashrc'),'utf8');
assert.equal((bashrc.match(/xi-io-cli-managed-path/g)||[]).length,1);

// 10 installs with different home names/shell projections.
for(let i=0;i<10;i++) hostile(`INSTALL_${i}`,()=>{
  const shell=i%3===0?'/bin/zsh':i%3===1?'/bin/bash':'/usr/bin/fish';
  const x=installHome(`install-${i} space`,shell);
  const direct=spawnSync(x.bin,['registry','tools'],{cwd:outside,encoding:'utf8',timeout:10_000,env:{...process.env,HOME:x.home}});
  return direct.status===0 && /Local Ollama workspace tools/.test(direct.stdout);
});

// 10 stale/corrupt root pointer variants must fail in wrapper, not leak Node stacks.
const rootFile=path.join(golden.home,'.local','share','xi-io','cli','sdk.path');
const goodRoot=fs.readFileSync(rootFile,'utf8');
const badRoots=['','/','/tmp','/does/not/exist','relative/path','../escape','\0bad',' /tmp ','/var/empty','missing'];
for(let i=0;i<10;i++) hostile(`POINTER_${i}`,()=>{
  fs.writeFileSync(rootFile,badRoots[i]+'\n');
  const r=spawnSync(golden.bin,['doctor'],{cwd:outside,encoding:'utf8',timeout:10_000,env:{...process.env,HOME:golden.home}});
  fs.writeFileSync(rootFile,goodRoot);
  return typedWrapperError(r) && !/Error:|at .*\.mjs:/.test(r.stderr);
});

// 10 invalid XIIO_NODE values must fall back to PATH node and remain usable.
for(let i=0;i<10;i++) hostile(`NODE_FALLBACK_${i}`,()=>{
  const r=spawnSync(golden.bin,['registry','ack'],{
    cwd:outside,encoding:'utf8',timeout:10_000,
    env:{...process.env,HOME:golden.home,XIIO_NODE:`/missing/node-${i}`}
  });
  return r.status===0 && /ACK command registry/.test(r.stdout);
});

// 10 missing workspaces -> typed CLI error; no raw stack.
for(let i=0;i<10;i++) hostile(`MISSING_WORKSPACE_${i}`,()=>{
  const r=run(['doctor',path.join(sandbox,`no-such-workspace-${i}`)]);
  return typedCliError(r) && !/at .*\.mjs:|node:internal/.test(r.stderr);
});

// 10 traversal attempts block before Ollama/provider contact.
const traversals=['../x','../../etc/passwd','a/../../b','./../x','foo/../..','..\\x','a\\..\\b','../../../tmp/x','x/../../../y','../.env'];
for(let i=0;i<10;i++) hostile(`TRAVERSAL_${i}`,()=>{
  const r=run(['chat','--once','--input',traversals[i]],{cwd:outside,env:{XIIO_OLLAMA_MODEL:'do-not-call'}});
  return typedOneShotBlock(r,'PATH_DENIED');
});

// 10 absolute input paths block before Ollama/provider contact.
const absRoots=['/etc/passwd','/tmp/x','/home/x','/media/x','/var/log/x','/proc/self/environ','/dev/null','/root/x','/usr/bin/node','/opt/x'];
for(let i=0;i<10;i++) hostile(`ABSOLUTE_${i}`,()=>{
  const r=run(['chat','--once','--input',absRoots[i]],{cwd:outside,env:{XIIO_OLLAMA_MODEL:'do-not-call'}});
  return typedOneShotBlock(r,'PATH_DENIED');
});

// 10 .env / secret-shaped workspace reads block before model contact.
const secretPaths=['.env','.env.local','.env.production','a/.env','a/.env.dev','.ssh/id_rsa','node_modules/x','a/node_modules/x','.git/config','a/.git/config'];
for(let i=0;i<10;i++) hostile(`SECRET_PATH_${i}`,()=>{
  const r=run(['chat','--once','--input',secretPaths[i]],{cwd:outside,env:{XIIO_OLLAMA_MODEL:'do-not-call'}});
  return typedOneShotBlock(r,'PATH_DENIED');
});

// 10 oversized stdin variants block locally with no provider fallback.
for(let i=0;i<10;i++) hostile(`OVERSIZE_${i}`,()=>{
  const input='x'.repeat(65_537+i*1024);
  const r=run(['chat','--once'],{cwd:outside,input,env:{XIIO_OLLAMA_MODEL:'do-not-call'}});
  return typedOneShotBlock(r,'ONCE_INPUT_TOO_LARGE');
});

// 10 malformed top-level invocations: typed failure where command parsing owns the error.
const malformed=[
  ['--model'],
  ['chat','--model'],
  [outside,outside],
  ['doctor',path.join(sandbox,'absent-a')],
  ['workspace',path.join(sandbox,'absent-b')],
  ['chat','--input'],
  ['shell','--model'],
  ['--model','--execute'],
  ['chat','--model','--execute'],
  ['chat',outside,outside],
];
for(let i=0;i<10;i++) hostile(`MALFORMED_${i}`,()=>{
  const r=run(malformed[i],{cwd:outside,env:{XIIO_OLLAMA_MODEL:'do-not-call'}});
  return typedCliError(r) && !/at .*\.mjs:|node:internal/.test(r.stderr);
});

// 10 alias/from-anywhere invocations must survive arbitrary cwd and invalid XIIO_NODE override.
for(let i=0;i<10;i++) hostile(`ALIAS_ANYWHERE_${i}`,()=>{
  const cwd=path.join(sandbox,`cwd-${i} with spaces`);
  fs.mkdirSync(cwd,{recursive:true});
  const bin=i%2?golden.alias:golden.bin;
  const r=spawnSync(bin,[i%2?'registry':'doctor',...(i%2?['commands']:[])],{
    cwd,encoding:'utf8',timeout:10_000,
    env:{...process.env,HOME:golden.home,XIIO_NODE:`/invalid/node-${i}`}
  });
  return r.status===0 && (i%2?/Command registry/.test(r.stdout):JSON.parse(r.stdout).schema==='xiio.cli.human-doctor/v1');
});

assert.equal(hostileCount,100);
assert.equal(rejected,100);
assert.equal(falseGreen,0);

// Bootstrap + self-test lifecycle proof (separate from frozen hostile-100 denominator).
const installedSelfTest=spawnSync(golden.bin,['self-test'],{
  cwd:outside,encoding:'utf8',timeout:15_000,env:{...process.env,HOME:golden.home}
});
assert.equal(installedSelfTest.status,0,installedSelfTest.stderr);
const selfTestBody=JSON.parse(installedSelfTest.stdout);
assert.equal(selfTestBody.schema,'xiio.cli.self-test/v1');
assert.ok(['PASS','PASS_WITH_WAITS'].includes(selfTestBody.state));
assert.equal(selfTestBody.fail,0);
assert.equal(selfTestBody.provider_effect,false);
assert.equal(selfTestBody.automatic_cloud_fallback,false);

const bootstrapScript=path.join(root,'scripts','install-cli.sh');
assert.ok(fs.existsSync(bootstrapScript));
const syntax=spawnSync('bash',['-n',bootstrapScript],{encoding:'utf8',timeout:10_000});
assert.equal(syntax.status,0,syntax.stderr);

// Build a local bare SDK remote with an explicit main ref so bootstrap can be tested without provider mutation.
const bare=path.join(sandbox,'bootstrap-source.git');
let gitRun=spawnSync('git',['clone','--quiet','--bare',root,bare],{encoding:'utf8',timeout:20_000});
assert.equal(gitRun.status,0,gitRun.stderr);
gitRun=spawnSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8',timeout:10_000});
assert.equal(gitRun.status,0,gitRun.stderr);
const sourceHead=gitRun.stdout.trim();
gitRun=spawnSync('git',['--git-dir',bare,'update-ref','refs/heads/main',sourceHead],{encoding:'utf8',timeout:10_000});
assert.equal(gitRun.status,0,gitRun.stderr);
gitRun=spawnSync('git',['--git-dir',bare,'symbolic-ref','HEAD','refs/heads/main'],{encoding:'utf8',timeout:10_000});
assert.equal(gitRun.status,0,gitRun.stderr);

const bootstrapHome=path.join(sandbox,'bootstrap home with spaces');
const bootstrapRoot=path.join(bootstrapHome,'.local','share','xi-io','sdk');
fs.mkdirSync(bootstrapHome,{recursive:true});
const bootstrapEnv={
  ...process.env,
  HOME:bootstrapHome,
  SHELL:'/bin/bash',
  XIIO_CLI_BOOTSTRAP_SOURCE:bare,
  XIIO_CLI_SDK_ROOT:bootstrapRoot,
};
const bootstrap1=spawnSync('bash',[bootstrapScript],{cwd:outside,encoding:'utf8',timeout:30_000,maxBuffer:4*1024*1024,env:bootstrapEnv});
assert.equal(bootstrap1.status,0,bootstrap1.stderr);
assert.match(bootstrap1.stdout,/XIIO_CLI_BOOTSTRAP=PASS/);
assert.match(bootstrap1.stdout,/xiio\.cli\.self-test\/v1/);
assert.ok(fs.existsSync(path.join(bootstrapHome,'.local','bin','xi-io')));

const bootstrap2=spawnSync('bash',[bootstrapScript],{cwd:outside,encoding:'utf8',timeout:30_000,maxBuffer:4*1024*1024,env:bootstrapEnv});
assert.equal(bootstrap2.status,0,bootstrap2.stderr);
assert.match(bootstrap2.stdout,/XIIO_CLI_BOOTSTRAP=PASS/);

fs.writeFileSync(path.join(bootstrapRoot,'dirty-canary.txt'),'dirty\n');
const dirtyBootstrap=spawnSync('bash',[bootstrapScript],{cwd:outside,encoding:'utf8',timeout:20_000,maxBuffer:4*1024*1024,env:bootstrapEnv});
assert.notEqual(dirtyBootstrap.status,0);
assert.match(dirtyBootstrap.stderr,/SDK_CHECKOUT_DIRTY/);
fs.unlinkSync(path.join(bootstrapRoot,'dirty-canary.txt'));

const wrongRoot=path.join(sandbox,'non-git-target');
fs.mkdirSync(wrongRoot,{recursive:true});
const wrongTarget=spawnSync('bash',[bootstrapScript],{
  cwd:outside,encoding:'utf8',timeout:20_000,
  env:{...bootstrapEnv,XIIO_CLI_SDK_ROOT:wrongRoot}
});
assert.notEqual(wrongTarget.status,0);
assert.match(wrongTarget.stderr,/TARGET_EXISTS_NOT_GIT_REPO/);

// Minimal TIME=$ latency gates (non-counted; fail only on gross usability regressions).
function timedRun(label,args,{cwd=outside,env={}}={}){
  const start=process.hrtime.bigint();
  const result=run(args,{cwd,env});
  const ms=Number(process.hrtime.bigint()-start)/1e6;
  assert.ok(ms<5000,`${label} exceeded 5000ms: ${ms.toFixed(1)}ms`);
  return {label,ms,result};
}
const latencyRows=[
  timedRun('doctor',['doctor']),
  timedRun('registry_ack',['registry','ack']),
  timedRun('registry_tools',['registry','tools']),
  timedRun('self_test',['self-test']),
  timedRun('runner_recovery_plan',['recover','aries-runner']),
];
assert.ok(latencyRows.every((row)=>row.ms<5000));
// Additional non-counted invariants.
// Interactive @ibal may inspect runner recovery in preview mode, but mutation remains execution-gated.
assert.deepEqual(
  validateXiioCliArgs(['recover','aries-runner']),
  ['recover','aries-runner']
);
assert.throws(
  ()=>validateXiioCliArgs(['recover','aries-runner','--execute']),
  /XIIO_RECOVERY_REQUIRES_EXECUTE/
);
assert.deepEqual(
  validateXiioCliArgs(['recover','aries-runner','--execute'],{executionEnabled:true}),
  ['recover','aries-runner','--execute']
);
assert.throws(
  ()=>validateXiioCliArgs(['recover','other-runner'],{executionEnabled:true}),
  /XIIO_RECOVERY_TARGET_DENIED/
);

// Interpreter boundary: relative script path is not enough to make arbitrary code execution bounded.
assert.throws(()=>validateWorkspaceCommand('bash',['scripts/install-cli.sh']),/BASH_COMMAND_DENIED/);
assert.throws(()=>validateWorkspaceCommand('bash',['-c','cat /etc/passwd']),/SHELL_STRING_DENIED/);
assert.throws(()=>validateWorkspaceCommand('node',['bin/xi.mjs']),/NODE_COMMAND_DENIED/);
assert.throws(()=>validateWorkspaceCommand('python3',['scripts/host-abi-observer.py']),/PYTHON_COMMAND_DENIED/);
assert.throws(()=>validateWorkspaceCommand('npm',['test']),/COMMAND_DENIED/);

// Explicit syntax-check forms remain available and workspace-bounded.
assert.deepEqual(validateWorkspaceCommand('bash',['-n','scripts/install-cli.sh']),{command:'bash',args:['-n','scripts/install-cli.sh']});
assert.deepEqual(validateWorkspaceCommand('node',['--check','bin/xi.mjs']),{command:'node',args:['--check','bin/xi.mjs']});
assert.deepEqual(validateWorkspaceCommand('python3',['-m','py_compile','scripts/host-abi-observer.py']),{command:'python3',args:['-m','py_compile','scripts/host-abi-observer.py']});
assert.throws(()=>validateWorkspaceCommand('bash',['-n','../escape.sh']),/COMMAND_DENIED|PATH_DENIED/);

const wrapperSource=fs.readFileSync(golden.bin,'utf8');
assert.doesNotMatch(wrapperSource,/\beval\b|curl|wget|npm install|git clone/);
assert.match(wrapperSource,/xiio\.cli\.wrapper-error\/v1/);
const cliSource=fs.readFileSync(cli,'utf8');
assert.match(cliSource,/xiio\.cli\.error\/v1/);
assert.doesNotMatch(cliSource,/api\.openai\.com|anthropic\.com|generativelanguage\.googleapis\.com/i);

fs.rmSync(sandbox,{recursive:true,force:true});
console.log(JSON.stringify({
  schema:'xiio.cli.sandbox-wargame/v1',
  result:'PASS',
  sandbox_install:'PASS',
  hostile_denominator:hostileCount,
  rejected,
  false_green:falseGreen,
  cwd_independent:true,
  install_idempotent:true,
  path_with_spaces:true,
  stale_pointer_fail_closed:true,
  node_fallback:true,
  traversal_blocked:true,
  secret_paths_blocked:true,
  oversized_input_blocked:true,
  typed_terminal_errors:true,
  self_test:'PASS',
  bootstrap_first_install:'PASS',
  bootstrap_repeat:'PASS',
  bootstrap_dirty_checkout_fail_closed:true,
  bootstrap_wrong_target_fail_closed:true,
  interpreter_execution_fail_closed:true,
  syntax_check_only:true,
  automatic_cloud_fallback:false,
  provider_effects:0,
  authority_granted:false,
},null,2));
