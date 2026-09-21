import assert from 'node:assert/strict';
import {compileDependencyCube,dependencyEdgesFromGlassBox} from '../src/graphs/dependency-cube.mjs';

const glass={
 schema:'xiio.api-glass-box.response-envelope/v1',
 request_id:'req-1',
 verification_state:'SUPPLIED_UNVERIFIED_LOCAL_READBACK',
 evidence_refs:['cli:xi-io:doctor'],
 receipt_refs:['local-truth:aries:t1'],
 semantic_projection:{currentness_credit:0},
 data:{gates:{local_cli_reachable:'PASS',ollama_reachable:'PASS',source_head_readback:'PASS',live_promotion_allowed:'FAIL'}}
};
const glassEdges=dependencyEdgesFromGlassBox(glass,{affected_project_refs:['proj:search','proj:sam_law']});
assert.equal(glassEdges.length,4);
assert(glassEdges.every(e=>e.currentness==='UNKNOWN'));
assert.equal(glassEdges.find(e=>e.edge_id==='glass:live_promotion_allowed').state,'FAIL');

// UNVERIFIED_SUBSTRING_HOSTILE: "UNVERIFIED" contains "VERIFIED" but must never earn currentness.
{
 const hostile={...glass,verification_state:'SUPPLIED_UNVERIFIED_LOCAL_READBACK',semantic_projection:{currentness_credit:0}};
 const edges=dependencyEdgesFromGlassBox(hostile,{affected_project_refs:['proj:search']});
 assert(edges.every(e=>e.currentness==='UNKNOWN'));
}
{
 const verified={...glass,verification_state:'VERIFIED_CURRENT',semantic_projection:{currentness_credit:0}};
 const edges=dependencyEdgesFromGlassBox(verified,{affected_project_refs:['proj:search']});
 assert(edges.every(e=>e.currentness==='CURRENT'));
}

function base(){
 return {
  schema:'xiio.sdk.dependency-cube/v1',
  root:{
   root_ref:'search:root',
   root_uuid:'5267f93e-2af8-57c8-975d-21fcbf77683e',
   work_uuid:'d4a4906a-80ec-54ed-aeb1-364154a486a9',
   generation:'G1',
   studio_root_ref:'studio:SEARCH_GLOBAL_PRIORITY_G1',
   golden_priority_ref:'golden:search',
   formation_profile_ref:'formation:trinity',
   capacity:{max_principals:9}
  },
  studio_projects:[
   {project_ref:'proj:search',priority:'P0',human_facing:true,independent_review_required:true},
   {project_ref:'proj:sam_law',priority:'P0',human_facing:true,independent_review_required:true},
   {project_ref:'proj:publisher',priority:'P2',human_facing:true}
  ],
  internal_edges:[
   {edge_id:'int:crm',dependency_key:'crm.current',target_ref:'crm:current',owner_ref:'Inbox_CRM',state:'PASS',currentness:'CURRENT',evidence_refs:['receipt:crm'],affected_project_refs:['proj:search','proj:sam_law']},
   {edge_id:'int:sdk',dependency_key:'sdk.cli',target_ref:'sdk:cli',owner_ref:'SDK',state:'PASS',currentness:'CURRENT',evidence_refs:['receipt:sdk'],affected_project_refs:['proj:search','proj:publisher']}
  ],
  external_edges:[
   {edge_id:'ext:web',dependency_key:'provider.web',target_ref:'provider:web',owner_ref:'SearchProvider',state:'TRUE_WAIT',currentness:'UNKNOWN',evidence_refs:[],wake:'BIND_WEB_PROVIDER',affected_project_refs:['proj:search']},
   {edge_id:'ext:canlii',dependency_key:'provider.canlii',target_ref:'provider:canlii',owner_ref:'Plugins',state:'TRUE_WAIT',currentness:'UNKNOWN',evidence_refs:[],wake:'BUILD_CANLII_ADAPTER',affected_project_refs:['proj:sam_law']}
  ],
  glass_edges:glassEdges
 };
}
const clean=compileDependencyCube(base());
assert.equal(clean.denominator.edges,8);
assert.equal(clean.denominator.projects,3);
assert.equal(clean.faces.INTERNAL.state,'PASS');
assert.equal(clean.faces.EXTERNAL.state,'TRUE_WAIT');
assert.equal(clean.faces.GLASS.state,'FAIL');
assert.equal(clean.box_closed,false);
assert.equal(clean.studio_projections.length,3);
assert(clean.ibal_impact_projection.detonations.length>0);
assert.equal(clean.effect_authority,0);

let rejected=0;
const states=['FAIL','UNKNOWN','TRUE_WAIT'];
for(let i=0;i<300;i++){
 const x=base();
 const family=i%3;
 const idx=i%2;
 if(family===0){
  const e=x.internal_edges[idx];
  e.state=states[Math.floor(i/6)%states.length];
  if(e.state==='PASS') e.evidence_refs=['receipt'];
  if(e.state==='UNKNOWN'||e.state==='TRUE_WAIT') e.wake='wake:'+e.edge_id;
 } else if(family===1){
  const e=x.external_edges[idx];
  e.state=states[Math.floor(i/6)%states.length];
  if(e.state==='UNKNOWN'||e.state==='TRUE_WAIT') e.wake='wake:'+e.edge_id;
 } else {
  const e=x.glass_edges[idx];
  e.state=states[Math.floor(i/6)%states.length];
  if(e.state==='UNKNOWN'||e.state==='TRUE_WAIT') e.wake='wake:'+e.edge_id;
 }
 const out=compileDependencyCube(x);
 assert.equal(out.box_closed,false);
 rejected++;
}
assert.equal(rejected,300);

{
 const x=base();
 x.external_edges=x.external_edges.map(e=>({...e,state:'PASS',currentness:'CURRENT',evidence_refs:['receipt:'+e.edge_id],wake:null}));
 x.glass_edges=x.glass_edges.map(e=>({...e,state:'PASS',currentness:'CURRENT',evidence_refs:['receipt:'+e.edge_id],wake:null}));
 const out=compileDependencyCube(x);
 assert.equal(out.faces.INTERNAL.state,'PASS');
 assert.equal(out.faces.EXTERNAL.state,'PASS');
 assert.equal(out.faces.GLASS.state,'PASS');
 assert.equal(out.box_closed,true);
}

console.log(JSON.stringify({
 schema:'xiio.sdk.dependency-cube-check/v1',
 result:'PASS',
 faces:3,
 hostile_denominator:300,
 hostile_rejected:rejected,
 false_green:0,
 ibal_impact_projection:true,
 studio_project_projections:true,
 effect_authority:0
}));
