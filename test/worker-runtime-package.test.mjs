import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath,pathToFileURL} from 'node:url';
import {buildWorkerRuntimePackage} from '../scripts/build-worker-runtime-package.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),generation='a'.repeat(40);
test('runtime package requires explicit exact source identity',()=>{for(const v of [undefined,null,'main','', 'a'.repeat(39),'A'.repeat(40)])assert.throws(()=>buildWorkerRuntimePackage({acceptedGeneration:v}),/ACCEPTED_GENERATION_REQUIRED/);});
test('two exact exports conserve bytes and relative executable closure',async()=>{
 const {manifest,descriptor}=buildWorkerRuntimePackage({acceptedGeneration:generation});
 assert.equal(manifest.schema_version,'xiio-installer-product-manifest-v1');assert.equal(descriptor.schema,'xiio.installer-dependency-descriptor/v1');
 assert.equal(manifest.payload.length,2);assert.deepEqual(Object.keys(descriptor.runtime_exports),['worker_connection_module','account_binding_module']);
 assert.equal(Object.hasOwn(manifest,'runtime_exports'),false);assert.equal(descriptor.accepted_generation,generation);
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sdk-worker-payload-'));
 try{
  for(const row of manifest.payload){const bytes=fs.readFileSync(path.join(root,row.source));assert.equal(row.size,bytes.length);assert.equal(row.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(row.overwrite,'same_hash_ok');assert.equal(row.mode,'0644');
   const filename=path.join(temp,row.destination);fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,bytes,{mode:0o644});
   // Every current relative static import must be an explicitly custodied export.
   for(const match of bytes.toString().matchAll(/\b(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){if(!match[1].startsWith('.'))continue;const dependency=path.posix.normalize(path.posix.join(path.posix.dirname(row.source),match[1]));assert.ok(manifest.payload.some(x=>x.source===dependency),`UNCUSTODIED_IMPORT:${dependency}`);}
   assert.equal(/\bimport\s*\(/.test(bytes.toString()),false,'Dynamic import requires an explicit closure review');
  }
  const sdk=await import(pathToFileURL(path.join(temp,descriptor.runtime_exports.worker_connection_module.destination)));assert.equal(sdk.WORKER_CONNECTION_SCHEMA,'xiio.sdk.worker-connection/v1');assert.equal(sdk.normalizeLocalAgentMessage(' test ').message,'test');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('different accepted generations have disjoint installed destinations',()=>{const a=buildWorkerRuntimePackage({acceptedGeneration:generation}),b=buildWorkerRuntimePackage({acceptedGeneration:'b'.repeat(40)});assert.ok(a.manifest.payload.every(x=>!b.manifest.payload.some(y=>y.destination===x.destination)));});
test('source file symlink is refused before packaging',()=>{const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sdk-worker-link-'));try{fs.mkdirSync(path.join(temp,'src/worker'),{recursive:true});fs.symlinkSync(path.join(root,'src/worker/connection.mjs'),path.join(temp,'src/worker/connection.mjs'));assert.throws(()=>buildWorkerRuntimePackage({acceptedGeneration:generation,sourceRoot:temp}),/SOURCE_CUSTODY_INVALID/);}finally{fs.rmSync(temp,{recursive:true,force:true});}});
