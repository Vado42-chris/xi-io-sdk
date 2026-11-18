import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const CONTRACT_URL=new URL('../../contracts/framework/universal-primitive-denominator.v1.json',import.meta.url);
const PROVENANCE_URL=new URL('../../contracts/framework/universal-primitive-denominator.provenance.json',import.meta.url);

const fail=code=>{throw new Error(code);};
const freezeList=value=>Object.freeze([...value]);
const freezeFamilies=value=>Object.freeze(Object.fromEntries(
  Object.entries(value).map(([family,types])=>[family,freezeList(types)])
));

export function bindUniversalPrimitiveContract(contractBytes,provenanceInput){
  const raw=Buffer.isBuffer(contractBytes)?contractBytes:Buffer.from(contractBytes);
  const provenance=structuredClone(provenanceInput);
  const parsed=JSON.parse(raw.toString('utf8'));
  const fileSha256=createHash('sha256').update(raw).digest('hex');
  const semanticSha256=createHash('sha256').update(JSON.stringify(parsed)).digest('hex');

  if(provenance?.schema!=='xiio.sdk.materialized-framework-contract/v1')
    fail('PRIMITIVE_CONTRACT_PROVENANCE_SCHEMA_INVALID');
  if(provenance?.framework_repo!=='Vado42-chris/xi-io.net'||provenance?.framework_pr!==1672)
    fail('PRIMITIVE_CONTRACT_PROVENANCE_OWNER_INVALID');
  if(provenance?.framework_path!=='standards/primitives/universal-primitive-denominator.v1.json')
    fail('PRIMITIVE_CONTRACT_PROVENANCE_PATH_INVALID');
  if(parsed?.schema!==provenance.contract_schema||parsed?.version!==provenance.contract_version)
    fail('PRIMITIVE_CONTRACT_SCHEMA_VERSION_MISMATCH');
  if(fileSha256!==provenance.file_sha256)
    fail('PRIMITIVE_CONTRACT_FILE_DIGEST_MISMATCH');
  if(semanticSha256!==provenance.semantic_json_sha256)
    fail('PRIMITIVE_CONTRACT_SEMANTIC_DIGEST_MISMATCH');
  if(parsed?.schema!=='xiio.universal-primitive-denominator/v1'||
     parsed?.id!=='XIIO_UNIVERSAL_PRIMITIVE_DENOMINATOR'||parsed?.version!==1)
    fail('PRIMITIVE_CONTRACT_IDENTITY_INVALID');

  return Object.freeze({
    schema:'xiio.sdk.universal-primitive-contract-binding/v2',
    framework_contract_ref:`${provenance.framework_repo}@${provenance.framework_generation}:${provenance.framework_path}`,
    framework_pr:provenance.framework_pr,
    framework_generation:provenance.framework_generation,
    framework_contract_blob_sha:provenance.framework_blob_sha,
    framework_contract_schema:parsed.schema,
    framework_contract_version:parsed.version,
    framework_contract_file_sha256:fileSha256,
    framework_contract_semantic_sha256:semanticSha256,
    source_state:provenance.state,
    accepted_generation:provenance.accepted_generation===true,
    required_fields:freezeList(parsed.required_fields),
    semantic_families:freezeFamilies(parsed.families),
    structural_operations:freezeList(parsed.structural_operations),
    hard:freezeList(parsed.hard||[]),
  });
}

const raw=readFileSync(CONTRACT_URL);
const provenance=JSON.parse(readFileSync(PROVENANCE_URL,'utf8'));
export const UNIVERSAL_PRIMITIVE_CONTRACT=bindUniversalPrimitiveContract(raw,provenance);

const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const nonemptyString=value=>typeof value==='string'&&value.trim().length>0&&value===value.trim();

const SEMANTIC_TYPES=Object.freeze([
  ...new Set(Object.values(UNIVERSAL_PRIMITIVE_CONTRACT.semantic_families).flat()),
]);
const SEMANTIC_SET=new Set(SEMANTIC_TYPES);
const OPERATION_SET=new Set(UNIVERSAL_PRIMITIVE_CONTRACT.structural_operations);

export function validatePrimitiveAgainstUniversalContract(primitive){
  const refuse=(first_red,detail)=>Object.freeze({ok:false,first_red,detail});
  if(!plain(primitive))return refuse('PRIMITIVE_REQUIRED_FIELDS','primitive must be object');
  for(const field of UNIVERSAL_PRIMITIVE_CONTRACT.required_fields){
    if(!own(primitive,field))return refuse('PRIMITIVE_REQUIRED_FIELDS',`missing required field:${field}`);
  }
  if(!nonemptyString(primitive.identity))return refuse('PRIMITIVE_IDENTITY','identity must be one trimmed non-empty string');
  if(!nonemptyString(primitive.semantic_type)||!SEMANTIC_SET.has(primitive.semantic_type))
    return refuse('PRIMITIVE_SEMANTIC_TYPE',`semantic_type not declared:${String(primitive.semantic_type??'')}`);
  if(!plain(primitive.coordinates))return refuse('PRIMITIVE_COORDINATES','coordinates must be object');
  if(!Array.isArray(primitive.relationships))return refuse('PRIMITIVE_RELATIONSHIPS','relationships must be array');
  if(!Array.isArray(primitive.operations)||primitive.operations.length===0)
    return refuse('PRIMITIVE_OPERATIONS','operations must be a non-empty array');
  if(new Set(primitive.operations).size!==primitive.operations.length)
    return refuse('PRIMITIVE_OPERATIONS','operations must be unique');
  for(const operation of primitive.operations){
    if(!nonemptyString(operation)||!OPERATION_SET.has(operation))
      return refuse('PRIMITIVE_OPERATIONS',`operation not declared:${String(operation??'')}`);
  }
  if(!plain(primitive.provenance))return refuse('PRIMITIVE_PROVENANCE','provenance must be object');
  if(!plain(primitive.authority))return refuse('PRIMITIVE_AUTHORITY','authority must be object');
  if(typeof primitive.state!=='string'||!primitive.state.trim())
    return refuse('PRIMITIVE_STATE','state must be non-empty string');
  if(!nonemptyString(primitive.version))return refuse('PRIMITIVE_VERSION','version must be non-empty string');
  if(!Array.isArray(primitive.projection))return refuse('PRIMITIVE_PROJECTION','projection must be array');
  return Object.freeze({
    ok:true,
    first_red:null,
    semantic_type:primitive.semantic_type,
    contract_ref:UNIVERSAL_PRIMITIVE_CONTRACT.framework_contract_ref,
    contract_blob_sha:UNIVERSAL_PRIMITIVE_CONTRACT.framework_contract_blob_sha,
    contract_file_sha256:UNIVERSAL_PRIMITIVE_CONTRACT.framework_contract_file_sha256,
    contract_semantic_sha256:UNIVERSAL_PRIMITIVE_CONTRACT.framework_contract_semantic_sha256,
    contract_version:UNIVERSAL_PRIMITIVE_CONTRACT.framework_contract_version,
  });
}

export const UNIVERSAL_PRIMITIVE_SEMANTIC_TYPES=SEMANTIC_TYPES;
