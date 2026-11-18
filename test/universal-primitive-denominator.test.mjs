import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  UNIVERSAL_PRIMITIVE_DENOMINATOR,
  UNIVERSAL_PRIMITIVE_DENOMINATOR_SOURCE,
} from '../src/flatpack/universal-primitive-denominator.mjs';

test('SDK projection is byte-semantically bound to Framework #1178 denominator hash',()=>{
  const hash=createHash('sha256').update(JSON.stringify(UNIVERSAL_PRIMITIVE_DENOMINATOR)).digest('hex');
  assert.equal(hash,UNIVERSAL_PRIMITIVE_DENOMINATOR_SOURCE.contract_sha256);
  assert.equal(UNIVERSAL_PRIMITIVE_DENOMINATOR_SOURCE.contract_schema,UNIVERSAL_PRIMITIVE_DENOMINATOR.schema);
  assert.equal(UNIVERSAL_PRIMITIVE_DENOMINATOR_SOURCE.contract_version,UNIVERSAL_PRIMITIVE_DENOMINATOR.version);
});

test('contract hash does not validate a primitive instance',async()=>{
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
