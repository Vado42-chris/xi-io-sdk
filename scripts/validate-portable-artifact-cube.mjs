import assert from 'node:assert/strict';
import { compilePortableArtifactCube, FILE_CUBE_CELLS } from '../src/documents/portable-artifact-cube.mjs';

const payload={kind:'primitive',body:{hello:'world'}};
const file={
  file_id:'primitive.test.1',
  artifact_role:'sdk.primitive',
  semantic_generation:'sem:g1',
  profile_id:'json.semantic.v1',
  payload,
  source_bindings:[{ref:'source:test',generation:'src:g1',role:'primary'}],
  dependency_bindings:[],
  projection_refs:[],
  provider_projections:[],
};
const hexFloor={
  schema:'xiio.hex.global-floor-projection/v1',
  fleet_generation:'fleet:g1',
  subject_denominator:1,
  qualification_state:'QUALIFIED',
  source_currentness:'HEX_QUALIFIED_CURRENT',
  subjects:[{
    product_ref:'sdk.primitive',
    product_generation:'sem:g1',
    projection_ref:'sha256:subject',
    qualification_state:'QUALIFIED',
    source_currentness:'HEX_QUALIFIED_CURRENT',
    missing_punchcards:[],
    open_cells_without_punchcards:[],
  }],
  missing_punchcards:[],
  open_cells_without_punchcards:[],
  effect_authority:false,
  release_authority:false,
  billing_authority:false,
  live_authority:false,
  projection_ref:'sha256:global',
};
const good={
  cube_id:'cube:primitive.test.1',
  file,
  dependency_policy:'NONE_REQUIRED',
  parser_profile:{profile_id:'json.semantic.v1'},
  consumer_profile:{profile_id:'json.semantic.v1'},
  hex_floor:hexFloor,
  hex_subject_ref:'sdk.primitive',
  hex_subject_generation:'sem:g1',
  bins_custody:{resource_version_ref:'bins:rv:1',sha256:'a'.repeat(64),byte_length:123,source_ref:'source:test'},
  transfer_readback:{source_sha256:'b'.repeat(64),destination_sha256:'b'.repeat(64),source_bytes:123,destination_bytes:123,final_readback_ref:'readback:transfer:1'},
  parser_readback:{state:'PASS',profile_id:'json.semantic.v1',receipt_ref:'parser:1'},
  consumer_readback:{state:'PASS',profile_id:'json.semantic.v1',receipt_ref:'consumer:1'},
  authority_gate:{required:false,held:false},
};

const cube=compilePortableArtifactCube(good);
assert.equal(FILE_CUBE_CELLS.length,10);
assert.equal(cube.denominator,10);
assert.equal(cube.state,'PASS');
assert.equal(cube.closure_100,true);
assert.equal(cube.counts.pass,10);
assert.equal(cube.effect_authority,false);

const noHex=compilePortableArtifactCube({...good,hex_floor:null});
assert.equal(noHex.state,'TRUE_WAIT');
assert.equal(noHex.first_red.id,'F05_HEX_CURRENTNESS');

const noBins=compilePortableArtifactCube({...good,bins_custody:{}});
assert.equal(noBins.state,'TRUE_WAIT');
assert.equal(noBins.first_red.id,'F06_BINS_CUSTODY');

const badTransfer=compilePortableArtifactCube({...good,transfer_readback:{...good.transfer_readback,destination_sha256:'c'.repeat(64)}});
assert.equal(badTransfer.state,'FAIL');
assert.equal(badTransfer.first_red.id,'F07_TRANSFER_INTEGRITY');

const parserFail=compilePortableArtifactCube({...good,parser_readback:{state:'FAIL',profile_id:'json.semantic.v1',receipt_ref:'parser:bad'}});
assert.equal(parserFail.state,'FAIL');
assert.equal(parserFail.first_red.id,'F08_PARSER_VALIDATION');

const consumerWait=compilePortableArtifactCube({...good,consumer_readback:{}});
assert.equal(consumerWait.state,'TRUE_WAIT');
assert.equal(consumerWait.first_red.id,'F09_CONSUMER_READBACK');

const authorityWait=compilePortableArtifactCube({...good,authority_gate:{required:true,held:false,authority_ref:null}});
assert.equal(authorityWait.state,'TRUE_WAIT');
assert.equal(authorityWait.first_red.id,'F10_AUTHORITY_BOUNDARY');

const pdfProfile=compilePortableArtifactCube({
  ...good,
  file:{...file,file_id:'pdf.test.1',artifact_role:'document.pdf',profile_id:'pdf.bytes.v1'},
  parser_profile:{profile_id:'pdf.bytes.v1'},
  consumer_profile:{profile_id:'pdf.bytes.v1'},
  hex_floor:{...hexFloor,subjects:[{...hexFloor.subjects[0],product_ref:'document.pdf'}]},
  hex_subject_ref:'document.pdf',
  parser_readback:{state:'PASS',profile_id:'pdf.bytes.v1',receipt_ref:'pdf:parser:1'},
  consumer_readback:{state:'PASS',profile_id:'pdf.bytes.v1',receipt_ref:'pdf:consumer:1'},
});
assert.equal(pdfProfile.denominator,10);
assert.deepEqual(pdfProfile.cells.map(x=>x.id),FILE_CUBE_CELLS);

console.log(JSON.stringify({
  schema:'xiio.sdk.portable-artifact-cube-check/v1',
  state:'PASS',
  denominator:10,
  controls:2,
  hostiles:5,
  file_types:['json','pdf'],
  false_green:0,
  effect_authority:0,
},null,2));
