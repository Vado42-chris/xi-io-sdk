#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  WORK_STATES,SCALE_STATES,SPINS,
  CubeCoordinate,SpinSet,LogicGateDetonation,FlatplaneCube,FlatpackPatch,
  BlastwaveImpact,AftercareCard,ReapDebtMeter,OwnerCogLedger,ProjectionRebaseGate
} from '../src/flatpack/primitives.mjs';

const coord=CubeCoordinate({
  target_ref:'dev.xi-io.net',
  axis_x_work_state:'OUTSIDE_ORIGIN',
  axis_y_role:'SDK/ROTFL+STUDIO',
  axis_z_scale:'MESO',
  spin:'HUMAN_USABLE',
  cell_ref:'S02/MESO'
});
assert.equal(coord.schema,'xiio.sdk.cube-coordinate/v1');
assert.equal(coord.axis_x_work_state,'OUTSIDE_ORIGIN');

const spins=SpinSet({spins:[...SPINS,...SPINS]});
assert.equal(spins.denominator,SPINS.length);
assert.equal(spins.complete,true);

const detonation=LogicGateDetonation({
  target_ref:'cube:dev',
  gates:[
    {gate_id:'SOURCE_GATE',state:'PASS',evidence_ref:'git:sha'},
    {gate_id:'RUNTIME_GATE',state:'FAIL',evidence_ref:'runtime:red',next:'run native preflight'},
    {gate_id:'OUTSIDE_ORIGIN_GATE',state:'TRUE_WAIT',wake:'runtime pass'},
    {gate_id:'HUMAN_USABLE_GATE',state:'UNKNOWN'}
  ],
  effect_ceiling:0
});
assert.deepEqual(detonation.counts,{pass:1,fail:1,unknown:1,true_wait:1});
assert.equal(detonation.state,'FAIL');
assert.equal(detonation.first_red.gate_id,'RUNTIME_GATE');
assert.equal(detonation.runnable_reds.length,1);
assert.equal(detonation.true_waits.length,1);
assert.equal(detonation.unknowns.length,1);
assert.equal(detonation.closure_100,false);

const cube=FlatplaneCube({
  cube_id:'cube:dev',
  owner_goal:'prove dev runtime without owner relay',
  big_ticket_priority:'ROTFL live proof',
  coordinates:[coord],
  spins:[...SPINS],
  gates:[
    {gate_id:'SOURCE_GATE',state:'PASS',evidence_ref:'git:sha'},
    {gate_id:'BUILD_GATE',state:'PASS',evidence_ref:'ci:build'},
    {gate_id:'RUNTIME_GATE',state:'FAIL',evidence_ref:'runtime:red',next:'native attempt'},
    {gate_id:'DOMAIN_GATE',state:'TRUE_WAIT',wake:'runtime pass'},
    {gate_id:'OUTSIDE_ORIGIN_GATE',state:'TRUE_WAIT',wake:'domain pass'},
    {gate_id:'OWNER_USABILITY_GATE',state:'TRUE_WAIT',wake:'outside origin pass'}
  ],
  effect_ceiling:0,
  pass_condition:'all current faces pass'
});
assert.equal(cube.first_red.gate_id,'RUNTIME_GATE');
assert(cube.hard.includes('SOURCE!=BUILD'));
assert(cube.hard.includes('OUTSIDE_ORIGIN!=HUMAN_USABLE'));

const patch=FlatpackPatch({
  patch_id:'patch:dev',
  patch_owner:'ibal',
  target_red:'runtime not live',
  affected_flatplane_cube:'cube:dev',
  patch_contents:{source_mutation:'none',runtime_mutation:'native preflight'},
  preflight_gates:[
    {gate_id:'CURRENT_SOURCE',state:'PASS',evidence_ref:'studio:current'},
    {gate_id:'LEASE_COLLISION',state:'PASS',evidence_ref:'crm:leases'},
    {gate_id:'REAP_10X',state:'PASS',evidence_ref:'reap:10'}
  ],
  logic_gates:[
    {gate_id:'SOURCE_GATE',state:'PASS',evidence_ref:'git:sha'},
    {gate_id:'RUNTIME_GATE',state:'TRUE_WAIT',wake:'aries actuator'}
  ],
  scale_gates:{'10S':'PASS','100S':'PASS','00S':'PASS',MICRO:'PASS',MESO:'TRUE_WAIT',MACRO:'FAIL',MEGA:'FAIL',META:'FAIL'},
  expected_return:'typed Result/Return',
  apply_return_target:'studio:current',
  readback_target:'dev:outside-origin',
  bins_custody_target:'bins:receipt',
  reap_target:'comment-stew',
  owner_cog_delta:-1,
  pass_condition:'all gates pass',
  fail_condition:'any fail/unknown remains',
  true_wait_condition:'only external/native wake remains',
  effect_ceiling:0
});
assert.equal(patch.detonation_admitted,false);
assert(patch.blocking.length>0);

