import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  UNIVERSAL_PRIMITIVE_DENOMINATOR,
  UNIVERSAL_PRIMITIVE_DENOMINATOR_SOURCE,
} from '../src/flatpack/universal-primitive-denominator.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH=join(HERE,'../src/flatpack/universal-primitive-denominator.v1.json');
const gitBlobSha=bytes=>createHash('sha1')
  .update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes]))
  .digest('hex');

test('SDK packaged denominator bytes are bound to the Framework #1178 blob',()=>{
  const raw=readFileSync(CONTRACT_PATH);
  assert.equal(gitBlobSha(raw),UNIVERSAL_PRIMITIVE_DENOMINATOR_SOURCE.framework_blob_sha);
  assert.equal(gitBlobSha(raw),UNIVERSAL_PRIMITIVE_DENOMINATOR_SOURCE.packaged_blob_sha);
  assert.equal(createHash('sha256').update(raw).digest('hex'),UNIVERSAL_PRIMITIVE_DENOMINATOR_SOURCE.contract_sha256);
  assert.equal(UNIVERSAL_PRIMITIVE_DENOMINATOR_SOURCE.contract_schema,UNIVERSAL_PRIMITIVE_DENOMINATOR.schema);
  assert.equal(UNIVERSAL_PRIMITIVE_DENOMINATOR_SOURCE.contract_version,UNIVERSAL_PRIMITIVE_DENOMINATOR.version);
  assert.equal(UNIVERSAL_PRIMITIVE_DENOMINATOR_SOURCE.source_state,'CANDIDATE_PENDING_FRAMEWORK_1178_ACCEPTANCE');
});

test('changing packaged denominator bytes without changing Framework blob identity is refused by custody equation',()=>{
  const raw=readFileSync(CONTRACT_PATH);
  const altered=Buffer.concat([raw,Buffer.from('\n')]);
  assert.notEqual(gitBlobSha(altered),UNIVERSAL_PRIMITIVE_DENOMINATOR_SOURCE.framework_blob_sha);
});

test('contract custody does not validate a primitive instance',async()=>{
  const mod=await import('../src/flatpack/universal-primitive.mjs');
  const primitive={
    identity:'p:x',semantic_type:'made_up_type',coordinates:{},relationships:[],
    operations:['SELECT'],provenance:{},authority:{},state:'CURRENT',version:'1',projection:[]
  };
  const doc={
    schema:'xiio.flatpack/v1',
    artifact:{artifact_ref:'artifact:x'},
    shared_flatplane:{plane_ref:'plane:x',scale:'5s',patch_refs:[]},
    local_control_patches:[],seam_equivalence:[],continuity_constraints:{adjacency:[]},
    primitives:[primitive],extrusions:[],projection_recipes:[],
    authority:{visibility:'PUBLIC',effect_ceiling:'READ_ONLY'}
  };
  const out=mod.validateUniversalArtifact(doc);
  assert.equal(out.ok,false);
  assert.equal(out.first_red,'PRIMITIVE_SEMANTIC_TYPE');
});
