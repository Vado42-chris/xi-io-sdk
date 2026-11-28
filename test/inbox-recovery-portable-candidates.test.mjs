import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {candidateRepos,recoverInboxRuntime} from '../src/recovery/inbox-runtime.mjs';

test('candidate recovery is independent of historical Storage 22 and Aries literals',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-portable-inbox-'));
  try{
    const a=candidateRepos({cwd:root,env:{USER:'user-one'}});
    const b=candidateRepos({cwd:root,env:{USER:'user-two'}});
    assert.deepEqual(a,b);
    assert.ok(a.every(p=>!p.includes('Storage 22')&&!p.includes('/media/user-one/')&&!p.includes('/media/user-two/')));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('explicit client-selected project path with spaces is preserved',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xiio portable-'));
  try{
    const configured=path.join(root,'custom installation','Inbox project');
    const found=candidateRepos({cwd:root,env:{USER:'other-user',XIIO_INBOX_REPO:configured}});
    assert.equal(found[0],configured);
    assert.equal(found.filter(x=>x===configured).length,1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('missing client binding does not invent a machine-specific candidate',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-no-binding-'));
  try{
    const found=candidateRepos({cwd:root,env:{}});
    assert.ok(!found.some(p=>/Storage 22|chrishallberg|aries/i.test(p)));
    assert.ok(!found.some(p=>p.startsWith('/media/')));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('no current qualified candidate remains BLOCKED and has no source/runtime effects',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-no-effects-'));
  let changes=0;
  try{
    const result=recoverInboxRuntime({
      execute:true,cwd:root,env:{USER:'other',XIIO_INBOX_REPO:path.join(root,'missing space','Inbox')},
      runtimeInspect:()=>({state:'UNBOUND'}),
      repoInspect:(p)=>({path:p,state:'ABSENT'}),
      sourcePrep:()=>{changes++;throw Error('SOURCE_MUTATION_FORBIDDEN')},
      startRuntime:()=>{changes++;throw Error('HOST_MUTATION_FORBIDDEN')},
      headMatchCheck:()=>{changes++;throw Error('READBACK_NOT_ALLOWED')},
      waitSeconds:1,
    });
    assert.equal(result.state,'BLOCKED');
    assert.equal(result.first_red,'NO_CLEAN_CURRENT_INBOX_REPO');
    assert.equal(changes,0);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
