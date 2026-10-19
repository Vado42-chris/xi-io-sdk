import assert from 'node:assert/strict';
import {compileDependencyCube} from '../src/graphs/dependency-cube.mjs';
const root={root_ref:'work:55',root_uuid:'root-55',work_uuid:'work-55',generation:'g1',studio_root_ref:'studio:55',golden_priority_ref:'priority:55',formation_profile_ref:'formation:55'};
const edge=(face,id,state='UNKNOWN')=>({edge_id:id,dependency_key:'shared:key',target_ref:'target:one',owner_ref:'sdk:owner',relationship_ref:'rel:'+id,state,currentness:'UNKNOWN',wake:state==='UNKNOWN'?'REVIEW':null,evidence_refs:[],affected_project_refs:['studio:consumer']});
const input={schema:'xiio.sdk.dependency-cube/v1',root,studio_projects:[{project_ref:'studio:consumer',human_facing:true}],internal_edges:[edge('INTERNAL','edge:left')],external_edges:[edge('EXTERNAL','edge:center')],glass_edges:[edge('GLASS','edge:right')]};
const compiled=compileDependencyCube(input);
let checks=0;const check=x=>{assert.ok(x);checks++};
check(compiled.relationships.length===3);
for(const perspective of ['INTERNAL','EXTERNAL','GLASS']){const e=compiled.relationships.find(e=>e.face===perspective);check(e.relationship_ref==='rel:'+({INTERNAL:'edge:left',EXTERNAL:'edge:center',GLASS:'edge:right'}[perspective]));check(e.generation==='g1');check(e.currentness==='UNKNOWN');}
const views=['INTERNAL','EXTERNAL','GLASS'];for(const a of views)for(const b of views)if(a!==b){const ea=compiled.relationships.find(e=>e.face===a),eb=compiled.relationships.find(e=>e.face===b);check(ea.target_ref===eb.target_ref&&ea.affected_project_refs[0]===eb.affected_project_refs[0]);}
check(compiled.studio_projections[0].dependency_edge_ids.length===3);
assert.throws(()=>compileDependencyCube({...input,external_edges:[edge('EXTERNAL','edge:left')]}),/DUPLICATE_EDGE/);checks++;
check(compiled.denominator.edges===3);
console.log(JSON.stringify({schema:'xiio.sdk.relationship-55-hostile/v1',checks,failed:0,views:3,directional_challenges:6,provider_effect:false}));
