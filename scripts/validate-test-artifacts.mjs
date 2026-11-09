import assert from 'node:assert/strict';
import {
  compileBlankTestBed,compileBlankTestProjection,serializeTestArtifact,parseTestArtifact,
  BLANK_TEST_BED_SCHEMA,BLANK_TEST_PROJECTION_SCHEMA
} from '../src/artifacts/test-artifacts.mjs';

const bed=compileBlankTestBed({artifact_id:'bed:blank:1',generation:'G1'});
assert.equal(bed.schema,BLANK_TEST_BED_SCHEMA);
assert.equal(bed.artifact_type,'BLANK_TEST_BED');
assert.deepEqual(bed.state.records,[]);
assert.equal(bed.authority.live_runtime,false);

const projection=compileBlankTestProjection({
  artifact_id:'projection:blank:1',generation:'G1',
  test_bed_ref:bed.artifact_id,test_bed_generation:bed.generation,
  recipe_ref:'publisher:cube:workbench',recipe_generation:'CUBE-G1',
  slots:[
    {id:'PERSPECTIVE',role:'ECOSYSTEM_TOPOLOGY'},
    {id:'ORTHO_XY',role:'ACTORS_PRODUCTS_RESOURCES'},
    {id:'ORTHO_YZ',role:'TIME_EVENTS_HEURISTICS'},
    {id:'ORTHO_XZ',role:'OUTCOMES_UX_ECONOMICS'},
  ],
});
assert.equal(projection.schema,BLANK_TEST_PROJECTION_SCHEMA);
assert.equal(projection.slots.length,4);
assert.equal(projection.authority.source_state,false);

const bedRound=parseTestArtifact(serializeTestArtifact(bed));
const projectionRound=parseTestArtifact(serializeTestArtifact(projection));
assert.deepEqual(bedRound,bed);
assert.deepEqual(projectionRound,projection);

assert.throws(()=>compileBlankTestBed({artifact_id:'x',generation:'G1',raw_user_data:{name:'no'}}),/cannot contain/);
assert.throws(()=>compileBlankTestProjection({
  artifact_id:'x',generation:'G1',test_bed_ref:'b',test_bed_generation:'G1',recipe_ref:'r',recipe_generation:'G1',slots:[]
}),/four-slot denominator/);
assert.throws(()=>parseTestArtifact('{"schema":"unknown"}'),/unsupported/);

const tamperedBed=structuredClone(bed);
tamperedBed.authority.live_runtime=true;
assert.throws(()=>parseTestArtifact(JSON.stringify(tamperedBed)),/NONCANONICAL_TEST_ARTIFACT/);
const tamperedProjection=structuredClone(projection);
tamperedProjection.authority.effect_authority=true;
assert.throws(()=>serializeTestArtifact(tamperedProjection),/NONCANONICAL_TEST_ARTIFACT/);
const populatedBlank=structuredClone(bed);
populatedBlank.state.records.push({content:'not blank'});
assert.throws(()=>parseTestArtifact(JSON.stringify(populatedBlank)),/NONCANONICAL_TEST_ARTIFACT/);
const secretNested=structuredClone(projection);
secretNested.slots[0].camera.access_token='do-not-store';
assert.throws(()=>parseTestArtifact(JSON.stringify(secretNested)),/cannot contain access_token/);
const unknownField=structuredClone(bed);
unknownField.arbitrary=true;
assert.throws(()=>parseTestArtifact(JSON.stringify(unknownField)),/NONCANONICAL_TEST_ARTIFACT/);
console.log('TEST_ARTIFACT_TYPES_PASS bed=1/1 projection=1/1 roundtrip=2/2 hostiles=8/8');
