#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectLocalHttpRuntime } from '../src/compass/local-truth.mjs';

const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-runtime-compass-hostile-'));
let hostileCount=0;
let expectedCount=0;
let falseGreen=0;
const failures=[];

function mkdir(p){fs.mkdirSync(p,{recursive:true});return p;}
function safeLink(target,p){
  mkdir(path.dirname(p));
  try{fs.unlinkSync(p);}catch{}
  fs.symlinkSync(target,p);
}
function result(ok,stdout='',stderr='',status=ok?0:1){
  return {ok,status,stdout:String(stdout).trim(),stderr:String(stderr).trim(),error:null};
}
function makeExec({cwd,origin,localHead,providerHead,inside=true,dirty=false,listener=true,pid=1534869}){
  return (command,args)=>{
    if(command==='ss'){
      if(!listener) return result(false,'','',1);
      return result(true,`LISTEN 0 511 127.0.0.1:8791 0.0.0.0:* users:(("MainThread",pid=${pid},fd=23))\n`);
    }
    if(command==='git'){
      const sig=args.join(' ');
      if(sig==='rev-parse --is-inside-work-tree') return result(inside,inside?'true\n':'','not a worktree',inside?0:128);
      if(sig==='rev-parse --show-toplevel') return result(true,cwd+'\n');
      if(sig==='rev-parse HEAD') return result(true,localHead+'\n');
      if(sig==='remote get-url origin') return result(true,origin+'\n');
      if(sig==='status --porcelain=v1') return result(true,dirty?' M server/mail-sync.mjs\n':'');
      if(sig==='ls-remote origin refs/heads/main'){
        if(providerHead===null) return result(false,'','network unavailable',2);
        return result(true,providerHead+'\trefs/heads/main\n');
      }
    }
    return result(false,'','unsupported '+command+' '+args.join(' '),2);
  };
}
function makeProc(procRoot,{pid=1534869,cwd,withCwd=true,withExe=true,cmd=true}={}){
  const root=mkdir(path.join(procRoot,String(pid)));
  if(withExe) safeLink(process.execPath,path.join(root,'exe'));
  if(withCwd) safeLink(cwd,path.join(root,'cwd'));
  if(cmd) fs.writeFileSync(path.join(root,'cmdline'),'node\0server/local-web-runtime.mjs\0');
}
function record(id,fn){
  hostileCount++;
  try{ fn(); expectedCount++; }
  catch(error){
    falseGreen++;
    failures.push({id,error:String(error?.message||error)});
  }
}

const A='a'.repeat(40);
const B='b'.repeat(40);

for(let i=0;i<100;i++){
  const group=Math.floor(i/10);
  const variant=i%10;
  const id=`RUNTIME_COMPASS_${String(i+1).padStart(3,'0')}`;
  record(id,()=>{
    const root=mkdir(path.join(sandbox,`case-${i}-Storage 22-${variant}`));
    const repo=mkdir(path.join(root,'.cache','xi-io-inbox-main-tip'));
    const procRoot=mkdir(path.join(root,'proc'));
    let origin='https://github.com/Vado42-chris/xi-io-Inbox.git';
    let localHead=A;
    let providerHead=A;
    let inside=true;
    let dirty=false;
    let listener=true;
    let withCwd=true;
    let expected='PASS_CURRENT';

    if(group===0) expected='PASS_CURRENT';
    if(group===1){ listener=false; expected='ABSENT_LISTENER'; }
    if(group===2){ withCwd=false; expected='LISTENER_PATH_UNREADABLE'; }
    if(group===3){ inside=false; expected='LISTENER_NOT_GIT_CHECKOUT'; }
    if(group===4){ origin='https://github.com/example/not-inbox.git'; expected='WRONG_REPO'; }
    if(group===5){ localHead=A; providerHead=B; expected='RED_STALE_OR_NONPROVIDER'; }
    if(group===6){ providerHead=null; expected='UNKNOWN_CURRENTNESS'; }
    if(group===7){ dirty=true; expected='PASS_CURRENT'; }
    if(group===8){
      origin=variant%2===0?'git@github.com:Vado42-chris/xi-io-Inbox.git':'https://github.com/Vado42-chris/xi-io-Inbox';
      expected='PASS_CURRENT';
    }
    if(group===9){
      localHead=B; providerHead=B; expected='PASS_CURRENT';
    }

    if(listener) makeProc(procRoot,{cwd:repo,withCwd});
    const exec=makeExec({cwd:repo,origin,localHead,providerHead,inside,dirty,listener});
    const obs=inspectLocalHttpRuntime({
      port:8791,
      expectedRepo:'Vado42-chris/xi-io-Inbox',
      exec,
      env:{...process.env},
      procRoot,
      providerRead:true,
    });

    assert.equal(obs.schema,'xiio.cli.runtime-observation/v1');
    assert.equal(obs.state,expected);
    assert.equal(obs.effect_authority,0);

    if(expected==='PASS_CURRENT'){
      assert.equal(obs.repo_state,'PASS');
      assert.equal(obs.generation_state,'EXACT_PROVIDER_MAIN');
      assert.equal(obs.local_head,providerHead);
    }
    if(group===5){
      assert.equal(obs.local_head,A);
      assert.equal(obs.provider_main,B);
      assert.equal(obs.generation_state,'DIFFERENT_FROM_PROVIDER_MAIN');
      assert.notEqual(obs.state,'PASS_CURRENT');
    }
    if(group===6){
      assert.equal(obs.provider_state,'WAIT_UNREADABLE');
      assert.equal(obs.generation_state,'UNKNOWN');
      assert.notEqual(obs.state,'PASS_CURRENT');
    }
    if(group===7){
      assert.equal(obs.dirty_state,'DIRTY');
      assert.equal(obs.state,'PASS_CURRENT');
    }
  });
}

if(falseGreen){
  console.error(JSON.stringify({schema:'xiio.cli.runtime-compass-hostile-debug/v1',falseGreen,failures:failures.slice(0,20)},null,2));
}
assert.equal(hostileCount,100);
assert.equal(expectedCount,100);
assert.equal(falseGreen,0);

fs.rmSync(sandbox,{recursive:true,force:true});
console.log(JSON.stringify({
  schema:'xiio.cli.runtime-compass-hostile-100/v1',
  result:'PASS',
  denominator:100,
  expected:100,
  false_green:0,
  groups:{
    exact_current:10,
    no_listener:10,
    unreadable_process_cwd:10,
    non_git_listener:10,
    wrong_repo:10,
    stale_or_nonprovider_head:10,
    provider_unreadable:10,
    dirty_but_current:10,
    origin_variants:10,
    alternate_exact_head:10
  },
  hard:[
    'VISIBLE_SHELL != CURRENT_RUNTIME',
    'LISTENER_HEALTH != GENERATION_CURRENT',
    'BOUND_RUNTIME != CURRENT_RUNTIME',
    'PROVIDER_UNREADABLE != CURRENT',
    'DIRTY_CURRENT != CLEAN_CURRENT'
  ],
  provider_effects:0,
  authority_granted:false
},null,2));
