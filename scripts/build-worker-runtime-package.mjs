import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// SDK owns this executable closure; Installer owns installation and receipts.
// Producing a descriptor does not authenticate its supplied source generation.
export function buildWorkerRuntimePackage({acceptedGeneration,sourceRoot=fileURLToPath(new URL('../',import.meta.url))}={}) {
 if(typeof acceptedGeneration!=='string'||!/^[0-9a-f]{40}$/.test(acceptedGeneration))throw Error('SDK_WORKER_ACCEPTED_GENERATION_REQUIRED');
 const root=fs.realpathSync(sourceRoot);
 const closure=[['worker_connection_module','src/worker/connection.mjs'],['account_binding_module','src/identity/account-binding.mjs']];
 const payload=closure.map(([,source])=>{
  const filename=path.join(root,source),real=fs.realpathSync(filename),st=fs.lstatSync(filename);
  if(real!==filename||!st.isFile()||st.isSymbolicLink())throw Error('SDK_WORKER_SOURCE_CUSTODY_INVALID');
  const bytes=fs.readFileSync(filename);
  return {source,sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length,destination_scope:'xdg_data',destination:`xi-io/sdk-worker/${acceptedGeneration}/${source}`,mode:'0644',overwrite:'same_hash_ok'};
 });
 const manifest={schema_version:'xiio-installer-product-manifest-v1',profile_id:'sdk-worker-runtime',product_id:'sdk-worker-runtime',display_name:'XI-IO SDK worker runtime',version:acceptedGeneration,channel:'stable',fixture:false,payload};
 const descriptor={schema:'xiio.installer-dependency-descriptor/v1',product_id:manifest.product_id,dependency_id:'sdk-worker-runtime',owner_repo:'Vado42-chris/xi-io-sdk',accepted_generation:acceptedGeneration,runtime_exports:Object.fromEntries(closure.map(([field],i)=>[field,{destination_scope:payload[i].destination_scope,destination:payload[i].destination}]))};
 return {manifest,descriptor};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const generation=process.argv[2];
 process.stdout.write(JSON.stringify(buildWorkerRuntimePackage({acceptedGeneration:generation}),null,2)+'\n');
}
