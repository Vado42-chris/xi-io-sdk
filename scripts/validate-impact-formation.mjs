#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileImpactFormation } from '../src/ibal/impact-formation.mjs';

const node = (ref, overrides={}) => ({
  ref, direction:'CURRENT', state:'AFFECTED', currentness:'CURRENT', priority:'P1',
  risk:1, user_impact:1, time_pressure:1, fanout:1, cognitive_load:1,
  human_facing:true, independent_review_required:false, ux_review_required:false,
  parallel_safe:true, runnable:true, dependencies:[], ...overrides
});
const base = () => ({schema:'xiio.sdk.impact-formation/v1', root:{root_ref:'root:G194',generation:'g1',golden_priority_ref:'golden:1',formation_profile_ref:'formation:TRINITY_V1'}, nodes:[node('repo:a')]});
const test=(name,fn)=>{fn(); console.log('PASS '+name)};

test('semantic cube is 27',()=>assert.equal(compileImpactFormation(base()).semantic_cube.denominator,27));
test('affected current human node gets trinity seats',()=>{const r=compileImpactFormation(base()); assert.deepEqual(r.plans[0].roles,['EXECUTE_RESOLVE','DISCOVER_HOSTILE','UX_QUAL_QUANT']); assert.equal(r.requested_role_seats,3)});
test('NO_EFFECT creates zero detonations',()=>{const i=base();i.nodes=[node('repo:a',{state:'NO_EFFECT'})];const r=compileImpactFormation(i);assert.equal(r.detonation_denominator,0)});
test('stale node becomes rebase readback',()=>{const i=base();i.nodes=[node('repo:a',{currentness:'STALE'})];const r=compileImpactFormation(i);assert.equal(r.plans[0].operation,'REBASE_READBACK');assert(r.plans[0].blockers.includes('CURRENTNESS_NOT_CURRENT'))});
test('unknown affectedness fails closed',()=>{const i=base();i.nodes=[node('repo:a',{state:'UNKNOWN'})];const r=compileImpactFormation(i);assert.equal(r.plans[0].operation,'CLASSIFY_AFFECTEDNESS')});
test('independent review raises distinct principal floor',()=>{const i=base();i.nodes=[node('repo:a',{independent_review_required:true})];const r=compileImpactFormation(i);assert.equal(r.plans[0].minimum_distinct_principals,2)});
test('capacity constrains principals but not denominator',()=>{const i=base();i.capacity={max_principals:1};i.nodes=[node('repo:a'),node('repo:b')];const r=compileImpactFormation(i);assert.equal(r.capacity_state,'CONSTRAINED');assert.equal(r.recommended_immediate_principals,1);assert(r.minimum_distinct_principals>1)});
test('upstream sorts before downstream',()=>{const i=base();i.nodes=[node('repo:down',{direction:'DOWNSTREAM',priority:'P0'}),node('repo:up',{direction:'UPSTREAM',priority:'P4'})];const r=compileImpactFormation(i);assert.equal(r.detonations[0].target_ref,'repo:up')});
test('higher pressure sorts first inside wave',()=>{const i=base();i.nodes=[node('repo:a',{user_impact:0}),node('repo:b',{priority:'P0',risk:4,user_impact:4,time_pressure:4,fanout:4,cognitive_load:4})];const r=compileImpactFormation(i);assert.equal(r.detonations[0].target_ref,'repo:b')});
test('same input produces stable UUIDs',()=>{const a=compileImpactFormation(base()),b=compileImpactFormation(base());assert.deepEqual(a.detonations.map(x=>x.detonation_uuid),b.detonations.map(x=>x.detonation_uuid))});
test('duplicate refs reject',()=>{const i=base();i.nodes=[node('repo:a'),node('repo:a')];assert.throws(()=>compileImpactFormation(i),/duplicate/) });
test('pressure is planning metric not 100',()=>{const r=compileImpactFormation(base());assert(r.hard.includes('PRESSURE_SCORE != COMPLETION_100'));assert.equal(r.authority_granted,false)});
test('unbound worker pool cannot fabricate exact agent count',()=>{const r=compileImpactFormation(base());assert.equal(r.exact_materializable_principal_count,null);assert.equal(r.staffing_count_state,'ROLE_SEAT_AND_PRINCIPAL_FLOOR_ONLY')});
console.log('IMPACT_FORMATION_PASS 13/13');
