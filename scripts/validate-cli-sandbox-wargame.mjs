#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

// Additional non-counted invariants.
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
  automatic_cloud_fallback:false,
  provider_effects:0,
  authority_granted:false,
},null,2));
