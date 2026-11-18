import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

import {
  UNIVERSAL_PRIMITIVE_CONTRACT,
  validatePrimitiveAgainstUniversalContract,
} from '../src/flatpack/universal-primitive-contract.mjs';

const CONTRACT_URL=new URL('../contracts/framework/universal-primitive-denominator.v1.json',import.meta.url);
const PROVENANCE_URL=new URL('../contracts/framework/universal-primitive-denominator.provenance.json',import.meta.url);
const gitBlobSha=raw=>createHash('sha1')
  .update(Buffer.concat([Buffer.from('blob '+raw.length+'\0'),raw]))
  .digest('hex');

test('materialized SDK contract is the exact claimed Framework git blob',()=>{
  const raw=readFileSync(CONTRACT_URL);
  const provenance=JSON.parse(readFileSync(PROVENANCE_URL,'utf8'));
  assert.equal(gitBlobSha(raw),provenance.framework_blob_sha);
  assert.equal(UNIVERSAL_PRIMITIVE_CONTRACT.materialized_contract_blob_sha,provenance.framework_blob_sha);
  assert.equal(UNIVERSAL_PRIMITIVE_CONTRACT.framework_generation,provenance.framework_generation);
  assert.equal(UNIVERSAL_PRIMITIVE_CONTRACT.accepted_generation,false);
  assert.equal(UNIVERSAL_PRIMITIVE_CONTRACT.source_state,'CANDIDATE_PENDING_FRAMEWORK_1178_ACCEPTANCE');
});

test('local contract-byte mutation cannot preserve Framework blob identity',()=>{
  const raw=readFileSync(CONTRACT_URL);
  const provenance=JSON.parse(readFileSync(PROVENANCE_URL,'utf8'));
  const mutated=Buffer.concat([raw,Buffer.from('\n')]);
  assert.notEqual(gitBlobSha(mutated),provenance.framework_blob_sha);
});

test('Framework API verb denominator is consumed without becoming primitive operation authority',()=>{
  assert.ok(UNIVERSAL_PRIMITIVE_CONTRACT.universal_api_verbs.includes('RETURN'));
  assert.equal(UNIVERSAL_PRIMITIVE_CONTRACT.structural_operations.includes('REDO'),false);
  const primitive={
    identity:'p:api-separation',
    semantic_type:'module',
    coordinates:{},
    relationships:[],
    operations:['SELECT'],
    provenance:{},
    authority:{},
    state:'CURRENT',
    version:'1',
    projection:[],
  };
  assert.equal(validatePrimitiveAgainstUniversalContract(primitive).ok,true);
  const wrong={...primitive,identity:'p:wrong-op',operations:['RETURN']};
  assert.equal(validatePrimitiveAgainstUniversalContract(wrong).first_red,'PRIMITIVE_OPERATIONS');
});
