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

// The actual projection -> serialization -> reopen path must conserve strict JSON.
const projectionInput=()=>({artifact_id:'projection:roundtrip',generation:'G2',
 test_bed_ref:'bed:blank:1',test_bed_generation:'G1',recipe_ref:'recipe:shared',recipe_generation:'R1',
 slots:['PERSPECTIVE','ORTHO_XY','ORTHO_YZ','ORTHO_XZ'].map(id=>({id,role:'VIEW',camera:{zoom:1}}))});
let nonJsonRefusals=0;
for(const value of [NaN,Infinity,-Infinity,undefined,()=>1,1n,new Date(0),new Map(),Symbol('x')]){
 const input=projectionInput();input.slots[0].camera.zoom=value;
 assert.throws(()=>compileBlankTestProjection(input),/SEMANTIC_NON_JSON/);nonJsonRefusals++;
 const forged=structuredClone(projection);forged.slots[0].camera.zoom=value;
 assert.throws(()=>serializeTestArtifact(forged),/SEMANTIC_NON_JSON/);nonJsonRefusals++;
}
const sparse=projectionInput();sparse.slots[0].camera.points=new Array(1);
assert.throws(()=>compileBlankTestProjection(sparse),/SEMANTIC_SPARSE_ARRAY/);
const cycle=projectionInput();cycle.slots[0].camera.self=cycle;
assert.throws(()=>compileBlankTestProjection(cycle),/SEMANTIC_NON_JSON_CYCLE/);
// Snapshot once before secrecy validation. A second getter read must not swap
// a reviewed clean camera for a credential-containing one.
let reads=0;const changing=projectionInput();
Object.defineProperty(changing.slots[0],'camera',{enumerable:true,get(){reads++;return reads===1?{zoom:2}:{access_token:'synthetic-never-store'};}});
const snapshot=compileBlankTestProjection(changing);
assert.equal(reads,1);assert.deepEqual(snapshot.slots[0].camera,{zoom:2});
assert.deepEqual(parseTestArtifact(serializeTestArtifact(snapshot)),snapshot);
const secret=projectionInput();Object.defineProperty(secret.slots[0],'camera',{enumerable:true,get(){return {access_token:'synthetic-refuse'};}});
assert.throws(()=>compileBlankTestProjection(secret),/cannot contain access_token/);
const valid=projectionInput();valid.slots[0].camera={zoom:0,enabled:false,background:null,points:[1,2]};
const validProjection=compileBlankTestProjection(valid);
assert.deepEqual(parseTestArtifact(serializeTestArtifact(validProjection)),validProjection);
assert.equal(valid.slots[0].camera.zoom,0);assert.equal(Object.isFrozen(valid),false);
assert.equal(validProjection.authority.effect_authority,false);
console.log(JSON.stringify({status:'PASS',non_json_refusals:nonJsonRefusals,sparse_cycle_refusals:2,accessor_reads:reads,private_payload_refused:true,exact_projection_reopen:true}));

// The test-projection primitive is also a browser consumer. Link and evaluate
// its actual transitive graph without Node builtins or external modules.
const {execFileSync}=await import('node:child_process');
execFileSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',`
 import assert from 'node:assert/strict';
 import {readFileSync} from 'node:fs';
 import vm from 'node:vm';
 const context=vm.createContext({});const modules=new Map();
 async function load(url){
  if(modules.has(url))return modules.get(url);
  const module=new vm.SourceTextModule(readFileSync(new URL(url),'utf8'),{context,identifier:url});
  modules.set(url,module);
  await module.link((specifier,parent)=>{
   if(!specifier.startsWith('.'))throw new Error('BROWSER_UNSUPPORTED_IMPORT:'+specifier);
   return load(new URL(specifier,parent.identifier).href);
  });return module;
 }
 const module=await load(${JSON.stringify(new URL('../src/artifacts/test-artifacts.mjs',import.meta.url).href)});
 await module.evaluate();
 const bed=module.namespace.compileBlankTestBed(vm.runInContext("({artifact_id:'browser:bed',generation:'G1'})",context));
 assert.equal(module.namespace.parseTestArtifact(module.namespace.serializeTestArtifact(bed)).artifact_id,'browser:bed');
`],{stdio:'pipe'});
console.log('TEST_ARTIFACT_BROWSER_GRAPH_PASS');
