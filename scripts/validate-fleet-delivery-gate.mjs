#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileFleetDeliveryGate } from '../src/baseline/fleet-delivery.mjs';

const evidence=(state='FAIL',suffix='x')=>({
  state,
  proof_ref:`proof:${suffix}`,
  five_w_h:{
    who_ref:`who:${suffix}`,what_ref:`what:${suffix}`,where_ref:`where:${suffix}`,
    when_ref:`when:${suffix}`,why_ref:`why:${suffix}`,how_ref:`how:${suffix}`,
  },
  host_abi:{
    host_ref:`host:${suffix}`,subject_ref:`subject:${suffix}`,generation:`gen:${suffix}`,
    receipt_ref:`receipt:${suffix}`,observed_at:'2026-09-09T15:30:00.000Z',evidence_class:'SUPPLIED',
  },
});

const projects=Array.from({length:18},(_,i)=>({
  project_ref:`project:P${String(i+1).padStart(2,'0')}`,
  repo_ref:`repo:P${String(i+1).padStart(2,'0')}`,
  observations:{
    LIVE_BINS_CHECKOUT:evidence(i===0?'BLOCKED':'FAIL',`bins-${i+1}`),
    HEX_LINUX_FLATPAK_EQUIVALENT:evidence(i===1?'WAIT':'FAIL',`hex-${i+1}`),
  },
}));
const red=compileFleetDeliveryGate({source_generation:'fleet-g1',observed_at:'2026-09-09T15:31:00.000Z',projects});
assert.equal(red.schema,'xiio.sdk.fleet-delivery-gate/v1');
assert.equal(red.project_denominator,18);
assert.equal(red.gate_denominator,36);
assert.equal(red.supplied_gate_pass_projects,0);
assert.equal(red.verified_requirements_100_projects,0);
assert.equal(red.projects_not_verified_100,18);
assert.equal(red.verified_truth_percent,0);
assert.equal(red.fleet_requirements_100,false);
assert.equal(red.deploy_eligible,false);
assert.equal(red.game.closure_credit,0);
assert.equal(red.economics.money_delta,'UNMEASURED_NO_VALUE_RATE');

const supplied=compileFleetDeliveryGate({
  source_generation:'fleet-g2',observed_at:'2026-09-09T15:32:00.000Z',
  projects:[{project_ref:'project:all-supplied',observations:{
    LIVE_BINS_CHECKOUT:evidence('PASS','bins-pass'),
    HEX_LINUX_FLATPAK_EQUIVALENT:evidence('PASS','hex-pass'),
  }}],
});
assert.equal(supplied.supplied_gate_pass_projects,1);
assert.equal(supplied.verified_requirements_100_projects,0);
assert.equal(supplied.projects[0].supplied_gate_pass,true);
assert.equal(supplied.projects[0].requirements_100,false);
assert.equal(supplied.projects[0].closure_state,'WAIT_AUTHENTICATED_LIVE_READBACK');
assert.equal(supplied.deploy_eligible,false);

const missing5w=compileFleetDeliveryGate({
  source_generation:'fleet-g3',observed_at:'2026-09-09T15:33:00.000Z',projects:[{
    project_ref:'project:missing-5w',observations:{
      LIVE_BINS_CHECKOUT:{...evidence('PASS','bad5w'),five_w_h:{who_ref:'who'}},
      HEX_LINUX_FLATPAK_EQUIVALENT:evidence('PASS','ok'),
    },
  }],
});
assert.equal(missing5w.projects[0].gates[0].state,'UNKNOWN');
assert.equal(missing5w.projects[0].gates[0].blocker,'PASS_WITHOUT_COMPLETE_5W_H');
assert.equal(missing5w.projects[0].supplied_gate_pass,false);

const missingHost=compileFleetDeliveryGate({
  source_generation:'fleet-g4',observed_at:'2026-09-09T15:34:00.000Z',projects:[{
    project_ref:'project:missing-host',observations:{
      LIVE_BINS_CHECKOUT:{...evidence('PASS','badhost'),host_abi:{host_ref:'host'}},
      HEX_LINUX_FLATPAK_EQUIVALENT:evidence('PASS','ok2'),
    },
  }],
});
assert.equal(missingHost.projects[0].gates[0].state,'UNKNOWN');
assert.equal(missingHost.projects[0].gates[0].blocker,'PASS_WITHOUT_HOST_ABI_COORDINATES');

assert.throws(()=>compileFleetDeliveryGate({source_generation:'g',observed_at:'x',projects:[]}));
assert.throws(()=>compileFleetDeliveryGate({source_generation:'g',observed_at:'x',projects:[{project_ref:'p'},{project_ref:'p'}]}));
console.log('FLEET_DELIVERY_GATE_PASS 18_PROJECT_RED supplied_pass_never_verified 5W_H+HOST_ABI_FAIL_CLOSED deploy=0 money=UNMEASURED');
