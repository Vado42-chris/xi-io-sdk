import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readVerifiedInstallerDependencyBinding, importVerifiedInstallerDependencyModule, readVerifiedInstallerRuntimeActivation } from '../src/install/installer-dependency-binding-client.mjs';

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
 binding_sha256:'d'.repeat(64),
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
  assert.equal(result.binding_sha256,'d'.repeat(64));
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

test('SDK refuses malformed Installer binding receipt digest',async t=>{
  const f=fixture(t);
  const script=path.join(f.bin,'xi-io-installer');
  fs.writeFileSync(script,`#!/usr/bin/env node
const path=require('node:path');
const args=process.argv.slice(2),receipt=args[1],target=path.join(path.dirname(receipt),'provider.mjs');
process.stdout.write(JSON.stringify({
 schema:'xiio.installer-dependency-binding-receipt/v1',state:'VERIFIED',
 dependency_id:'provider-runtime',owner_repo:'owner/provider',accepted_generation:'a'.repeat(40),
 binding_receipt_path:receipt,binding_sha256:'not-a-digest',
 runtime_exports:{provider_module:{destination_scope:'xdg_data',destination:'xi-io/provider/provider.mjs',sha256:'b'.repeat(64),mode:'0644'}},
 fields:{provider_module:target},provider_effect:false,effect_authority:false,custody_verified:true
}));
`,{mode:0o755});
  await assert.rejects(
    withPath(f.bin,()=>readVerifiedInstallerDependencyBinding(request(f))),
    /INSTALLER_DEPENDENCY_BINDING_DIGEST_INVALID/,
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
 binding_sha256:'d'.repeat(64),
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

test('module import refuses if only Installer binding receipt digest changes',async t=>{
  const f=fixture(t);
  const script=path.join(f.bin,'xi-io-installer');
  fs.writeFileSync(script,`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),receipt=args[1],target=path.join(path.dirname(receipt),'provider.mjs'),counter=receipt+'.calls';
let n=0;try{n=Number(fs.readFileSync(counter,'utf8'))||0}catch{}
n++;fs.writeFileSync(counter,String(n));
process.stdout.write(JSON.stringify({
 schema:'xiio.installer-dependency-binding-receipt/v1',state:'VERIFIED',
 dependency_id:'provider-runtime',owner_repo:'owner/provider',accepted_generation:'a'.repeat(40),
 binding_receipt_path:receipt,binding_sha256:(n===1?'d':'e').repeat(64),
 runtime_exports:{provider_module:{destination_scope:'xdg_data',destination:'xi-io/provider/provider.mjs',sha256:'b'.repeat(64),mode:'0644'}},
 fields:{provider_module:target},provider_effect:false,effect_authority:false,custody_verified:true
}));
`,{mode:0o755});
  await assert.rejects(
    withPath(f.bin,()=>importVerifiedInstallerDependencyModule({...request(f),export_name:'provider_module'})),
    /INSTALLER_DEPENDENCY_MODULE_CHANGED_DURING_IMPORT/,
  );
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
 binding_sha256:'d'.repeat(64),
 runtime_exports:{provider_module:{destination_scope:'xdg_data',destination:'xi-io/provider/provider.mjs',sha256:(n===1?'b':'c').repeat(64),mode:'0644'}},
 fields:{provider_module:${JSON.stringify(f.target)}},provider_effect:false,effect_authority:false,custody_verified:true
}));
`,{mode:0o755});
  await assert.rejects(
    withPath(f.bin,()=>importVerifiedInstallerDependencyModule({...request(f),export_name:'provider_module'})),
    /INSTALLER_DEPENDENCY_MODULE_CHANGED_DURING_IMPORT/,
  );
});
function runtimeFixture(t,{mode='ok'}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-sdk-installer-activation-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const bin=path.join(root,'bin');fs.mkdirSync(bin);
  const receipt=path.join(root,'activation.json');fs.writeFileSync(receipt,'{}');
  const script=path.join(bin,'xi-io-installer');
  const body=mode==='exit'
    ? '#!/bin/sh\nexit 4\n'
    : `#!/usr/bin/env node
const args=process.argv.slice(2);
if(args.length!==5||args[0]!=='verify-runtime-activation')process.exit(9);
const [_,receipt,profile,product,generation]=args;
process.stdout.write(JSON.stringify({
 schema:'xiio.installer-runtime-activation-verification/v1',
 state:'VERIFIED',
 profile_id:${JSON.stringify(mode==='identity'?'profile:other':'profile:one')},
 profile_generation:generation,
 product_id:product,
 activation_receipt_path:receipt,
 activation_receipt_sha256:'f'.repeat(64),
 services:[{
  service_id:'worker:local',
  unit:'xiio-worker.service',
  health_url:'http://127.0.0.1:9911/health',
  profile_generation:generation,
  declared_component_generation:'component:g7',
  generation_readback:{
   schema:'xiio.installer-running-generation-readback/v1',
   state:'CURRENT',
   declared_generation:'component:g7',
   running_generation:${JSON.stringify(mode==='stale'?'component:g6':'component:g7')},
   generation_field:'generation',
   provider_effect:false,
   effect_authority:false
  },
  health_schema:'xiio.worker.health/v1',
  active:true
 }],
 custody_verified:true,
 provider_effect:false,
 effect_authority:false
}));
`;
  fs.writeFileSync(script,body,{mode:0o755});
  return {root,bin,receipt};
}
const activationRequest=f=>({
  activation_receipt_path:f.receipt,
  expected_profile_id:'profile:one',
  expected_product_id:'product:one',
  expected_profile_generation:'composition:g2',
});

test('SDK consumes Installer live activation verification through the shared no-shell runner',async t=>{
  const f=runtimeFixture(t);
  const result=await withPath(f.bin,()=>readVerifiedInstallerRuntimeActivation(activationRequest(f)));
  assert.equal(result.schema,'xiio.sdk.installer-runtime-activation-client/v1');
  assert.equal(result.state,'VERIFIED');
  assert.equal(result.profile_id,'profile:one');
  assert.equal(result.product_id,'product:one');
  assert.equal(result.profile_generation,'composition:g2');
  assert.equal(result.activation_receipt_sha256,'f'.repeat(64));
  assert.equal(result.services.length,1);
  assert.equal(result.services[0].service_id,'worker:local');
  assert.equal(result.services[0].health_url,'http://127.0.0.1:9911/health');
  assert.equal(result.services[0].generation_readback.running_generation,'component:g7');
  assert.equal(result.custody_verified,true);
  assert.equal(result.authority_granted,false);
  assert.equal(result.provider_effect,false);
  assert.equal(result.effect_authority,false);
});

test('SDK refuses runtime activation identity substitution after verifier exits zero',async t=>{
  const f=runtimeFixture(t,{mode:'identity'});
  await assert.rejects(
    withPath(f.bin,()=>readVerifiedInstallerRuntimeActivation(activationRequest(f))),
    /INSTALLER_RUNTIME_ACTIVATION_RESULT_UNVERIFIED/,
  );
});

test('SDK refuses stale live runtime generation after verifier exits zero',async t=>{
  const f=runtimeFixture(t,{mode:'stale'});
  await assert.rejects(
    withPath(f.bin,()=>readVerifiedInstallerRuntimeActivation(activationRequest(f))),
    /INSTALLER_RUNTIME_ACTIVATION_GENERATION_READBACK_INVALID/,
  );
});

test('SDK refuses nonzero runtime activation verification without fallback',async t=>{
  const f=runtimeFixture(t,{mode:'exit'});
  await assert.rejects(
    withPath(f.bin,()=>readVerifiedInstallerRuntimeActivation(activationRequest(f))),
    /INSTALLER_RUNTIME_ACTIVATION_VERIFICATION_REFUSED/,
  );
});

test('SDK refuses non-loopback runtime activation service projection',async t=>{
  const f=runtimeFixture(t);
  const script=path.join(f.bin,'xi-io-installer');
  fs.writeFileSync(script,`#!/usr/bin/env node
const args=process.argv.slice(2),receipt=args[1],generation=args[4];
process.stdout.write(JSON.stringify({
 schema:'xiio.installer-runtime-activation-verification/v1',state:'VERIFIED',
 profile_id:'profile:one',profile_generation:generation,product_id:'product:one',
 activation_receipt_path:receipt,activation_receipt_sha256:'f'.repeat(64),
 services:[{service_id:'worker:local',unit:'xiio-worker.service',
  health_url:'https://example.invalid/health',profile_generation:generation,
  declared_component_generation:'component:g7',
  generation_readback:{schema:'xiio.installer-running-generation-readback/v1',state:'CURRENT',
   declared_generation:'component:g7',running_generation:'component:g7',
   generation_field:'generation',provider_effect:false,effect_authority:false},
  active:true}],
 custody_verified:true,provider_effect:false,effect_authority:false
}));
`,{mode:0o755});
  await assert.rejects(
    withPath(f.bin,()=>readVerifiedInstallerRuntimeActivation(activationRequest(f))),
    /INSTALLER_RUNTIME_ACTIVATION_HEALTH_URL_INVALID/,
  );
});

test('SDK preserves Installer identifier contract while refusing malformed argv text and relative paths',async()=>{
  await assert.rejects(readVerifiedInstallerRuntimeActivation({
    activation_receipt_path:'/tmp/activation.json',
    expected_profile_id:'profile:one\nbad',
    expected_product_id:'product:one',
    expected_profile_generation:'composition:g2',
  }),/INSTALLER_RUNTIME_ACTIVATION_PROFILE_ID_REQUIRED/);
  await assert.rejects(readVerifiedInstallerRuntimeActivation({
    activation_receipt_path:'relative.json',
    expected_profile_id:'profile:one',
    expected_product_id:'product:one',
    expected_profile_generation:'composition:g2',
  }),/INSTALLER_RUNTIME_ACTIVATION_RECEIPT_PATH_NOT_ABSOLUTE/);
});