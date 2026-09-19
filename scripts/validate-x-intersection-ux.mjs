import assert from 'node:assert/strict';
import {compileXIntersectionUx, X_INTERSECTION_INPUT_SCHEMA} from '../src/evaluation/x-intersection-ux.mjs';

const base=()=>({
  schema:X_INTERSECTION_INPUT_SCHEMA,
  root_ref:'root:sam_law',
  source_generation:'g1',
  intersection_ref:'x:1',
  deadline_ref:'deadline:1',
  priority_order:['deadline','truth','cost'],
  golden:{bound_bit:1},
  sub:{bound_bit:1},
  timeline:{bound_bit:1,priority_bound_bit:1,deadline_coordinate_bound_bit:1},
  flatplane:{floor_bound_bit:1,mid_bound_bit:1,top_bound_bit:1,top_derived_symmetrically_bit:1},
  rotation:{sectors_total:100,sectors_accounted:100,duplicate_sectors:0},
  projects:[
    {project_ref:'studio:p1',project_generation:'g1',state:'NO_EFFECT',sdk_ack_ref:null,evidence_refs:['e:p1'],help_offered_bit:0,help_disposition_ref:null,result_ref:null,return_ref:null,apply_return_ref:null},
    {project_ref:'studio:p2',project_generation:'g1',state:'AFFECTED',sdk_ack_ref:'ack:p2',evidence_refs:['e:p2'],help_offered_bit:1,help_disposition_ref:'help:p2',result_ref:'result:p2',return_ref:'return:p2',apply_return_ref:'apply:p2'}
  ]
});

let pass=0;
const ok=compileXIntersectionUx(base());
assert.equal(ok.intersection_complete,true); assert.equal(ok.patch_candidate,true); assert.equal(ok.revision_current,false); pass++;

const missTimeline=base(); missTimeline.timeline.bound_bit=0;
assert.equal(compileXIntersectionUx(missTimeline).intersection_complete,false); pass++;

const missTop=base(); missTop.flatplane.top_bound_bit=0;
assert(compileXIntersectionUx(missTop).blockers.includes('FLATPLANE_PLANE_MISSING')); pass++;

const badTop=base(); badTop.flatplane.top_derived_symmetrically_bit=0;
assert(compileXIntersectionUx(badTop).blockers.includes('TOP_NOT_DERIVED_SYMMETRICALLY')); pass++;

const missingSector=base(); missingSector.rotation.sectors_accounted=99;
assert(compileXIntersectionUx(missingSector).blockers.includes('ROTATION_DENOMINATOR_INCOMPLETE')); pass++;

const duplicateSector=base(); duplicateSector.rotation.duplicate_sectors=1;
assert(compileXIntersectionUx(duplicateSector).blockers.includes('ROTATION_DUPLICATE_SECTORS')); pass++;

const unknown=base(); unknown.projects[0].state='UNKNOWN'; unknown.projects[0].evidence_refs=[];
assert(compileXIntersectionUx(unknown).blockers.includes('PROJECT_INTERSECTION_UNKNOWN')); pass++;

const ignoredHelp=base(); ignoredHelp.projects[1].help_disposition_ref=null;
assert(compileXIntersectionUx(ignoredHelp).blockers.includes('PROJECT_INTERSECTION_DISPOSITION_INCOMPLETE')); pass++;

const noAck=base(); noAck.projects[1].sdk_ack_ref=null;
assert(compileXIntersectionUx(noAck).blockers.includes('PROJECT_INTERSECTION_DISPOSITION_INCOMPLETE')); pass++;

const noReturn=base(); noReturn.projects[1].return_ref=null;
assert(compileXIntersectionUx(noReturn).blockers.includes('PROJECT_INTERSECTION_DISPOSITION_INCOMPLETE')); pass++;

console.log('X_INTERSECTION_UX PASS cases='+pass+' authority=0 effects=0 patch_candidate_only=true');
