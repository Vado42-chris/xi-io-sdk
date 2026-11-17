import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readVerifiedInstallerDependencyBinding, importVerifiedInstallerDependencyModule } from '../src/install/installer-dependency-binding-client.mjs';

function fixture(t,{mode='ok'}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-sdk-installer-binding-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const bin=path.join(root,'bin');fs.mkdirSync(bin);
  const receipt=path.join(root,'binding.json');
  const target=path.join(root,'provider.mjs');fs.writeFileSync(target,'export const x=1;\n');
  const script=path.join(bin,'xi-io-installer');
  const body=mode==='exit'
    ? '#!/bin/sh\nexit 3\n'
    : `#!/usr/bin/env node
const args=process.argv.slice(2);
if(args.length!==5||args[0]!=='verify-dependency-binding')process.exit(9);
const [_,receipt,dep,owner,generation]=args;
const value={
 schema:'xiio.installer-dependency-binding-receipt/v1',
 state:'VERIFIED',
 dependency_id:${JSON.stringify(mode==='identity'?'other-runtime':'provider-runtime')},
 owner_repo:'owner/provider',
 accepted_generation:'a'.repeat(40),
 binding_receipt_path:receipt,
 runtime_exports:{provider_module:{destination_scope:'xdg_data',destination:'xi-io/provider/provider.mjs',sha256:'b'.repeat(64),mode:'0644'}},
 fields:{provider_module:${JSON.stringify(target)}},
 provider_effect:false,effect_authority:false,custody_verified:true
};
process.stdout.write(JSON.stringify(value));
`;
  fs.writeFileSync(script,body,{mode:0o755});
  fs.writeFileSync(receipt,'{}');
  return {root,bin,receipt,target};
}
async function withPath(bin,work){
  const prior=process.env.PATH;
  process.env.PATH=bin+path.delimiter+prior;
  try{return await work();}finally{process.env.PATH=prior;}
}
const request=f=>({
  binding_receipt_path:f.receipt,
  expected_dependency_id:'provider-runtime',
  expected_owner_repo:'owner/provider',
  expected_generation:'a'.repeat(40),
});

test('SDK consumes Installer VERIFIED projection through fixed argv command',async t=>{
  const f=fixture(t);
  const result=await withPath(f.bin,()=>readVerifiedInstallerDependencyBinding(request(f)));
  assert.equal(result.schema,'xiio.sdk.installer-dependency-binding-client/v1');
  assert.equal(result.state,'VERIFIED');
  assert.equal(result.dependency_id,'provider-runtime');
  assert.equal(result.owner_repo,'owner/provider');
  assert.equal(result.accepted_generation,'a'.repeat(40));
  assert.equal(result.fields.provider_module,f.target);
  assert.equal(result.custody_verified,true);
  assert.equal(result.authority_granted,false);
  assert.equal(result.provider_effect,false);
  assert.equal(result.effect_authority,false);
});

test('SDK refuses identity substitution even after verifier process exits zero',async t=>{
  const f=fixture(t,{mode:'identity'});
  await assert.rejects(
    withPath(f.bin,()=>readVerifiedInstallerDependencyBinding(request(f))),
    /INSTALLER_DEPENDENCY_RESULT_UNVERIFIED/,
  );
});

test('SDK refuses verifier nonzero result and never falls back to receipt-shaped caller data',async t=>{
  const f=fixture(t,{mode:'exit'});
  await assert.rejects(
    withPath(f.bin,()=>readVerifiedInstallerDependencyBinding(request(f))),
    /INSTALLER_DEPENDENCY_VERIFICATION_REFUSED/,
  );
});

test('SDK requires absolute receipt path and exact generation syntax before process execution',async()=>{
  await assert.rejects(readVerifiedInstallerDependencyBinding({
    binding_receipt_path:'relative.json',expected_dependency_id:'provider-runtime',
    expected_owner_repo:'owner/provider',expected_generation:'a'.repeat(40),
  }),/INSTALLER_DEPENDENCY_RECEIPT_PATH_NOT_ABSOLUTE/);
  await assert.rejects(readVerifiedInstallerDependencyBinding({
    binding_receipt_path:'/tmp/binding.json',expected_dependency_id:'provider-runtime',
    expected_owner_repo:'owner/provider',expected_generation:'not-a-generation',
  }),/INSTALLER_DEPENDENCY_GENERATION_INVALID/);
});

test('verified module import reopens Installer custody after import',async t=>{
  const f=fixture(t);
  const calls=path.join(f.root,'calls.txt');
  const script=path.join(f.bin,'xi-io-installer');
  fs.writeFileSync(script,`#!/usr/bin/env node
const fs=require('node:fs');
const args=process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)},'1\\n');
const receipt=args[1];
process.stdout.write(JSON.stringify({
 schema:'xiio.installer-dependency-binding-receipt/v1',state:'VERIFIED',
 dependency_id:'provider-runtime',owner_repo:'owner/provider',accepted_generation:'a'.repeat(40),
 binding_receipt_path:receipt,
 runtime_exports:{provider_module:{destination_scope:'xdg_data',destination:'xi-io/provider/provider.mjs',sha256:'b'.repeat(64),mode:'0644'}},
 fields:{provider_module:${JSON.stringify(f.target)}},provider_effect:false,effect_authority:false,custody_verified:true
}));
`,{mode:0o755});
  const result=await withPath(f.bin,()=>importVerifiedInstallerDependencyModule({...request(f),export_name:'provider_module'}));
  assert.equal(result.schema,'xiio.sdk.installer-dependency-module-import/v1');
  assert.equal(result.state,'VERIFIED');
  assert.equal(result.module.x,1);
  assert.equal(result.module_path,f.target);
  assert.equal(result.module_sha256,'b'.repeat(64));
  assert.equal(result.authority_granted,false);
  assert.equal(fs.readFileSync(calls,'utf8').trim().split(/\n/).length,2);
});

test('module import refuses if Installer projection changes across import boundary',async t=>{
  const f=fixture(t);
  const calls=path.join(f.root,'calls.txt');
  const script=path.join(f.bin,'xi-io-installer');
  fs.writeFileSync(script,`#!/usr/bin/env node
const fs=require('node:fs');
const args=process.argv.slice(2),receipt=args[1];
let n=0;try{n=Number(fs.readFileSync(${JSON.stringify(calls)},'utf8'))||0}catch{}
n++;fs.writeFileSync(${JSON.stringify(calls)},String(n));
process.stdout.write(JSON.stringify({
 schema:'xiio.installer-dependency-binding-receipt/v1',state:'VERIFIED',
 dependency_id:'provider-runtime',owner_repo:'owner/provider',accepted_generation:'a'.repeat(40),
 binding_receipt_path:receipt,
 runtime_exports:{provider_module:{destination_scope:'xdg_data',destination:'xi-io/provider/provider.mjs',sha256:(n===1?'b':'c').repeat(64),mode:'0644'}},
 fields:{provider_module:${JSON.stringify(f.target)}},provider_effect:false,effect_authority:false,custody_verified:true
}));
`,{mode:0o755});
  await assert.rejects(
    withPath(f.bin,()=>importVerifiedInstallerDependencyModule({...request(f),export_name:'provider_module'})),
    /INSTALLER_DEPENDENCY_MODULE_CHANGED_DURING_IMPORT/,
  );
});
