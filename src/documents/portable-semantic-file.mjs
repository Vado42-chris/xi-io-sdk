import crypto from 'node:crypto';

export const PORTABLE_SEMANTIC_FILE_SCHEMA='xiio.sdk.portable-semantic-file/v1';
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const SHA=/^[a-f0-9]{64}$/;
function text(v,k,max=512){if(typeof v!=='string'||!v.trim()||v.length>max)throw new TypeError(k+'_INVALID');return v.trim();}
function id(v,k){const x=text(v,k,256);if(!ID.test(x))throw new TypeError(k+'_INVALID');return x;}
function digest(v,k){const x=text(v,k,64).toLowerCase();if(!SHA.test(x))throw new TypeError(k+'_INVALID');return x;}
function arr(v,k){if(!Array.isArray(v))throw new TypeError(k+'_INVALID');return v;}
function obj(v,k){if(!v||typeof v!=='object'||Array.isArray(v))throw new TypeError(k+'_INVALID');return v;}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
export function semanticContentDigest(payload){return crypto.createHash('sha256').update(JSON.stringify(stable(payload))).digest('hex');}
function binding(row,k){obj(row,k);return Object.freeze({ref:text(row.ref,k+'_ref',1024),generation:text(row.generation,k+'_generation',512),role:row.role?text(row.role,k+'_role',128):null});}
function projection(row,k){obj(row,k);return Object.freeze({ref:text(row.ref,k+'_ref',1024),generation:row.generation?text(row.generation,k+'_generation',512):null,kind:text(row.kind,k+'_kind',128)});}
export function PortableSemanticFile(input={}){
 const payload=obj(input.payload,'payload');
 const computed=semanticContentDigest(payload);
 const supplied=input.content_digest?digest(input.content_digest,'content_digest'):computed;
 if(supplied!==computed)throw new TypeError('CONTENT_DIGEST_MISMATCH');
 const out={
  schema:PORTABLE_SEMANTIC_FILE_SCHEMA,
  file_id:id(input.file_id,'file_id'),
  artifact_role:id(input.artifact_role,'artifact_role'),
  semantic_generation:id(input.semantic_generation,'semantic_generation'),
  content_digest:computed,
  profile_id:id(input.profile_id,'profile_id'),
  payload:Object.freeze(stable(payload)),
  source_bindings:Object.freeze(arr(input.source_bindings??[],'source_bindings').map((x,i)=>binding(x,'source_'+i))),
  dependency_bindings:Object.freeze(arr(input.dependency_bindings??[],'dependency_bindings').map((x,i)=>binding(x,'dependency_'+i))),
  projection_refs:Object.freeze(arr(input.projection_refs??[],'projection_refs').map((x,i)=>projection(x,'projection_'+i))),
  provider_projections:Object.freeze(arr(input.provider_projections??[],'provider_projections').map((x,i)=>projection(x,'provider_'+i))),
  authority_granted:false,
  effect_ceiling:'NO_EFFECT_DATA_ONLY',
  hard:Object.freeze([
   'FILE_ID!=PATH','FILE_ID!=CALLABLE_UUID','SEMANTIC_GENERATION!=PROVIDER_GENERATION',
   'SEMANTIC_PAYLOAD!=TEST_PROJECTION','PUNCHCARD!=FILE_SCHEMA','CHECKLIST!=FILE_SCHEMA',
   'FLATPLANE_CUBE!=FILE_SCHEMA','PROJECTION_CHANGE!=SEMANTIC_CHANGE',
   'PROVIDER_RENDER!=SEMANTIC_TRUTH','FILE_VALID!=PROFILE_QUALIFIED',
   'FILE_VALID!=SOURCE_CURRENT','FILE_VALID!=PUBLICATION_AUTHORITY'
  ])
 };
 return Object.freeze(out);
}
export const compilePortableSemanticFile=PortableSemanticFile;

export function validatePortableSemanticFileRoundtrip(file){
 const compiled=PortableSemanticFile(file);
 const encoded=JSON.stringify(compiled);
 const decoded=JSON.parse(encoded);
 const replay=PortableSemanticFile(decoded);
 return Object.freeze({
  schema:'xiio.sdk.portable-semantic-file-roundtrip/v1',
  pass:replay.file_id===compiled.file_id&&replay.semantic_generation===compiled.semantic_generation&&replay.content_digest===compiled.content_digest,
  file_id:compiled.file_id,semantic_generation:compiled.semantic_generation,content_digest:compiled.content_digest,effect_authority:0
 });
}
