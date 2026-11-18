import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH=join(HERE,'universal-primitive-denominator.v1.json');
const RAW_DENOMINATOR=readFileSync(CONTRACT_PATH);
const gitBlobSha=createHash('sha1')
  .update(Buffer.concat([Buffer.from('blob '+RAW_DENOMINATOR.length+'\0'),RAW_DENOMINATOR]))
  .digest('hex');
const rawSha256=createHash('sha256').update(RAW_DENOMINATOR).digest('hex');
const parsed=JSON.parse(RAW_DENOMINATOR);

export const UNIVERSAL_PRIMITIVE_DENOMINATOR_SOURCE=Object.freeze({
  schema:'xiio.universal-primitive-denominator-source/v1',
  framework_ref:'Vado42-chris/xi-io.net#1178:standards/primitives/universal-primitive-denominator.v1.json',
  source_state:'CANDIDATE_PENDING_FRAMEWORK_1178_ACCEPTANCE',
  framework_generation:'30ded1bac84e4f298ca2252a92d8384b2b153c7b',
  framework_blob_sha:'4c4bd9691749d83f963583022fc97fb63d2182ac',
  packaged_blob_sha:gitBlobSha,
  contract_schema:'xiio.universal-primitive-denominator/v1',
  contract_version:1,
  contract_sha256:rawSha256,
});

if(UNIVERSAL_PRIMITIVE_DENOMINATOR_SOURCE.packaged_blob_sha!==UNIVERSAL_PRIMITIVE_DENOMINATOR_SOURCE.framework_blob_sha)
  throw new Error('PRIMITIVE_DENOMINATOR_FRAMEWORK_BLOB_MISMATCH');
if(parsed?.schema!==UNIVERSAL_PRIMITIVE_DENOMINATOR_SOURCE.contract_schema||
   parsed?.version!==UNIVERSAL_PRIMITIVE_DENOMINATOR_SOURCE.contract_version)
  throw new Error('PRIMITIVE_DENOMINATOR_SCHEMA_VERSION_MISMATCH');

const freezeDeep=value=>{
  if(value&&typeof value==='object'){
    for(const child of Object.values(value))freezeDeep(child);
    Object.freeze(value);
  }
  return value;
};

export const UNIVERSAL_PRIMITIVE_DENOMINATOR=freezeDeep(parsed);

export const UNIVERSAL_PRIMITIVE_SEMANTIC_TYPES=Object.freeze(
  Object.values(UNIVERSAL_PRIMITIVE_DENOMINATOR.families).flat()
);
