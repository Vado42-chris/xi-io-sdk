#!/usr/bin/env node
import assert from 'node:assert/strict';
import {compileQuantumTopographyV2,quantumTopographyV2Catalog} from '../src/data/quantum-topography-v2.mjs';

const catalog=quantumTopographyV2Catalog();
assert.equal(catalog.denominator,32);
assert.equal(catalog.addresses.length,32);
assert.deepEqual(catalog.axes.path,['GOLDEN','SUBTERRANEAN']);
assert.deepEqual(catalog.axes.illumination,['SOLAR','LUNAR']);
assert.deepEqual(catalog.axes.orientation,['HORIZONTAL','VERTICAL']);
assert.deepEqual(catalog.axes.movement,['SOW_OUTWARD','REAP_INWARD']);
assert.deepEqual(catalog.axes.split,['QUAL','QUANT']);
assert.equal(catalog.projection_aliases.X_UP.operation,'REAP_INWARD');
assert.equal(catalog.projection_aliases.X_DOWN.operation,'SOW_OUTWARD');

function goodCell(address){
  const quant=address.split==='QUANT';
  const base=(address.path==='GOLDEN'?10:7)+(address.illumination==='SOLAR'?2:1)+(address.orientation==='HORIZONTAL'?1:0)+(address.movement==='SOW_OUTWARD'?1:0);
  return {
    state:'PASS',
    evidence_refs:['fixture:'+address.id],
    raw_value:quant?base:{path:address.path,illumination:address.illumination,orientation:address.orientation,movement:address.movement},
    unit:quant?'units':null
  };
}
function goodInput(){
  return {
    identity:{root_uuid:'5267f93e-2af8-57c8-975d-21fcbf77683e',work_ref:'work:search:g2',generation:'g2'},
    cells:Object.fromEntries(catalog.addresses.map(a=>[a.id,goodCell(a)])),
    operators:{
      quorum:{profile_id:'FULL_32_DERIVATION_QUORUM_V2',threshold:32,required_address_refs:catalog.addresses.map(a=>a.id)},
      triangulation_x:{
        minimum_distinct_principals:3,
        rays:[
          {principal_ref:'p:execute',address_refs:[catalog.addresses[0].id],evidence_refs:['ray:execute']},
          {principal_ref:'p:discover',address_refs:[catalog.addresses[1].id],evidence_refs:['ray:discover']},
          {principal_ref:'p:ux',address_refs:[catalog.addresses[2].id],evidence_refs:['ray:ux']}
        ]
      }
    },
    research_complete:true,
    return_cycle_complete:true,
    silent_remainder:0
  };
}

const gold=compileQuantumTopographyV2(goodInput());
assert.equal(gold.grade,'GOLD');
assert.equal(gold.census.denominator,32);
assert.equal(gold.census.pass_like,32);
assert.equal(gold.quorum.pass,true);
assert.equal(gold.quorum.full_derivation_profile,true);
assert.equal(gold.triangulation_x.pass,true);
assert.equal(gold.derivation.state,'DERIVATION_READY');
assert.equal(gold.mirrors.path.length,16);
assert.equal(gold.mirrors.illumination.length,16);
assert.equal(gold.mirrors.orientation.length,16);
assert.equal(gold.mirrors.movement.length,16);

for(const [path,illumination] of [
  ['GOLDEN','SOLAR'],['GOLDEN','LUNAR'],['SUBTERRANEAN','SOLAR'],['SUBTERRANEAN','LUNAR']
]) assert(catalog.addresses.some(a=>a.path===path&&a.illumination===illumination),path+'/'+illumination);

{
  const x=goodInput();
  const id=catalog.addresses[0].id;
  x.cells[id]={state:'WAIT',evidence_refs:[],wake:'research:'+id};
  const silver=compileQuantumTopographyV2(x);
  assert.equal(silver.grade,'SILVER');
  assert.equal(silver.derivation.state,'BLOCKED_QUORUM');
  assert.equal(silver.quorum.pass,false);
}

let hostileRejected=0,falseGold=0;
for(let i=0;i<640;i++){
  const x=goodInput();
  const address=catalog.addresses[i%32];
  const family=Math.floor(i/32)%20;
  switch(family){
    case 0:x.cells[address.id]={...goodCell(address),evidence_refs:[]};break;
    case 1:x.cells[address.id]={state:'WAIT',evidence_refs:[],wake:null};break;
    case 2:x.cells[address.id]={state:'UNKNOWN',evidence_refs:[],wake:null};break;
    case 3:x.cells[address.id]={state:'FAIL',evidence_refs:['fail:'+address.id],raw_value:null,unit:null};break;
    case 4:if(address.split==='QUANT')x.cells[address.id]={state:'PASS',evidence_refs:['e'],raw_value:'not-number',unit:'units'};else x.cells[address.id]={state:'PASS',evidence_refs:['e'],raw_value:null};break;
    case 5:x.operators.quorum.threshold=31;break;
    case 6:x.operators.quorum.profile_id='PARTIAL_QUORUM';break;
    case 7:x.operators.triangulation_x.rays=x.operators.triangulation_x.rays.slice(0,2);break;
    case 8:x.operators.triangulation_x.rays[2].principal_ref='p:execute';break;
    case 9:x.operators.triangulation_x.rays[1].evidence_refs=[];break;
    case 10:x.operators.triangulation_x.rays[0].address_refs=['NOT.A.REAL.ADDRESS'];break;
    case 11:x.return_cycle_complete=false;break;
    case 12:x.silent_remainder=1;break;
    case 13:x.research_complete=false;break;
    case 14:delete x.cells[address.id];break;
    case 15:x.cells[address.id]={state:'N_A_WITH_EVIDENCE',evidence_refs:['na:'+address.id],raw_value:null,unit:null};break;
    case 16:x.operators.quorum.required_address_refs=x.operators.quorum.required_address_refs.slice(0,31);x.operators.quorum.threshold=31;break;
    case 17:x.operators.quorum.threshold=0;break;
    case 18:x.operators.triangulation_x.minimum_distinct_principals=4;break;
    case 19:x.silent_remainder=null;break;
  }
  let out=null,threw=false;
  try{out=compileQuantumTopographyV2(x);}catch{threw=true;}
  if(threw||out.grade!=='GOLD')hostileRejected++; else falseGold++;
}
assert.equal(hostileRejected,640);
assert.equal(falseGold,0);

console.log(JSON.stringify({
  schema:'xiio.sdk.quantum-topography-v2-check/v1',
  result:'PASS',
  canonical_address_denominator:32,
  path_mirror_pairs:16,
  illumination_mirror_pairs:16,
  orientation_mirror_pairs:16,
  movement_mirror_pairs:16,
  hostile_denominator:640,
  hostile_rejected:640,
  false_gold:0,
  authority_granted:false,
  provider_effect:false
},null,2));
