import assert from 'node:assert/strict';
import {
  compileTopographyCoordinate,compileTopographyAddressSpace,resolveTopographyProjection,
  rotateTopographyProjection,topographyCanonicalKey
} from '../src/projections/topography-coordinate.mjs';

const ids={root_uuid:'5267f93e-2af8-57c8-975d-21fcbf77683e',work_uuid:'d4a4906a-80ec-54ed-aeb1-364154a486a9',coordinate_uuid:'89525696-404e-5c59-ad50-f685b2f87737'};
const base={...ids,generation_ref:'g1',path:'GOLDEN',illumination:'SOLAR',orientation:'HORIZONTAL',split:'QUAL',state:'PASS',qual_raw:{meaning:'fixture'},evidence_refs:['fixture:e'],currentness_state:'CURRENT'};
const direct=compileTopographyCoordinate({...base,movement_operation:'SOW_OUTWARD'});
const search=compileTopographyCoordinate({...base,projection_namespace:'SEARCH_OWNER_20260921',projection_label:'X_UP'});
const gs=compileTopographyCoordinate({...base,projection_namespace:'GOLDEN_SUBTERRANEAN_20260921',projection_label:'X_DOWN'});
assert.equal(search.movement_operation,'SOW_OUTWARD');
assert.equal(gs.movement_operation,'SOW_OUTWARD');
assert.equal(topographyCanonicalKey(direct),topographyCanonicalKey(search));
assert.equal(topographyCanonicalKey(direct),topographyCanonicalKey(gs));
const x42=rotateTopographyProjection(direct,{projection_namespace:'X42_TOKENS',projection_label:'>>'});
assert.equal(x42.movement_operation,'SOW_OUTWARD');
assert.equal(topographyCanonicalKey(x42),topographyCanonicalKey(direct));

const space=compileTopographyAddressSpace();
assert.equal(space.denominator,32);
assert.deepEqual(space.factors,{path:2,illumination:2,orientation:2,movement_operation:2,split:2});

assert.throws(()=>resolveTopographyProjection({projection_label:'X_UP'}),/projection_namespace_REQUIRED/);
assert.throws(()=>compileTopographyCoordinate({...base,illumination:'GOLDEN',movement_operation:'SOW_OUTWARD'}),/illumination_INVALID/);
assert.throws(()=>compileTopographyCoordinate({...base,projection_namespace:'SEARCH_OWNER_20260921',projection_label:'X_UP',movement_operation:'REAP_INWARD'}),/PROJECTION_MAPPING_MISMATCH/);
assert.throws(()=>compileTopographyCoordinate({...base,split:'QUANT',movement_operation:'SOW_OUTWARD'}),/QUANT_RAW_REQUIRED/);

let rejected=0;
for(let i=0;i<320;i++){
 const x={...base,movement_operation:i%2?'SOW_OUTWARD':'REAP_INWARD'};
 try{
  switch(i%10){
   case 0:x.path='SOLAR';break;
   case 1:x.illumination='SUBTERRANEAN';break;
   case 2:x.orientation='DIAGONAL';break;
   case 3:x.movement_operation='X_UP';break;
   case 4:x.projection_namespace='SEARCH_OWNER_20260921';x.projection_label='X_DOWN';x.movement_operation='SOW_OUTWARD';break;
   case 5:x.root_uuid='bad';break;
   case 6:x.split='QUANT';x.quant_raw=1;x.quant_unit='count';x.quant_denominator=0;break;
   case 7:x.evidence_refs=[];break;
   case 8:x.projection_namespace='UNKNOWN';x.projection_label='X_UP';delete x.movement_operation;break;
   case 9:x.custody_state='MAGIC';break;
  }
  compileTopographyCoordinate(x);
 }catch{rejected++;}
}
assert.equal(rejected,320);
console.log(JSON.stringify({
 schema:'xiio.sdk.topography-coordinate-check/v1',result:'PASS',
 canonical_address_denominator:32,hostile_denominator:320,hostile_rejected:320,false_green:0,
 projection_parity:'PASS',authority_granted:false,provider_effect:false
},null,2));
