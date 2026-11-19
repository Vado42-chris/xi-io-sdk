import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {
  readVerifiedInstallerDependencyBinding,
} from '../install/installer-dependency-binding-client.mjs';

const REF=/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/;
const GENERATION=/^[0-9a-f]{40}$/;
const CANONICAL_EXPORT_NAME='universal_primitive_denominator_contract';
const CANONICAL_DESTINATION_SCOPE='xdg_data';
const CANONICAL_DESTINATION='xi-io/framework/runtime/primitives/universal-primitive-denominator.v1.json';
let activeBinding=null;

const fail=(code)=>{const error=new TypeError(code);error.code=code;throw error;};
const text=(v,code)=>{const s=String(v??'').trim();if(!s||/[\r\n\0]/.test(s))fail(code);return s;};
const plain=(v,code)=>{if(!v||typeof v!=='object'||Array.isArray(v))fail(code);return v;};
const deepFreeze=(value)=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value))deepFreeze(child);
  }
  return value;
};

export function validateUniversalPrimitiveDenominatorContract(value){
  const row=plain(value,'PRIMITIVE_DENOMINATOR_INVALID');
  if(row.schema!=='xiio.universal-primitive-denominator/v1'||
     row.id!=='XIIO_UNIVERSAL_PRIMITIVE_DENOMINATOR'||
     row.version!==1) fail('PRIMITIVE_DENOMINATOR_IDENTITY_INVALID');
  if(!Array.isArray(row.required_fields)||!row.required_fields.length||
     new Set(row.required_fields).size!==row.required_fields.length||
     row.required_fields.some(field=>typeof field!=='string'||!field.trim()||field!==field.trim()))
    fail('PRIMITIVE_DENOMINATOR_REQUIRED_FIELDS_INVALID');
  const families=plain(row.families,'PRIMITIVE_DENOMINATOR_FAMILIES_INVALID');
  const familyKeys=Object.keys(families);
  if(!familyKeys.length||new Set(familyKeys).size!==familyKeys.length||
     familyKeys.some(key=>!key.trim()||key!==key.trim()))
    fail('PRIMITIVE_DENOMINATOR_FAMILIES_INVALID');
  const seenSemanticTypes=new Set();
  for(const key of familyKeys){
    const members=families[key];
    if(!Array.isArray(members)||!members.length||new Set(members).size!==members.length||
       members.some(member=>typeof member!=='string'||!member.trim()||member!==member.trim()))
      fail('PRIMITIVE_DENOMINATOR_FAMILY_INVALID');
    for(const member of members){
      if(seenSemanticTypes.has(member))fail('PRIMITIVE_DENOMINATOR_SEMANTIC_TYPE_DUPLICATE');
      seenSemanticTypes.add(member);
    }
  }
  if(!Array.isArray(row.structural_operations)||!row.structural_operations.length||
     new Set(row.structural_operations).size!==row.structural_operations.length||
     row.structural_operations.some(op=>typeof op!=='string'||!op.trim()||op!==op.trim()))
    fail('PRIMITIVE_DENOMINATOR_OPERATIONS_INVALID');
  if(!Array.isArray(row.universal_api_verbs)||!row.universal_api_verbs.length||
     new Set(row.universal_api_verbs).size!==row.universal_api_verbs.length||
     row.universal_api_verbs.some(verb=>typeof verb!=='string'||!verb.trim()||verb!==verb.trim()))
    fail('PRIMITIVE_DENOMINATOR_API_VERBS_INVALID');
  return row;
}

