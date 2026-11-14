import assert from 'node:assert/strict';
import {prepareExternalArtifactShipment} from '../src/documents/prepare-external-artifact-shipment.mjs';
import {FILE_CUBE_CELLS} from '../src/documents/portable-artifact-cube.mjs';

const cases=[
  {
    name:'framework-claim-atom',
    file_id:'framework.claim-atom.v1',
    artifact_role:'framework.primitive',
    source_ref:'Vado42-chris/xi-io.net#1061',
    source_generation:'9e4905a03ef8564dfd9615a66ad9bb773e2d030b',
    descriptor:{schema:'xiio.claim-atom/v1',checks:['SOURCE','OWNER','CURRENT','OBSERVER','EXECUTED','CANONICAL','AUTHORITY']}
  },
  {
    name:'framework-projection-envelope',
    file_id:'framework.projection-envelope.v1',
    artifact_role:'framework.primitive',
    source_ref:'Vado42-chris/xi-io.net#1061',
    source_generation:'9e4905a03ef8564dfd9615a66ad9bb773e2d030b',
    descriptor:{schema:'xiio.projection-envelope/v1',fields:['projection_type','generation','source_ref','subject_ref','producer_ref','payload','projection_ref']}
  },
  {
    name:'switchboard-assignment',
    file_id:'switchboard.assignment.v1',
    artifact_role:'switchboard.primitive',
    source_ref:'Vado42-chris/xi-io-Switchboard#53',
    source_generation:'92d7fe377377a9228b51958e9b09b31def98bbb4',
    descriptor:{schema:'xiio.switchboard.assignment/v1',binds:'hex_projection_ref',effect_ceiling:0}
  }
];

for(const row of cases){
  const out=prepareExternalArtifactShipment({
    file_id:row.file_id,
    artifact_role:row.artifact_role,
    source_ref:row.source_ref,
    source_generation:row.source_generation,
    descriptor:row.descriptor,
    profile_id:'json.semantic.v1'
  });
  assert.equal(out.schema,'xiio.sdk.external-artifact-shipment-preparation/v1',row.name);
  assert.equal(out.cube.denominator,10,row.name);
  assert.deepEqual(out.cube.cells.map(x=>x.id),FILE_CUBE_CELLS,row.name);
  assert.deepEqual(out.cube.cells.slice(0,4).map(x=>x.state),['PASS','PASS','PASS','PASS'],row.name);
  assert.equal(out.cube.first_red.id,'F05_HEX_CURRENTNESS',row.name);
  assert.equal(out.ready_to_ship,false,row.name);
}

assert.throws(()=>prepareExternalArtifactShipment({
  file_id:'bad',artifact_role:'external.primitive',source_ref:'repo#1',source_generation:'g1',
  descriptor:{schema:'x'},profile_id:'invented.profile'
}),/PROFILE_NOT_REGISTERED/);




// Snapshot caller data before assessing the manifest, without freezing input.
const mutableInput={file_id:'synthetic.snapshot',artifact_role:'synthetic.role',source_ref:'synthetic:source',source_generation:'g1',descriptor:{schema:'synthetic/v1',rows:[{body:'original'}]},bins_custody:{state:'UNVERIFIED',nested:{ref:'original'}}};
const preparedSnapshot=prepareExternalArtifactShipment(mutableInput);
mutableInput.descriptor.rows[0].body='changed';mutableInput.bins_custody.nested.ref='changed';
assert.equal(preparedSnapshot.manifest.file.payload.descriptor.rows[0].body,'original');
assert.equal(preparedSnapshot.manifest.bins_custody.nested.ref,'original');
assert.equal(Object.isFrozen(mutableInput.descriptor),false);
assert.throws(()=>{preparedSnapshot.manifest.file.payload.descriptor.rows[0].body='forged';},TypeError);
assert.throws(()=>{preparedSnapshot.missing_cells[0].state='PASS';},TypeError);
let descriptorReads=0;
const getterDescriptor={schema:'synthetic/v1',get body(){descriptorReads++;return 'value-'+descriptorReads;}};
const getterSnapshot=prepareExternalArtifactShipment({...mutableInput,descriptor:getterDescriptor});
assert.equal(descriptorReads,1);
assert.equal(getterSnapshot.manifest.file.payload.descriptor.body,'value-1');

let schemaReads=0;
const schemaGetter={get schema(){schemaReads++;return 'synthetic/schema-'+schemaReads;}};
const schemaSnapshot=prepareExternalArtifactShipment({...mutableInput,descriptor:schemaGetter});
assert.equal(schemaReads,1);
assert.equal(schemaSnapshot.descriptor_schema,schemaSnapshot.manifest.file.payload.descriptor.schema);

// Do not discard malformed bindings and silently report a dependency-free file.
for(const field of ['dependency_bindings','projection_refs','provider_projections']){
  for(const malformed of [{ref:'required:binding',generation:'g1'},'required:binding',false,42]){
    const result=prepareExternalArtifactShipment({...mutableInput,[field]:malformed});
    assert.equal(result.cube.cells[0].state,'FAIL',field);
    assert.equal(result.cube.first_red.first_red,'PORTABLE_SEMANTIC_FILE_INVALID',field);
    assert.deepEqual(result.manifest.file[field],malformed,field);
    assert.equal(result.ready_to_ship,false,field);
  }
  for(const omitted of [undefined,null,[]]){
    const result=prepareExternalArtifactShipment({...mutableInput,[field]:omitted});
    assert.equal(result.cube.cells[0].state,'PASS',field);
  }
}
// Accessor-backed bindings are captured once; the policy follows that snapshot.
let bindingReads=0;
const singleBinding=prepareExternalArtifactShipment({...mutableInput,
  get dependency_bindings(){bindingReads++;return bindingReads===1?[{ref:'synthetic:required',generation:'g1'}]:[];}
});
assert.equal(bindingReads,1);
assert.equal(singleBinding.manifest.file.dependency_bindings.length,1);
assert.equal(singleBinding.manifest.dependency_policy,'EXPLICIT');
assert.equal(singleBinding.cube.cells[2].count,1);
assert.equal(singleBinding.cube.cells[2].state,'PASS');

console.log(JSON.stringify({
  schema:'xiio.sdk.external-artifact-shipment-check/v1',
  state:'PASS',
  live_team_primitives:cases.length,
  f01_f04_pass:cases.length*4,
  first_common_red:'F05_HEX_CURRENTNESS',
  false_green:0,
  effect_authority:0
},null,2));
