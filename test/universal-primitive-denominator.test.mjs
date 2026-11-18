import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  bindUniversalPrimitiveDenominator,
  validateUniversalPrimitiveDenominatorContract,
} from '../src/flatpack/universal-primitive-denominator.mjs';

const synthetic=Object.freeze({
  schema:'xiio.universal-primitive-denominator/v1',
  id:'XIIO_UNIVERSAL_PRIMITIVE_DENOMINATOR',
  version:1,
  purpose:'TEST_ONLY_SYNTHETIC_DENOMINATOR',
  required_fields:['identity','semantic_type','coordinates','relationships','operations','provenance','authority','state','version','projection'],
  families:{fixture:['heading','image','paragraph']},
  structural_operations:['SELECT','INSPECT','MOVE','RESIZE','TRANSFORM','DUPLICATE','DELETE'],
  hard:['TEST_ONLY_NOT_FRAMEWORK_AUTHORITY'],
});
const sourceFor=(contract,overrides={})=>({
  owner_repo:'Vado42-chris/xi-io.net',
  dependency_id:'framework-runtime',
  export_name:'universal_primitive_denominator_contract',
  accepted_generation:'a'.repeat(40),
  contract_sha256:createHash('sha256').update(JSON.stringify(contract)).digest('hex'),
  binding_sha256:'b'.repeat(64),
  contract_path:'/synthetic/framework/universal-primitive-denominator.v1.json',
  custody_verified:true,
  ...overrides,
});

test('synthetic unit denominator validates without claiming Framework custody',()=>{
  assert.equal(validateUniversalPrimitiveDenominatorContract(synthetic).version,1);
});

test('caller-updated denominator plus stale owner digest refuses',()=>{
  const altered=structuredClone(synthetic);
  altered.families.fixture.push('made_up_type');
  assert.throws(()=>bindUniversalPrimitiveDenominator({
    contract:altered,
    source:{...sourceFor(synthetic),contract_sha256:sourceFor(synthetic).contract_sha256},
  }),/PRIMITIVE_DENOMINATOR_SHA_MISMATCH/);
});

const bound=bindUniversalPrimitiveDenominator({contract:synthetic,source:sourceFor(synthetic)});

test('internal unit binding preserves explicit owner/generation/custody coordinates',()=>{
  assert.equal(bound.source.owner_repo,'Vado42-chris/xi-io.net');
  assert.equal(bound.source.accepted_generation,'a'.repeat(40));
  assert.equal(bound.source.custody_verified,true);
});

test('bound contract still does not validate a primitive instance',async()=>{
  const mod=await import('../src/flatpack/universal-primitive.mjs');
  assert.equal(typeof mod.bindUniversalPrimitiveDenominatorFromInstaller,'function');
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
