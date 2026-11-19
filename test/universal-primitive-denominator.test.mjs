import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import * as denominatorModule from '../src/flatpack/universal-primitive-denominator.mjs';
import {bindSyntheticFrameworkDenominatorThroughInstaller} from './helpers/verified-framework-denominator-fixture.mjs';

const synthetic=Object.freeze({
  schema:'xiio.universal-primitive-denominator/v1',
  id:'XIIO_UNIVERSAL_PRIMITIVE_DENOMINATOR',
  version:1,
  purpose:'TEST_ONLY_SYNTHETIC_DENOMINATOR',
  required_fields:['identity','semantic_type','coordinates','relationships','operations','provenance','authority','state','version','projection'],
  families:{fixture:['heading','image','paragraph','class']},
  structural_operations:['SELECT','INSPECT','MOVE','RESIZE','TRANSFORM','DUPLICATE','DELETE'],
  universal_api_verbs:['IDENTIFY','READ','RETURN'],
  hard:['TEST_ONLY_NOT_FRAMEWORK_AUTHORITY'],
});

test('synthetic denominator shape validates without claiming Framework custody',()=>{
  assert.equal(denominatorModule.validateUniversalPrimitiveDenominatorContract(synthetic).version,1);
});

test('missing or duplicate universal API verbs refuse denominator shape',()=>{
  const missing=structuredClone(synthetic);
  delete missing.universal_api_verbs;
  assert.throws(()=>denominatorModule.validateUniversalPrimitiveDenominatorContract(missing),/PRIMITIVE_DENOMINATOR_API_VERBS_INVALID/);
  const duplicate=structuredClone(synthetic);
  duplicate.universal_api_verbs.push('RETURN');
  assert.throws(()=>denominatorModule.validateUniversalPrimitiveDenominatorContract(duplicate),/PRIMITIVE_DENOMINATOR_API_VERBS_INVALID/);
});

test('raw caller binding API is not exported',()=>{
  assert.equal(denominatorModule.bindUniversalPrimitiveDenominator,undefined);
});


test('verified export name and bytes cannot substitute a foreign runtime destination',async()=>{
  await assert.rejects(
    bindSyntheticFrameworkDenominatorThroughInstaller(synthetic,{
      destination:'xi-io/framework/runtime/foreign/universal-primitive-denominator.v1.json',
    }),
    /PRIMITIVE_DENOMINATOR_EXPORT_DESTINATION_MISMATCH/,
  );
});

test('verified export cannot substitute a foreign destination scope',async()=>{
  await assert.rejects(
    bindSyntheticFrameworkDenominatorThroughInstaller(synthetic,{destination_scope:'etc'}),
    /PRIMITIVE_DENOMINATOR_EXPORT_DESTINATION_MISMATCH/,
  );
});

await assert.rejects(
  bindSyntheticFrameworkDenominatorThroughInstaller(synthetic,{mutate_on_second_read:true}),
  /PRIMITIVE_DENOMINATOR_CHANGED_DURING_READ/,
);

const fixture=await bindSyntheticFrameworkDenominatorThroughInstaller(synthetic);
after(()=>fixture.cleanup());

test('installer-backed binding preserves verified owner generation and custody coordinates',()=>{
  const bound=denominatorModule.getUniversalPrimitiveDenominatorBinding();
  assert.equal(bound.source.owner_repo,'Vado42-chris/xi-io.net');
  assert.equal(bound.source.accepted_generation,'a'.repeat(40));
  assert.equal(bound.source.custody_verified,true);
  assert.match(bound.source.contract_sha256,/^[a-f0-9]{64}$/);
  assert.match(bound.source.installed_file_sha256,/^[a-f0-9]{64}$/);
  assert.match(bound.source.binding_sha256,/^[a-f0-9]{64}$/);
  assert.notEqual(bound.source.contract_sha256,bound.source.installed_file_sha256,'semantic and raw-file digests are distinct custody coordinates');
});

test('verified denominator still does not validate an invalid primitive instance',async()=>{
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


test('semantic type duplicated across two families refuses the denominator',()=>{
  const duplicate=structuredClone(synthetic);
  duplicate.families.second=['heading'];
  assert.throws(
    ()=>denominatorModule.validateUniversalPrimitiveDenominatorContract(duplicate),
    /PRIMITIVE_DENOMINATOR_SEMANTIC_TYPE_DUPLICATE/,
  );
});

test('denominator names must be canonical trimmed strings',()=>{
  for(const mutate of [
    value=>{value.required_fields[0]=' identity ';},
    value=>{value.structural_operations[0]=' SELECT ';},
    value=>{value.universal_api_verbs[0]=' IDENTIFY ';},
    value=>{value.families.fixture[0]=' heading ';},
    value=>{value.families[' fixture ']=value.families.fixture;delete value.families.fixture;},
  ]){
    const candidate=structuredClone(synthetic);
    mutate(candidate);
    assert.throws(
      ()=>denominatorModule.validateUniversalPrimitiveDenominatorContract(candidate),
      /PRIMITIVE_DENOMINATOR_/,
    );
  }
});

test('required field entries cannot be non-string values',()=>{
  const candidate=structuredClone(synthetic);
  candidate.required_fields[0]=42;
  assert.throws(
    ()=>denominatorModule.validateUniversalPrimitiveDenominatorContract(candidate),
    /PRIMITIVE_DENOMINATOR_REQUIRED_FIELDS_INVALID/,
  );
});