const blast=BlastwaveImpact({
  patch_id:'patch:dev',
  MICRO:{changed:['S02'],reds_reduced:[],false_greens_blocked:['source=live'],evidence_refs:['r1']},
  MESO:{changed:['HEX'],reds_reduced:[],false_greens_blocked:['hosted=native'],evidence_refs:['r2']},
  MACRO:{changed:['dev proof'],reds_reduced:[],false_greens_blocked:['build=live'],evidence_refs:['r3']},
  MEGA:{changed:['suite release'],reds_reduced:[],false_greens_blocked:['one product=portfolio'],evidence_refs:['r4']},
  META:{changed:['cold start'],reds_reduced:[],false_greens_blocked:['report=closure'],evidence_refs:['r5']},
  reap:['stale comment 1'],
  owner_cog_delta:-5,
  deadline_risk_delta:-1
});
assert.equal(blast.planes.MEGA.changed[0],'suite release');

const after=AftercareCard({
  patch_id:'patch:dev',
  what_changed:'native proof path bound',
  why_it_matters:'source no longer launders runtime',
  what_is_now_safe:'track native materializer',
  what_is_still_red:'outside-origin proof',
  owner_does_not_need_to_do:'reconstruct repo state',
  owner_must_do:'',
  next_machine_action:'consume native Result',
  next_human_action:'',
  time_saved:10,cog_saved:10,harm_reduced:1,trust_impact:0
});
assert.equal(after.next_machine_action,'consume native Result');
assert.equal(after.owner_must_do,null);

const paid=ReapDebtMeter({opened_units:3,reaped_stew:30,ratio:10});
assert.equal(paid.admitted,true);
assert.equal(paid.debt,0);
const debt=ReapDebtMeter({opened_units:2,reaped_stew:19,ratio:10});
assert.equal(debt.admitted,false);
assert.equal(debt.debt,1);

const cog=OwnerCogLedger({tic:1,cog:-20,hope:-100,trust:-5,harm:0});
assert.equal(cog.improved,true);
assert.equal(cog.owner_cog_delta,-20);
const harm=OwnerCogLedger({tic:1,cog:5,hope:0,trust:-1,harm:1});
assert.equal(harm.improved,false);

const rebase=ProjectionRebaseGate({
  current_generation:'g2',
  projections:[
    {projection_ref:'child:current',generation_ref:'g2',state:'ACTIVE'},
    {projection_ref:'child:stale',generation_ref:'g1',state:'ACTIVE'},
    {projection_ref:'child:old-terminal',generation_ref:'g1',state:'REAPED'}
  ]
});
assert.equal(rebase.pass,false);
assert.equal(rebase.blockers.length,1);
assert.equal(rebase.blockers[0].projection_ref,'child:stale');

assert.throws(()=>CubeCoordinate({target_ref:'x',axis_x_work_state:'LIVE',axis_y_role:'SDK',axis_z_scale:'MESO',spin:'OWNER'}),/axis_x_work_state_INVALID/);
assert.throws(()=>LogicGateDetonation({target_ref:'x',gates:[{gate_id:'g',state:'DONE'}]}),/gate_state_INVALID/);

console.log(JSON.stringify({
  status:'PASS',
  primitive_count:10,
  work_states:WORK_STATES.length,
  scale_states:SCALE_STATES.length,
  spins:SPINS.length,
  hostile_guards:[
    'ONE_FACE_FALSE_GREEN',
    'UNKNOWN_PROMOTION',
    'TRUE_WAIT_BLOCKS_SIBLING',
    'STALE_PROJECTION_SURVIVES_PATCH',
    'REAP_DEBT_UNPAID',
    'OWNER_COG_REGRESSION',
    'AFTERCARE_SUMMARY_ONLY'
  ],
  effects:0
}));
