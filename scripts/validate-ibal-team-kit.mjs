import assert from 'node:assert/strict';
import {compileIbalTeamKit,compileIbalTenReducer,IBAL_TEAM_ROLES,FIVE_LAYERS} from '../src/ibal/team-kit.mjs';

function goodKit(role='EXECUTE_RESOLVE'){
  return {
    team_ref:'simteam:search:ten01',
    generation:'SEARCH_100S_G1',
    parent_root_ref:'SEARCH_GLOBAL_PRIORITY_G1',
    partition_ref:'TEN-01',
    role,
    progress_role:'LIGHT_CANARY',
    skill_refs:['framework:skills/run-rotfl-atomic-gate/SKILL.md'],
    script_refs:['framework:scripts/validate-rotfl-atomic-gate-cube-1s.mjs'],
    flatpack_template_ref:'sdk:flatpack/primitives',
    hot_folder_ref:'framework:standards/preflight/trinity-metered-hotpatch.v1.json',
    ack_template_refs:['sdk:acks/rotfl-template'],
    return_target_ref:'search:SEARCH_GLOBAL_PRIORITY_G1',
    effect_ceiling:0,
  };
}
function goodTen(){
  return {
    ten_ref:'TEN-01',
    generation:'SEARCH_100S_G1',
    children:Array.from({length:10},(_,i)=>({child_ref:'TIC-'+String(i+1).padStart(2,'0')})),
    layers:Object.fromEntries(FIVE_LAYERS.map((layer)=>[layer,{state:'PASS',reap_ref:'reap:'+layer,sow_ref:'sow:'+layer,evidence_refs:['evidence:'+layer]}])),
    pressure:{baseline_latency_ms:10,observed_latency_ms:15,latency_budget_ms:10,stack_weight:50,stack_weight_budget:100,team_branch_count:3,team_branch_budget:6},
    result_ref:'result:ten01',return_ref:'return:ten01',apply_return_ref:'apply:ten01',readback_ref:'readback:ten01',reap_ref:'reap:ten01'
  };
}

for(const role of IBAL_TEAM_ROLES) assert.equal(compileIbalTeamKit(goodKit(role)).kit_complete,true);
assert.equal(compileIbalTenReducer(goodTen()).collapse_to_1,true);

const mutations=[
  x=>{x.skill_refs=[];},
  x=>{x.script_refs=[];},
  x=>{x.flatpack_template_ref='';},
  x=>{x.hot_folder_ref='';},
  x=>{x.ack_template_refs=[];},
  x=>{x.return_target_ref='';},
  x=>{x.effect_ceiling=1;},
];
let kitRejected=0;
for(let i=0;i<100;i++){
  const x=structuredClone(goodKit(IBAL_TEAM_ROLES[i%IBAL_TEAM_ROLES.length]));
  mutations[i%mutations.length](x);
  try{compileIbalTeamKit(x);}catch{kitRejected++;}
}
assert.equal(kitRejected,100);

let tenRejected=0;
for(let i=0;i<100;i++){
  const x=structuredClone(goodTen());
  switch(i%10){
    case 0:x.children.pop();break;
    case 1:x.children[9].child_ref=x.children[0].child_ref;break;
    case 2:x.layers.MICRO.state='FAIL';break;
    case 3:x.layers.MESO.reap_ref=null;break;
    case 4:x.layers.MACRO.sow_ref=null;break;
    case 5:x.layers.MEGA.evidence_refs=[];break;
    case 6:x.layers.META.state='UNKNOWN';break;
    case 7:x.pressure.observed_latency_ms=40;break;
    case 8:x.pressure.stack_weight=101;break;
    case 9:x.pressure.team_branch_count=7;break;
  }
  try{
    const out=compileIbalTenReducer(x);
    if(out.collapse_to_1===false) tenRejected++;
  }catch{tenRejected++;}
}
assert.equal(tenRejected,100);

console.log(JSON.stringify({
  schema:'xiio.sdk.ibal-team-kit-validation/v1',
  roles:IBAL_TEAM_ROLES.length,
  kit_hostile_denominator:100,
  kit_hostile_rejected:kitRejected,
  ten_hostile_denominator:100,
  ten_hostile_rejected:tenRejected,
  false_green:0,
  result:'PASS',
  effects:0
},null,2));
