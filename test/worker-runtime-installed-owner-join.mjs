import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {fileURLToPath,pathToFileURL} from 'node:url';
const installerRoot=process.env.XIIO_TEST_INSTALLER_PYTHONPATH;
const readerPath=process.env.XIIO_TEST_FRAMEWORK_BINDING_READER;
const generation=process.env.XIIO_TEST_SDK_GENERATION;
if(!installerRoot||!readerPath||!generation)throw Error('SDK_WORKER_OWNER_TEST_INPUTS_REQUIRED');
const provenance=JSON.parse(fs.readFileSync(new URL('./worker-runtime-owner-provenance.json',import.meta.url)));
const gitBlob=p=>{const b=fs.readFileSync(p);return crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b])).digest('hex');};
assert.equal(gitBlob(readerPath),provenance.framework.blob,'Framework test source pin');
for(const [name,blob] of Object.entries(provenance.installer.files))assert.equal(gitBlob(path.join(installerRoot,'xiio_installer',name)),blob,`Installer test source pin: ${name}`);
const {reopenVerifiedDependencyBindingReceipt}=await import(pathToFileURL(path.resolve(readerPath)));
import {buildWorkerRuntimePackage} from '../scripts/build-worker-runtime-package.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'zr1-owner-custody-'));
const source=fileURLToPath(new URL('../',import.meta.url));
const rows=[['worker_connection_module','src/worker/connection.mjs'],['account_binding_module','src/identity/account-binding.mjs']];
try {
 const {manifest,descriptor}=buildWorkerRuntimePackage({acceptedGeneration:generation,sourceRoot:source});
 fs.writeFileSync(path.join(root,'descriptor.json'),JSON.stringify(descriptor));
 const manifestPath=path.join(root,'manifest.json');fs.writeFileSync(manifestPath,JSON.stringify(manifest));
 const receiptPath=path.join(root,'binding.json');
 execFileSync('python3',['-c',`from pathlib import Path\nimport sys,json\nfrom xiio_installer.manifest import load_manifest\nfrom xiio_installer.dependency_binding import bind_dependency_manifest\nr=Path(sys.argv[1]);m=load_manifest(r/'manifest.json')\nbind_dependency_manifest(m,Path(sys.argv[2]),r/'install.json',r/'binding.json',expected_dependency_id='sdk-worker-runtime',expected_owner_repo='Vado42-chris/xi-io-sdk',expected_generation=sys.argv[3],descriptor=json.loads((r/'descriptor.json').read_text()),env={'HOME':str(r/'home'),'XDG_DATA_HOME':str(r/'data'),'XDG_CONFIG_HOME':str(r/'config'),'XDG_STATE_HOME':str(r/'state'),'XDG_CACHE_HOME':str(r/'cache')})`,root,source,generation],{env:{...process.env,PYTHONPATH:installerRoot}});
 const reopen=()=>reopenVerifiedDependencyBindingReceipt({bindingReceiptPath:receiptPath,expectedDependencyId:'sdk-worker-runtime',expectedOwnerRepo:'Vado42-chris/xi-io-sdk',expectedGeneration:generation});
 const load=async()=>{const verified=reopen();return import(pathToFileURL(verified.fields.worker_connection_module));};
 const projection=reopen();assert.equal(projection.custody_verified,true);assert.equal(Object.keys(projection.fields).length,2);
 const sdk=await load();assert.equal(sdk.normalizeLocalAgentMessage(' hello ').message,'hello');console.log('PASS actual Installer materialization → Framework reopen → actual SDK import');
 for(const [name] of rows){const p=projection.fields[name],bytes=fs.readFileSync(p);fs.appendFileSync(p,'\nthrow new Error("TAMPERED_MODULE_EXECUTED");\n');await assert.rejects(load,/RUNTIME_DEPENDENCY_EXPORT_READBACK_MISMATCH/);fs.writeFileSync(p,bytes);console.log('PASS tampered '+name+' refused before import');}
 assert.throws(()=>reopenVerifiedDependencyBindingReceipt({bindingReceiptPath:receiptPath,expectedDependencyId:'sdk-worker-runtime',expectedOwnerRepo:'Vado42-chris/xi-io-sdk',expectedGeneration:'f'.repeat(40)}),/EXPECTATION_MISMATCH/);console.log('PASS wrong generation refused');
 console.log('INSTALLED_OWNER_JOIN_PASS 4/4; disposable fixture only; no Ward or product acceptance');
}finally{fs.rmSync(root,{recursive:true,force:true});}
