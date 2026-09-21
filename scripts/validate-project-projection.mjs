import assert from 'node:assert/strict';
import {compileProjectProjection,PROJECT_PROJECTION_INPUT_SCHEMA} from '../src/projections/project-projection.mjs';

const ROOT='5267f93e-2af8-57c8-975d-21fcbf77683e';
const WORK='d4a4906a-80ec-54ed-aeb1-364154a486a9';
const states=['PASS','PASS','PASS','WAIT','FAIL','UNKNOWN','N_A_WITH_EVIDENCE'];
function cell(i){
  const state=states[i%states.length];
  return {
    id:'C'+String(i+1).padStart(3,'0'),
    state,
    evidence_refs:['evidence:cell:'+i],
    wake:['WAIT','UNKNOWN'].includes(state)?'wake:cell:'+i:null,
    semantic_ref:'semantic:cell:'+i,
    value:{ordinal:i,truth:'opaque-'+i}
  };
}
function good(){
  return {
    schema:PROJECT_PROJECTION_INPUT_SCHEMA,
    project_ref:'xiio:search',
    root_uuid:ROOT,
    work_uuid:WORK,
    generation:'SEARCH-G1',
    sdk_generation:'SDK-G1',
    canonical_cells:Array.from({length:100},(_,i)=>cell(i)),
    algorithm_stack:[
      {algorithm_ref:'@xi-io/sdk/projections/project-projection',generation:'SDK-G1',current:true,qualified:true},
      {algorithm_ref:'@xi-io/sdk/projections/x42-coordinate',generation:'SDK-G1',current:true,qualified:true},
      {algorithm_ref:'@xi-io/sdk/render',generation:'SDK-G1',current:true,qualified:true},
    ],
    scales:[1,10,100,1000],
    targets:[
      {target_id:'web',adapter_ref:'adapter:web',mode:'DRAFT',effect_ceiling:'READ_ONLY_PROJECTION',profile_ref:'profile:web'},
      {target_id:'legal',adapter_ref:'adapter:legal',mode:'DRAFT',effect_ceiling:'READ_ONLY_PROJECTION',profile_ref:'profile:legal'},
      {target_id:'cli',adapter_ref:'adapter:cli',mode:'DRAFT',effect_ceiling:'NO_EFFECT',profile_ref:'profile:cli'},
      {target_id:'publisher',adapter_ref:'adapter:publisher',mode:'DRAFT',effect_ceiling:'NO_EFFECT',profile_ref:'profile:publisher'},
      {target_id:'flatpack',adapter_ref:'adapter:flatpack',mode:'DRAFT',effect_ceiling:'NO_EFFECT',profile_ref:'profile:flatpack'},
    ]
  };
}

const base=compileProjectProjection(good());
assert.equal(base.project_is_projection_candidate,true);
assert.equal(base.projection_fidelity_pct,100);
assert.equal(base.known_state_accounting_pct,100);
assert.equal(base.target_projections.length,5);
assert.equal(base.external_truth_verified,false);
for(const target of base.target_projections){
  assert.equal(target.canonical_digest,base.canonical_digest);
  assert.equal(target.canonical_cell_denominator,100);
  assert.equal(target.projection_fidelity_pct,100);
  assert.equal(target.deploy_authorized,false);
  for(const scale of target.scale_projections){
    assert.equal(scale.unique_projected_cell_ref_denominator,100);
    assert.equal(scale.coverage_pct,100);
    assert.deepEqual(scale.state_counts,base.state_counts);
  }
}
assert.equal(base.target_projections[0].scale_projections.find(x=>x.scale===1).group_count,100);
assert.equal(base.target_projections[0].scale_projections.find(x=>x.scale===10).group_count,10);
assert.equal(base.target_projections[0].scale_projections.find(x=>x.scale===100).group_count,1);
assert.equal(base.target_projections[0].scale_projections.find(x=>x.scale===1000).group_count,1);

{
  const a=good();
  a.targets.reverse();
  const reversed=compileProjectProjection(a);
  assert.equal(reversed.canonical_digest,base.canonical_digest);
  assert.deepEqual(reversed.state_counts,base.state_counts);
}
{
  const a=good();
  const out=compileProjectProjection(a);
  a.canonical_cells[0].value.truth='mutated';
  assert.notEqual(out.canonical_cells[0].value.truth,'mutated');
}

const mutators=[
  x=>{x.canonical_cells[1].id=x.canonical_cells[0].id;},
  x=>{const p=x.canonical_cells.find(c=>c.state==='PASS');p.evidence_refs=[];},
  x=>{const w=x.canonical_cells.find(c=>c.state==='WAIT');w.wake=null;},
  x=>{const u=x.canonical_cells.find(c=>c.state==='UNKNOWN');u.wake=null;},
  x=>{x.targets[0].mode='LIVE';},
  x=>{x.targets[0].effect_ceiling='EXTERNAL_EFFECT';},
  x=>{x.targets[0].target_metadata={canonical_digest:'evil'};},
  x=>{x.algorithm_stack[0].current=false;},
  x=>{x.algorithm_stack[0].qualified=false;},
  x=>{x.root_uuid='not-a-uuid';},
];

let rejected=0;
for(let i=0;i<1000;i++){
  const x=structuredClone(good());
  mutators[i%mutators.length](x);
  let failed=false;
  try{compileProjectProjection(x);}catch{failed=true;}
  assert.equal(failed,true,'hostile '+i+' must reject');
  rejected++;
}
assert.equal(rejected,1000);

let positive=0;
for(let i=0;i<500;i++){
  const x=good();
  const rotate=i%x.targets.length;
  x.targets=[...x.targets.slice(rotate),...x.targets.slice(0,rotate)];
  x.scales=[1,2+(i%9),10,25,100,1000];
  const out=compileProjectProjection(x);
  assert.equal(out.canonical_digest,base.canonical_digest);
  assert.equal(out.projection_fidelity_pct,100);
  assert.equal(out.target_projections.every(t=>t.scale_projections.every(s=>s.coverage_pct===100)),true);
  positive++;
}
assert.equal(positive,500);

console.log(JSON.stringify({
  schema:'xiio.sdk.project-projection-check/v1',
  result:'PASS',
  canonical_cells:100,
  targets:5,
  fixed_scales:[1,10,100,1000],
  positive_projection_runs:500,
  hostile_denominator:1000,
  hostile_rejected:1000,
  false_green:0,
  projection_fidelity_pct:100,
  external_truth_verified:false,
  authority_granted:false
},null,2));
