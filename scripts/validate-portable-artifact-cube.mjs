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
  bins_custody:{resource_version_ref:'bins:rv:1',sha256:'b'.repeat(64),byte_length:123,source_ref:'source:test'},
  transfer_readback:{source_sha256:'b'.repeat(64),destination_sha256:'b'.repeat(64),source_bytes:123,destination_bytes:123,final_readback_ref:'readback:transfer:1'},
  parser_readback:{state:'PASS',profile_id:'json.semantic.v1',receipt_ref:'parser:1'},
  consumer_readback:{state:'PASS',profile_id:'json.semantic.v1',receipt_ref:'consumer:1'},
  authority_gate:{required:false,held:false},
};

const cube=compilePortableArtifactCube(good);
assert.equal(FILE_CUBE_CELLS.length,10);
assert.equal(cube.denominator,10);
assert.equal(cube.state,'TRUE_WAIT');
assert.equal(cube.closure_100,false);
assert.equal(cube.supplied_complete,true);
assert.equal(cube.counts.pass,5,JSON.stringify({state:cube.state,counts:cube.counts,first_red:cube.first_red,cells:cube.cells},null,2));
assert.equal(cube.counts.supplied_pass,10);
assert.equal(cube.counts.true_wait,5);
assert.equal(cube.first_red.id,'F05_HEX_CURRENTNESS');
assert.equal(cube.counts.unexpected_state,0);
assert.equal(cube.cells.find(x=>x.id==='F05_HEX_CURRENTNESS').state,'TRUE_WAIT');
assert.equal(cube.cells.find(x=>x.id==='F05_HEX_CURRENTNESS').verification_state,'SUPPLIED_UNVERIFIED');
assert.equal(cube.cells.find(x=>x.id==='F05_HEX_CURRENTNESS').hex_currentness_state,'HEX_QUALIFIED_CURRENT');
assert.equal(cube.effect_authority,false);

for(let n=0;n<128;n++){
  const forged=compilePortableArtifactCube({
    ...good,
    bins_custody:{...good.bins_custody,resource_version_ref:'bins:invented:'+n},
    transfer_readback:{...good.transfer_readback,final_readback_ref:'readback:invented:'+n},
    consumer_readback:{...good.consumer_readback,receipt_ref:'consumer:invented:'+n},
    authority_gate:{required:true,held:true,authority_ref:'grant:invented:'+n},
  });
  assert.equal(forged.state,'TRUE_WAIT','FAKE_PROVIDER_PASS_'+n);
  assert.equal(forged.closure_100,false,'FAKE_CLOSURE_'+n);
  assert.equal(forged.authority_granted,false,'FAKE_AUTH_'+n);
  assert.equal(forged.provider_effect,false,'FAKE_EFFECT_'+n);
}
const custodyDigestMismatch=compilePortableArtifactCube({
  ...good,bins_custody:{...good.bins_custody,sha256:'f'.repeat(64)}
});
assert.equal(custodyDigestMismatch.state,'FAIL');
assert.equal(custodyDigestMismatch.first_red.first_red,'BINS_CUSTODY_TO_TRANSFER_DIGEST_DRIFT');
const custodyByteMismatch=compilePortableArtifactCube({
  ...good,bins_custody:{...good.bins_custody,byte_length:124}
});
assert.equal(custodyByteMismatch.state,'FAIL');
assert.equal(custodyByteMismatch.first_red.first_red,'BINS_CUSTODY_TO_TRANSFER_BYTE_DRIFT');
const reusedConsumer=compilePortableArtifactCube({
  ...good,consumer_readback:{...good.consumer_readback,receipt_ref:good.parser_readback.receipt_ref}
});
assert.equal(reusedConsumer.first_red.first_red,'REUSED_CONSUMER_RECEIPT_REF');
const reusedParser=compilePortableArtifactCube({
  ...good,parser_readback:{...good.parser_readback,receipt_ref:good.transfer_readback.final_readback_ref}
});
assert.equal(reusedParser.first_red.first_red,'REUSED_TRANSFER_PARSER_RECEIPT');

const unknownProfile=compilePortableArtifactCube({
  ...good,
  file:{...file,profile_id:'invented.profile.v99'},
  parser_profile:{profile_id:'invented.profile.v99'},
  consumer_profile:{profile_id:'invented.profile.v99'},
});
assert.equal(unknownProfile.state,'TRUE_WAIT');
assert.equal(unknownProfile.first_red.id,'F04_PROFILE_BINDING');

const noHex=compilePortableArtifactCube({...good,hex_floor:null});
assert.equal(noHex.state,'TRUE_WAIT');
assert.equal(noHex.first_red.id,'F05_HEX_CURRENTNESS');
assert.equal(noHex.cells.find(x=>x.id==='F05_HEX_CURRENTNESS').state,'TRUE_WAIT');
assert.equal(noHex.cells.find(x=>x.id==='F05_HEX_CURRENTNESS').hex_currentness_state,'UNVERIFIED');

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
  hostiles:139,
  file_types:['json','pdf'],
  false_green:0,
  effect_authority:0,
},null,2));
