import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const INSTALLER_DEPENDENCY_BINDING_CLIENT_SCHEMA='xiio.sdk.installer-dependency-binding-client/v1';
const REF=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const GENERATION=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MAX_OUTPUT_BYTES=256*1024;

function fail(code){
  const error=new TypeError(code);
  error.code=code;
  throw error;
}
function text(value,code,max=512){
  if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>max||/[\r\n\0]/.test(value))fail(code);
  return value;
}
function object(value,code){
  if(!value||typeof value!=='object'||Array.isArray(value))fail(code);
  const descriptors=Object.getOwnPropertyDescriptors(value);
  for(const key of Reflect.ownKeys(descriptors)){
    if(typeof key!=='string'||!Object.hasOwn(descriptors[key],'value'))fail(code);
  }
  return value;
}
function stableProjection(value,{dependencyId,ownerRepo,generation}){
  const row=object(value,'INSTALLER_DEPENDENCY_RESULT_INVALID');
  if(row.schema!=='xiio.installer-dependency-binding-receipt/v1'||
     row.state!=='VERIFIED'||row.custody_verified!==true||
     row.dependency_id!==dependencyId||row.owner_repo!==ownerRepo||
     row.accepted_generation!==generation||
     row.provider_effect!==false||row.effect_authority!==false){
    fail('INSTALLER_DEPENDENCY_RESULT_UNVERIFIED');
  }
  if(typeof row.binding_sha256!=='string'||!/^[0-9a-f]{64}$/.test(row.binding_sha256))fail('INSTALLER_DEPENDENCY_BINDING_DIGEST_INVALID');
  const fields=object(row.fields,'INSTALLER_DEPENDENCY_FIELDS_INVALID');
  const exports=object(row.runtime_exports,'INSTALLER_DEPENDENCY_EXPORTS_INVALID');
  const fieldKeys=Object.keys(fields).sort(),exportKeys=Object.keys(exports).sort();
  if(!fieldKeys.length||fieldKeys.join('\0')!==exportKeys.join('\0'))fail('INSTALLER_DEPENDENCY_EXPORT_FIELDS_MISMATCH');
  const outFields={};
  const outExports={};
  for(const name of fieldKeys){
    if(!REF.test(name))fail('INSTALLER_DEPENDENCY_EXPORT_NAME_INVALID');
    const target=text(fields[name],'INSTALLER_DEPENDENCY_EXPORT_PATH_INVALID',4096);
    if(!path.isAbsolute(target))fail('INSTALLER_DEPENDENCY_EXPORT_PATH_INVALID');
    const spec=object(exports[name],'INSTALLER_DEPENDENCY_EXPORT_METADATA_INVALID');
    if(typeof spec.sha256!=='string'||!/^[0-9a-f]{64}$/.test(spec.sha256)||
       typeof spec.mode!=='string'||!/^0[0-7]{3}$/.test(spec.mode)||
       typeof spec.destination_scope!=='string'||typeof spec.destination!=='string'){
      fail('INSTALLER_DEPENDENCY_EXPORT_METADATA_INVALID');
    }
    outFields[name]=target;
    outExports[name]=Object.freeze({
      destination_scope:spec.destination_scope,
      destination:spec.destination,
      sha256:spec.sha256,
      mode:spec.mode,
    });
  }
  return Object.freeze({
    schema:INSTALLER_DEPENDENCY_BINDING_CLIENT_SCHEMA,
    state:'VERIFIED',
    dependency_id:dependencyId,
    owner_repo:ownerRepo,
    accepted_generation:generation,
    binding_receipt_path:text(row.binding_receipt_path,'INSTALLER_DEPENDENCY_RECEIPT_PATH_INVALID',4096),
    binding_sha256:row.binding_sha256,
    fields:Object.freeze(outFields),
    runtime_exports:Object.freeze(outExports),
    custody_verified:true,
    authority_granted:false,
    provider_effect:false,
    effect_authority:false,
  });
}

