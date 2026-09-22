import assert from 'node:assert/strict';
import {ACK_KERNELS,compileRotfToRotflPromotion} from '../src/acks/rotf-to-rotfl-promotion.mjs';

const pass=(ref)=>({state:'PASS',evidence_refs:[ref]});
function good(){
  return {
    generation:'g1',
    root_ref:'root:search',
    work_ref:'work:search',
    rotf_ref:'rotf:search:g1',
    seam_ref:'seam:rope-edge:search',
    even_pair:{nozzles:[
      {id:'nozzle:time-money',role:'TIME_MONEY',bound:true,evidence_refs:['meter:walltime','rate:synthetic'],metric_value:'time=$',interpretation:'Economic force nozzle, not billing authority'},
      {id:'nozzle:talk-action',role:'TALK_ACTION',bound:true,evidence_refs:['meter:talk-action'],metric_value:9,interpretation:'Owner-defined talk/action force nozzle; distinct from TALK_ACTION_ZERO pass bit'},
    ]},
    validation_nozzle:{id:'nozzle:validation',role:'VALIDATION',...pass('validation:receipt')},
    seam_roundtrip:{forward:pass('seam:forward'),reverse:pass('seam:reverse')},
    boring:{
      owner_restatement_count:0,
      manual_routing_count:0,
      ai_reconstruction_count:0,
      chat_replay_required:false,
      silent_remainder:0,
      current_generation:true,
      return_apply_reap_complete:true,
      repeatable_without_research:true,
      evidence_refs:['boring:receipt'],
    },
    ack_kernels:ACK_KERNELS.map(id=>({kernel_id:id,...pass('ack:'+id)})),
  };
}
const clean=compileRotfToRotflPromotion(good());
assert.equal(clean.rotfl,true);
assert.equal(clean.stage,'ROTFL');
assert.equal(clean.even_pair.denominator,2);
assert.equal(clean.validation_trinity.denominator,3);
assert.equal(clean.ack_kernel_denominator.denominator,6);
assert.equal(clean.ack_kernel_denominator.pass,6);

const mutations=[
  x=>{x.even_pair.nozzles[0].bound=false;},
  x=>{x.even_pair.nozzles[1].evidence_refs=[];},
  x=>{x.validation_nozzle={id:'nozzle:validation',role:'VALIDATION',state:'WAIT',evidence_refs:[],wake:'needs validator'};},
  x=>{x.seam_roundtrip.reverse={state:'WAIT',evidence_refs:[],wake:'reverse open'};},
  x=>{x.boring.owner_restatement_count=1;},
  x=>{x.boring.ai_reconstruction_count=1;},
  x=>{x.boring.silent_remainder=1;},
  x=>{x.boring.return_apply_reap_complete=false;},
  x=>{x.ack_kernels=x.ack_kernels.filter(r=>r.kernel_id!=='ROOM_ROTATION');},
  x=>{const r=x.ack_kernels.find(r=>r.kernel_id==='ROTFL_TEMPLATE');r.state='FAIL';},
];

let rejected=0;
for(let i=0;i<200;i++){
  const x=structuredClone(good());
  mutations[i%mutations.length](x);
  let out=null,threw=false;
  try{out=compileRotfToRotflPromotion(x);}catch{threw=true;}
  if(threw||out.rotfl===false)rejected++;
  else throw new Error('FALSE_ROTFL_'+i);
}
assert.equal(rejected,200);

const pairOnly=good();
pairOnly.validation_nozzle={id:'nozzle:validation',role:'VALIDATION',state:'WAIT',evidence_refs:[],wake:'not added'};
assert.equal(compileRotfToRotflPromotion(pairOnly).stage,'ROTF');

console.log(JSON.stringify({
  mode:'ROTF_TO_ROTFL_PROMOTION',
  ack_kernel_denominator:ACK_KERNELS.length,
  even_nozzles:2,
  validation_trinity:3,
  hostile_denominator:200,
  hostile_rejected:200,
  false_green:0,
  clean_stage:'ROTFL',
  result:'PASS',
  effects:0
}));
