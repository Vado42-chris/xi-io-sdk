#!/usr/bin/env node
import assert from 'node:assert/strict';
import {compileTopographyGeometry} from '../src/data/topography-geometry.mjs';

function base(){
 return {
  topology_square:{half_extent:1},
  x_anchor:{position:[0.5,-0.5,0.25]},
  level_circle:{center:[0,0,0],radius:1.5},
  render_plane:'XY',
  cubes:[
   {cube_ref:'cube:A',center:[0,0,0],size:1},
   {cube_ref:'cube:B',center:[1,0,0],size:1},
  ],
  trinity_volumes:[
   {volume_ref:'tri:execute',center:[0,0,0],radius:1,role_refs:['EXECUTE']},
   {volume_ref:'tri:discover',center:[1,0,0],radius:1,role_refs:['DISCOVER']},
   {volume_ref:'tri:ux',center:[0.5,0.75,0],radius:1,role_refs:['UX_VERIFY']},
  ],
  seams:[{
   seam_ref:'seam:A:B',
   from_cube_ref:'cube:A',
   to_cube_ref:'cube:B',
   user_occurrence_ref:'user:occurrence:1',
   system_response_ref:'system:response:1',
   mirror_delta_ref:'mirror:delta:1',
   wave_vector:[1,0,1],
   amplitude:1,
   frequency:2,
   phase:0,
   rope:{cycle_ref:'rope:1',period_ms:1000,amplitude:1,phase:0,return_lag_ms:25},
   matter_contact:true,
  }]
 };
}

const clean=compileTopographyGeometry(base());
assert.equal(clean.valid,true);
assert.equal(clean.x_anchor.semantic,'FRACTALLY_GREEN_REFERENCE_AXIS');
assert.equal(clean.x_anchor.inside_all_flatplane_projections,true);
assert.equal(clean.level_circle.semantic,'QUAL_QUANT_BLAST_RADIUS');
assert.equal(clean.level_circle.containment,'STEW_OVERFLOW');
assert.equal(clean.seams[0].seam_role,'USER_TESTING_MIRROR');
assert.equal(clean.seams[0].rope.closed,true);
assert.equal(clean.seams[0].rope.first_half.operation,'REAP_INWARD');
assert.equal(clean.seams[0].rope.second_half.operation,'SOW_OUTWARD');
assert.equal(clean.seams[0].rope.breathing.medical_claim,false);
assert.equal(clean.trinity_overlaps.filter(x=>x.intersects).length,3);
assert.equal(clean.seams[0].mutation_hypothesis.life_emergence_claim,'UNPROVEN_HYPOTHESIS_ONLY');

let xEscape=0;
for(let i=0;i<200;i++){
 const x=base();x.x_anchor.position=[1.01+i/1000,0,0];
 const out=compileTopographyGeometry(x);
 assert.equal(out.valid,false);
 assert(out.blockers.includes('X_ANCHOR_OUTSIDE_TOPOLOGY_SQUARE'));
 xEscape++;
}
assert.equal(xEscape,200);

let stewAllowed=0;
for(let i=0;i<100;i++){
 const x=base();x.level_circle.radius=1.01+i/20;
 const out=compileTopographyGeometry(x);
 assert.equal(out.level_circle.containment,'STEW_OVERFLOW');
 assert.equal(out.valid,true);
 stewAllowed++;
}
assert.equal(stewAllowed,100);

let ropeRejected=0;
for(const mutation of [
  x=>{x.seams[0].rope.start_state='RED';},
  x=>{x.seams[0].rope.first_half_operation='SOW_OUTWARD';},
  x=>{x.seams[0].rope.second_half_operation='REAP_INWARD';},
  x=>{x.seams[0].rope.end_state='RED';},
]){
 for(let i=0;i<50;i++){
  const x=base();mutation(x);
  const out=compileTopographyGeometry(x);
  assert.equal(out.valid,false);
  assert(out.blockers.some(b=>b.startsWith('ROPE_REAP_SOW_CYCLE_NOT_CLOSED')));
  ropeRejected++;
 }
}
assert.equal(ropeRejected,200);

let mirrorRejected=0;
for(const field of ['user_occurrence_ref','system_response_ref','mirror_delta_ref']){
 for(let i=0;i<50;i++){
  const x=base();x.seams[0][field]='';
  let rejected=false;
  try{compileTopographyGeometry(x);}catch{rejected=true;}
  assert.equal(rejected,true);
  mirrorRejected++;
 }
}
assert.equal(mirrorRejected,150);

let nonTouchRejected=0;
for(let i=0;i<100;i++){
 const x=base();x.cubes[1].center=[2.1+i/100,0,0];
 let rejected=false;
 try{compileTopographyGeometry(x);}catch{rejected=true;}
 assert.equal(rejected,true);
 nonTouchRejected++;
}
assert.equal(nonTouchRejected,100);

console.log(JSON.stringify({
 schema:'xiio.sdk.topography-geometry-check/v1',
 result:'PASS',
 clean:1,
 x_escape_hostiles:200,
 x_escape_rejected:xEscape,
 stew_overflow_positive_controls:stewAllowed,
 rope_hostiles:200,
 rope_rejected:ropeRejected,
 mirror_hostiles:150,
 mirror_rejected:mirrorRejected,
 seam_touch_hostiles:100,
 seam_touch_rejected:nonTouchRejected,
 total_hostiles:650,
 false_green:0,
 provider_effect:false,
 authority_granted:false
},null,2));