export async function readVerifiedInstallerDependencyBinding({
  binding_receipt_path,
  expected_dependency_id,
  expected_owner_repo,
  expected_generation,
  timeout_ms=15000,
}={}){
  const receipt=text(binding_receipt_path,'INSTALLER_DEPENDENCY_RECEIPT_PATH_REQUIRED',4096);
  if(!path.isAbsolute(receipt))fail('INSTALLER_DEPENDENCY_RECEIPT_PATH_NOT_ABSOLUTE');
  const dependencyId=text(expected_dependency_id,'INSTALLER_DEPENDENCY_ID_REQUIRED',128);
  if(!REF.test(dependencyId))fail('INSTALLER_DEPENDENCY_ID_INVALID');
  const ownerRepo=text(expected_owner_repo,'INSTALLER_DEPENDENCY_OWNER_REQUIRED',256);
  if(!REPO.test(ownerRepo))fail('INSTALLER_DEPENDENCY_OWNER_INVALID');
  const generation=text(expected_generation,'INSTALLER_DEPENDENCY_GENERATION_REQUIRED',64);
  if(!GENERATION.test(generation))fail('INSTALLER_DEPENDENCY_GENERATION_INVALID');
  if(!Number.isSafeInteger(timeout_ms)||timeout_ms<1000||timeout_ms>60000)fail('INSTALLER_DEPENDENCY_TIMEOUT_INVALID');

  const args=[
    'verify-dependency-binding',
    receipt,
    dependencyId,
    ownerRepo,
    generation,
  ];
  const result=await new Promise((resolve,reject)=>{
    const child=spawn('xi-io-installer',args,{shell:false,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',bytes=0,settled=false;
    const finish=(error,value)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      if(error)reject(error);else resolve(value);
    };
    const consume=(chunk,kind)=>{
      bytes+=chunk.length;
      if(bytes>MAX_OUTPUT_BYTES){
        child.kill('SIGKILL');
        finish(Object.assign(new Error('INSTALLER_DEPENDENCY_OUTPUT_TOO_LARGE'),{code:'INSTALLER_DEPENDENCY_OUTPUT_TOO_LARGE'}));
        return;
      }
      if(kind==='stdout')stdout+=chunk.toString('utf8');else stderr+=chunk.toString('utf8');
    };
    child.stdout.on('data',chunk=>consume(chunk,'stdout'));
    child.stderr.on('data',chunk=>consume(chunk,'stderr'));
    child.once('error',()=>finish(Object.assign(new Error('INSTALLER_DEPENDENCY_VERIFIER_UNAVAILABLE'),{code:'INSTALLER_DEPENDENCY_VERIFIER_UNAVAILABLE'})));
    child.once('close',code=>{
      if(code!==0){
        const error=new Error('INSTALLER_DEPENDENCY_VERIFICATION_REFUSED');
        error.code='INSTALLER_DEPENDENCY_VERIFICATION_REFUSED';
        error.exit_code=code;
        error.stderr=stderr.slice(0,4096);
        return finish(error);
      }
      finish(null,{stdout,stderr});
    });
    const timer=setTimeout(()=>{
      child.kill('SIGKILL');
      finish(Object.assign(new Error('INSTALLER_DEPENDENCY_VERIFICATION_TIMEOUT'),{code:'INSTALLER_DEPENDENCY_VERIFICATION_TIMEOUT'}));
    },timeout_ms);
  });

  let parsed;
  try{parsed=JSON.parse(result.stdout)}
  catch{fail('INSTALLER_DEPENDENCY_VERIFIER_JSON_INVALID')}
  return stableProjection(parsed,{dependencyId,ownerRepo,generation});
}

function sameExport(left,right,name){
  return left?.fields?.[name]===right?.fields?.[name]
    && left?.runtime_exports?.[name]?.sha256===right?.runtime_exports?.[name]?.sha256
    && left?.runtime_exports?.[name]?.mode===right?.runtime_exports?.[name]?.mode
    && left?.runtime_exports?.[name]?.destination_scope===right?.runtime_exports?.[name]?.destination_scope
    && left?.runtime_exports?.[name]?.destination===right?.runtime_exports?.[name]?.destination;
}

export async function importVerifiedInstallerDependencyModule({
  binding_receipt_path,
  expected_dependency_id,
  expected_owner_repo,
  expected_generation,
  export_name,
  timeout_ms=15000,
}={}){
  const name=text(export_name,'INSTALLER_DEPENDENCY_EXPORT_NAME_REQUIRED',128);
  if(!REF.test(name))fail('INSTALLER_DEPENDENCY_EXPORT_NAME_INVALID');
  const input={binding_receipt_path,expected_dependency_id,expected_owner_repo,expected_generation,timeout_ms};
  const before=await readVerifiedInstallerDependencyBinding(input);
  const modulePath=before.fields[name];
  const metadata=before.runtime_exports[name];
  if(typeof modulePath!=='string'||!metadata)fail('INSTALLER_DEPENDENCY_EXPORT_UNBOUND');
  let loaded;
  try{
    loaded=await import(`${pathToFileURL(modulePath).href}?sha256=${metadata.sha256}`);
  }catch{
    fail('INSTALLER_DEPENDENCY_MODULE_IMPORT_FAILED');
  }
  const after=await readVerifiedInstallerDependencyBinding(input);
  if(before.dependency_id!==after.dependency_id||
     before.owner_repo!==after.owner_repo||
     before.accepted_generation!==after.accepted_generation||
     before.binding_receipt_path!==after.binding_receipt_path||
     before.binding_sha256!==after.binding_sha256||
     !sameExport(before,after,name)){
    fail('INSTALLER_DEPENDENCY_MODULE_CHANGED_DURING_IMPORT');
  }
  return Object.freeze({
    schema:'xiio.sdk.installer-dependency-module-import/v1',
    state:'VERIFIED',
    dependency_id:after.dependency_id,
    owner_repo:after.owner_repo,
    accepted_generation:after.accepted_generation,
    export_name:name,
    module_path:after.fields[name],
    module_sha256:after.runtime_exports[name].sha256,
    module:loaded,
    custody_verified:true,
    authority_granted:false,
    provider_effect:false,
    effect_authority:false,
  });
}