function bindUniversalPrimitiveDenominator({contract,source}={}){
  const denominator=validateUniversalPrimitiveDenominatorContract(contract);
  const provenance=plain(source,'PRIMITIVE_DENOMINATOR_SOURCE_REQUIRED');
  const acceptedGeneration=text(provenance.accepted_generation,'PRIMITIVE_DENOMINATOR_ACCEPTED_GENERATION_REQUIRED');
  if(!GENERATION.test(acceptedGeneration))fail('PRIMITIVE_DENOMINATOR_ACCEPTED_GENERATION_INVALID');
  if(provenance.owner_repo!=='Vado42-chris/xi-io.net'||
     provenance.dependency_id!=='framework-runtime'||
     provenance.export_name!=='universal_primitive_denominator_contract'||
     provenance.custody_verified!==true) fail('PRIMITIVE_DENOMINATOR_SOURCE_UNVERIFIED');
  const contractSha=createHash('sha256').update(JSON.stringify(denominator)).digest('hex');
  if(contractSha!==text(provenance.contract_sha256,'PRIMITIVE_DENOMINATOR_SHA_REQUIRED'))
    fail('PRIMITIVE_DENOMINATOR_SHA_MISMATCH');
  const next=deepFreeze({
    denominator:structuredClone(denominator),
    source:{
      schema:'xiio.sdk.universal-primitive-denominator-binding/v1',
      owner_repo:provenance.owner_repo,
      dependency_id:provenance.dependency_id,
      export_name:provenance.export_name,
      accepted_generation:acceptedGeneration,
      contract_ref:'Vado42-chris/xi-io.net:standards/primitives/universal-primitive-denominator.v1.json',
      contract_sha256:contractSha,
      installed_file_sha256:text(provenance.installed_file_sha256,'PRIMITIVE_DENOMINATOR_INSTALLED_FILE_SHA_REQUIRED'),
      binding_sha256:text(provenance.binding_sha256,'PRIMITIVE_DENOMINATOR_BINDING_SHA_REQUIRED'),
      contract_path:text(provenance.contract_path,'PRIMITIVE_DENOMINATOR_CONTRACT_PATH_REQUIRED'),
      custody_verified:true,
      authority_granted:false,
      provider_effect:false,
      effect_authority:false,
    },
  });
  if(activeBinding){
    if(activeBinding.source.accepted_generation!==next.source.accepted_generation||
       activeBinding.source.contract_sha256!==next.source.contract_sha256||
       activeBinding.source.installed_file_sha256!==next.source.installed_file_sha256||
       activeBinding.source.binding_sha256!==next.source.binding_sha256)
      fail('PRIMITIVE_DENOMINATOR_REBIND_REFUSED');
    return activeBinding;
  }
  activeBinding=next;
  return activeBinding;
}

export function getUniversalPrimitiveDenominatorBinding(){
  if(!activeBinding)fail('PRIMITIVE_DENOMINATOR_UNBOUND');
  return activeBinding;
}

export async function bindUniversalPrimitiveDenominatorFromInstaller({
  binding_receipt_path,
  expected_framework_generation,
  timeout_ms=15000,
}={}){
  const expectedGeneration=text(expected_framework_generation,'PRIMITIVE_DENOMINATOR_ACCEPTED_GENERATION_REQUIRED');
  const input={
    binding_receipt_path,
    expected_dependency_id:'framework-runtime',
    expected_owner_repo:'Vado42-chris/xi-io.net',
    expected_generation:expectedGeneration,
    timeout_ms,
  };
  const before=await readVerifiedInstallerDependencyBinding(input);
  const exportName=CANONICAL_EXPORT_NAME;
  const contractPath=before.fields[exportName];
  const metadata=before.runtime_exports[exportName];
  if(typeof contractPath!=='string'||!metadata)fail('PRIMITIVE_DENOMINATOR_EXPORT_UNBOUND');
  if(metadata.destination_scope!==CANONICAL_DESTINATION_SCOPE||metadata.destination!==CANONICAL_DESTINATION)
    fail('PRIMITIVE_DENOMINATOR_EXPORT_DESTINATION_MISMATCH');
  const bytes=await fs.readFile(contractPath);
  const fileSha=createHash('sha256').update(bytes).digest('hex');
  if(fileSha!==metadata.sha256)fail('PRIMITIVE_DENOMINATOR_INSTALLED_SHA_MISMATCH');
  let contract;
  try{contract=JSON.parse(bytes.toString('utf8'));}catch{fail('PRIMITIVE_DENOMINATOR_JSON_INVALID');}
  const semanticSha=createHash('sha256').update(JSON.stringify(validateUniversalPrimitiveDenominatorContract(contract))).digest('hex');
  const after=await readVerifiedInstallerDependencyBinding(input);
  if(before.binding_sha256!==after.binding_sha256||
     before.fields[exportName]!==after.fields[exportName]||
     before.runtime_exports[exportName]?.sha256!==after.runtime_exports[exportName]?.sha256||
     after.runtime_exports[exportName]?.destination_scope!==CANONICAL_DESTINATION_SCOPE||
     after.runtime_exports[exportName]?.destination!==CANONICAL_DESTINATION)
    fail('PRIMITIVE_DENOMINATOR_CHANGED_DURING_READ');
  const afterBytes=await fs.readFile(after.fields[exportName]);
  const afterFileSha=createHash('sha256').update(afterBytes).digest('hex');
  if(afterFileSha!==after.runtime_exports[exportName].sha256||!bytes.equals(afterBytes))
    fail('PRIMITIVE_DENOMINATOR_CHANGED_DURING_READ');
  return bindUniversalPrimitiveDenominator({
    contract,
    source:{
      owner_repo:after.owner_repo,
      dependency_id:after.dependency_id,
      export_name:exportName,
      accepted_generation:after.accepted_generation,
      contract_sha256:semanticSha,
      installed_file_sha256:after.runtime_exports[exportName].sha256,
      binding_sha256:after.binding_sha256,
      contract_path:after.fields[exportName],
      custody_verified:true,
    },
  });
}
