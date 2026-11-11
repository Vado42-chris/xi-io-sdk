import assert from 'node:assert/strict';
import {prepareRegisteredPrimitiveShipment} from '../src/documents/prepare-primitive-shipment.mjs';
import {FILE_CUBE_CELLS} from '../src/documents/portable-artifact-cube.mjs';

const gen='cd0958240f2e98e6bce87979cf5e9f15e4543147';
for(const id of ['page-shell','flatplane-cube','portable-semantic-file']){
  const out=prepareRegisteredPrimitiveShipment({primitive_id:id,source_generation:gen});
  assert.equal(out.schema,'xiio.sdk.registered-primitive-shipment-preparation/v1');
  assert.equal(out.primitive_id,id);
  assert.equal(out.cube.denominator,10);
  assert.deepEqual(out.cube.cells.map(x=>x.id),FILE_CUBE_CELLS);
  assert.equal(out.cube.cells[0].state,'PASS');
  assert.equal(out.cube.cells[1].state,'PASS');
  assert.equal(out.cube.cells[2].state,'PASS');
  assert.equal(out.cube.cells[3].state,'PASS');
  assert.equal(out.cube.first_red.id,'F05_HEX_CURRENTNESS');
  assert.equal(out.ready_to_ship,false);
  assert.equal(out.effect_authority,0);
}
assert.throws(
  ()=>prepareRegisteredPrimitiveShipment({primitive_id:'invented-primitive',source_generation:gen}),
  /PRIMITIVE_NOT_REGISTERED/
);



// A prepared manifest and its cube must describe the same detached generation.
const mutableCustody={state:'UNVERIFIED',nested:{ref:'synthetic:original'}};
const preparedSnapshot=prepareRegisteredPrimitiveShipment({primitive_id:'page-shell',source_generation:gen,bins_custody:mutableCustody});
mutableCustody.nested.ref='synthetic:changed';
assert.equal(preparedSnapshot.manifest.bins_custody.nested.ref,'synthetic:original');
assert.equal(Object.isFrozen(mutableCustody),false);
assert.throws(()=>{preparedSnapshot.manifest.file.source_bindings[0].generation='forged';},TypeError);
assert.throws(()=>{preparedSnapshot.missing_cells[0].state='PASS';},TypeError);
const cyclicCustody={state:'UNVERIFIED'};cyclicCustody.self=cyclicCustody;
const cyclicSnapshot=prepareRegisteredPrimitiveShipment({primitive_id:'page-shell',source_generation:gen,bins_custody:cyclicCustody});
assert.notEqual(cyclicSnapshot.manifest.bins_custody,cyclicCustody);
assert.equal(cyclicSnapshot.manifest.bins_custody.self,cyclicSnapshot.manifest.bins_custody);
assert.equal(Object.isFrozen(cyclicSnapshot.manifest.bins_custody),true);
assert.equal(Object.isFrozen(cyclicCustody),false);

console.log(JSON.stringify({
  schema:'xiio.sdk.prepare-primitive-shipment-check/v1',
  state:'PASS',
  primitive_families:3,
  denominator:10,
  auto_filled_pass_cells:4,
  first_machine_gap:'F05_HEX_CURRENTNESS',
  false_green:0,
  effect_authority:0
},null,2));
