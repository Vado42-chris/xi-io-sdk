import assert from 'node:assert/strict';
import { bindHexFloorCurrentness } from '../src/currentness/hex-floor.mjs';

function floor(overrides={}){
  return {
    schema:'xiio.hex.global-floor-projection/v1',
    fleet_generation:'fleet:1',
    subjects:[{product_ref:'product:test',product_generation:'gen:1',source_currentness:'HEX_QUALIFIED_CURRENT',missing_punchcards:[]}],
    projection_ref:'sha256:test',
    source_currentness:'HEX_QUALIFIED_CURRENT',
    missing_punchcards:[],
    effect_authority:false,
    release_authority:false,
    billing_authority:false,
    live_authority:false,
    ...overrides,
  };
}

assert.equal(bindHexFloorCurrentness(null).state,'UNVERIFIED');
assert.equal(bindHexFloorCurrentness({schema:'wrong'}).state,'UNVERIFIED');
assert.equal(
  bindHexFloorCurrentness(floor(),{subject_ref:'product:test',subject_generation:'gen:stale'}).state,
  'STALE'
);
assert.equal(
  bindHexFloorCurrentness(floor({effect_authority:true})).blocker,
  'HEX_FLOOR_AUTHORITY_INFLATION'
);
const partial=bindHexFloorCurrentness(floor({
  source_currentness:'HEX_PARTIAL_CURRENTNESS',
  subjects:[{product_ref:'product:test',product_generation:'gen:1',source_currentness:'HEX_PARTIAL_CURRENTNESS',missing_punchcards:[{cell_id:'A10',punchcard_ref:'pc:A10',punchcard_generation:'G1',state:'WAIT'}]}],
  missing_punchcards:[{product_ref:'product:test',cell_id:'A10',punchcard_ref:'pc:A10',punchcard_generation:'G1',state:'WAIT'}]
}),{subject_ref:'product:test',subject_generation:'gen:1'});
assert.equal(partial.state,'HEX_PARTIAL_CURRENTNESS');
assert.equal(partial.missing_punchcards.length,1);
const good=bindHexFloorCurrentness(floor(),{subject_ref:'product:test',subject_generation:'gen:1'});
assert.equal(good.state,'HEX_QUALIFIED_CURRENT');
assert.equal(good.blocker,null);

console.log(JSON.stringify({
  schema:'xiio.sdk.hex-floor-binding-check/v1',
  state:'PASS',
  hostile_count:5,
  false_green:0,
  hard:[
    'HEX_BINDING_ABSENT=>UNVERIFIED',
    'HEX_GENERATION_MISMATCH=>STALE',
    'HEX_AUTHORITY_INFLATION=>UNVERIFIED',
    'HEX_PARTIAL_CURRENTNESS_PRESERVES_MISSING_PUNCHCARDS',
    'HEX_QUALIFIED_CURRENT_REQUIRES_EXACT_BINDING'
  ]
},null,2));
