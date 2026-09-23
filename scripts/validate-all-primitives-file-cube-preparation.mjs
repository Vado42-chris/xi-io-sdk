import assert from 'node:assert/strict';
import catalog from '../src/catalog/primitives.json' with {type:'json'};
import {prepareRegisteredPrimitiveShipment} from '../src/documents/prepare-primitive-shipment.mjs';
import {FILE_CUBE_CELLS} from '../src/documents/portable-artifact-cube.mjs';

const gen='cd0958240f2e98e6bce87979cf5e9f15e4543147';
const rows=[];
for(const primitive of catalog.primitives){
  const out=prepareRegisteredPrimitiveShipment({primitive_id:primitive.id,source_generation:gen});
  assert.equal(out.cube.denominator,10,primitive.id);
  assert.deepEqual(out.cube.cells.map(x=>x.id),FILE_CUBE_CELLS,primitive.id);
  assert.deepEqual(out.cube.cells.slice(0,4).map(x=>x.state),['PASS','PASS','PASS','PASS'],primitive.id);
  assert.equal(out.cube.first_red.id,'F05_HEX_CURRENTNESS',primitive.id);
  assert.equal(out.ready_to_ship,false,primitive.id);
  rows.push({
    primitive_id:primitive.id,
    family:primitive.family,
    f01_f04_pass:4,
    first_red:out.cube.first_red.id
  });
}
assert.equal(rows.length,catalog.primitives.length);
console.log(JSON.stringify({
  schema:'xiio.sdk.all-primitives-file-cube-preparation/v1',
  state:'PASS',
  denominator:rows.length,
  prepared:rows.length,
  f01_f04_pass:rows.length*4,
  first_common_red:'F05_HEX_CURRENTNESS',
  false_green:0,
  rows,
  effect_authority:0
},null,2));
