#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileSubmissionPreflight } from '../src/evaluation/submission-preflight.mjs';

const billingMessage = 'The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the Billing & plans section in your settings';
const ack = (state = 'YES') => ({
  schema_version: 'xiio.resource-capability-ack/v1',
  request_id: 'req:local-ack-1', worker_ref: 'worker:ibal-bins', resource_ref: 'resource:studio-monday',
  operation: 'resource.read', lease_ref: 'lease:studio-monday', source_generation: 'generation:studio-monday',
  required_capability: 'resource.read', ack: state,
  reason: state === 'YES' ? 'EXACT_CURRENT_SCOPE_ACKNOWLEDGED' : 'CAPABILITY_NOT_GRANTED',
  attempt_count: 0, attempt_authorized: false, effect_authority: false, provider_effect: false,
  next: state === 'YES' ? 'SWITCHBOARD_ADMISSION_REQUIRED' : 'REPAIR_OR_REBIND_BEFORE_ATTEMPT',
});
const startedObservation = () => ({ provider:'GitHub Actions', operation:'pull_request_checks', conclusion:'success', runner_id:42, steps:[{}] });
const base = (overrides = {}) => ({
  mission_root_ref:'root:studio-monday', generation:'generation:studio-monday', wake_ref:'wake:studio-monday-preflight',
  detonator_ref:'detonator:studio-monday', target_ref:'target:provider-submit', pricing_ref:'pricing:studio-meter-v1', meter_ref:'meter:studio-monday-pass',
  local_ack:ack('YES'), provider_observation:startedObservation(),
  provider_currentness:{state:'CURRENT', readback_ref:'readback:provider-current', admission_ref:'admission:provider-job'}, ...overrides,
});
const billingHold = () => ({provider:'GitHub Actions',operation:'pull_request_checks',conclusion:'failure',runner_id:0,steps:[],provider_message:billingMessage});
const results = [];
function check(name, run) {
  try { run(); results.push({name, state:'PASS'}); }
  catch (error) { results.push({name, state:'FAIL', reason:error.message}); }
}
function noUsage(out) {
  assert.equal(out.meter.local_sim_units, 0);
  assert.equal(out.meter.provider_attempt_units, 0);
  assert.equal(out.meter.prevented_provider_attempt_units, 0);
  assert.equal(out.meter.provider_effect_units, 0);
  assert.equal(out.meter.chargeable_units, 0);
  assert.equal(out.meter.billing_authorized, false);
}

// Preserve all eight routing/ACK cases while correcting the old usage assertion.
check('eligible submission is a plan, not an attempt', () => {
  const out=compileSubmissionPreflight(base());
  assert.equal(out.state,'READY_FOR_PROVIDER_SUBMISSION');
  assert.equal(out.provider.submission_eligible,true);
  assert.equal(out.meter.planned_provider_attempt_units,1);
  assert.equal(out.hotfolder.semantics,'WAKE_ONLY'); assert.equal(out.effects,0); noUsage(out);
});
check('billing failure withholds hosted plan and retains local plan', () => {
  const out=compileSubmissionPreflight(base({provider_observation:billingHold()}));
  assert.equal(out.state,'LOCAL_SIM_READY_PROVIDER_ADMISSION_HOLD');
  assert.equal(out.provider.failure_class,'PROVIDER_ACCOUNT_BILLING_BLOCKED');
  assert.equal(out.provider.submission_eligible,false);
  assert.equal(out.meter.withheld_planned_provider_attempt_units,1);
  assert.equal(out.hotfolder.route,'LOCAL_ACK_SIM_ONLY'); noUsage(out);
});
check('pre-runner failure is not source failure', () => {
  const out=compileSubmissionPreflight(base({provider_observation:{provider:'GitHub Actions',conclusion:'failure',runner_id:0,steps:[]}}));
  assert.equal(out.provider.failure_class,'PROVIDER_RUNNER_START_FAILED'); noUsage(out);
});
check('ACK NO withholds all execution plans', () => {
  const out=compileSubmissionPreflight(base({local_ack:ack('NO')}));
  assert.equal(out.state,'BLOCKED_LOCAL_ACK');
  assert.equal(out.meter.planned_local_sim_units,0);
  assert.equal(out.meter.planned_provider_attempt_units,0); noUsage(out);
});
check('unknown runner remains WAIT', () => {
  const out=compileSubmissionPreflight(base({provider_observation:{}}));
  assert.equal(out.state,'LOCAL_SIM_READY_PROVIDER_START_READBACK_WAIT');
  assert.equal(out.provider.submission_eligible,false); noUsage(out);
});
check('unknown provider currentness remains WAIT', () => {
  const out=compileSubmissionPreflight(base({provider_currentness:{state:'UNKNOWN',readback_ref:null,admission_ref:'admission:provider-job'}}));
  assert.equal(out.state,'LOCAL_SIM_READY_PROVIDER_CURRENTNESS_WAIT'); noUsage(out);
});
check('missing admission remains WAIT', () => {
  const out=compileSubmissionPreflight(base({provider_currentness:{state:'CURRENT',readback_ref:'readback:provider-current',admission_ref:null}}));
  assert.equal(out.state,'LOCAL_SIM_READY_PROVIDER_ADMISSION_WAIT'); noUsage(out);
});
check('ACK with attempt count is rejected', () => {
  assert.throws(()=>compileSubmissionPreflight(base({local_ack:{...ack(),attempt_count:1}})),/LOCAL_ACK_ATTEMPT_MUST_BE_ZERO/);
});

// FIRST10 usage hostiles: no plan, replay or caller value can mint chargeable work.
check('default ACK YES earns zero completed simulations', () => {
  const out=compileSubmissionPreflight(base());
  assert.equal(out.meter.planned_local_sim_units,1); noUsage(out);
});
check('caller-supplied quantities remain planned only', () => {
  const out=compileSubmissionPreflight(base({local_sim_units:42,provider_attempt_units:73}));
  assert.equal(out.meter.planned_local_sim_units,42);
  assert.equal(out.meter.planned_provider_attempt_units,73); noUsage(out);
});
check('100 identical compilations do not mint usage or savings', () => {
  const input=base(); const first=compileSubmissionPreflight(input);
  for(let i=0;i<100;i++){const out=compileSubmissionPreflight(input);noUsage(out);assert.deepEqual(out,first);}
});
check('repeated billing holds do not claim prevented execution savings', () => {
  const input=base({provider_observation:billingHold(),provider_attempt_units:7});
  for(let i=0;i<10;i++){const out=compileSubmissionPreflight(input);assert.equal(out.meter.withheld_planned_provider_attempt_units,7);noUsage(out);}
});
check('old healthy runner does not attest this work execution', () => {
  const out=compileSubmissionPreflight(base({provider_observation:{runner_id:99,steps:[{name:'historic job'}],conclusion:'success'}}));
  noUsage(out); assert.equal(out.effect_authority,false);
});
check('zero plan is accepted without invented minimum usage', () => {
  const out=compileSubmissionPreflight(base({local_sim_units:0,provider_attempt_units:0}));
  assert.equal(out.meter.planned_local_sim_units,0); assert.equal(out.meter.planned_provider_attempt_units,0); noUsage(out);
});
check('negative units are rejected', () => {
  for(const field of ['local_sim_units','provider_attempt_units']) assert.throws(()=>compileSubmissionPreflight(base({[field]:-1})),/UNITS_INVALID/);
});
check('nonfinite and coercible units are rejected', () => {
  for(const field of ['local_sim_units','provider_attempt_units']) for(const value of [NaN,Infinity,'1']) assert.throws(()=>compileSubmissionPreflight(base({[field]:value})),/UNITS_INVALID/);
});
check('metering ABI change is explicit and unverified', () => {
  const out=compileSubmissionPreflight(base());
  assert.equal(out.schema,'xiio.sdk.submission-preflight/v3');
  assert.equal(out.meter.schema,'xiio.sdk.metered-execution/v2');
  assert.equal(out.meter.measurement_basis,'PREFLIGHT_PLAN_ONLY');
  assert.equal(out.meter.measurement_scope,'THIS_COMPILATION_ONLY');
  assert.equal(out.meter.proof_state,'SUPPLIED_UNVERIFIED');
});
check('input preserved and meter frozen without effect authority', () => {
  const input=base(); const before=structuredClone(input); const out=compileSubmissionPreflight(input);
  assert.deepEqual(input,before); assert.ok(Object.isFrozen(out.meter));
  assert.throws(()=>{out.meter.chargeable_units=999;},TypeError);
  assert.equal(out.hotfolder.effects,0); assert.equal(out.hotfolder.effect_authority,false); noUsage(out);
});
const failed=results.filter(row=>row.state==='FAIL');
console.log(JSON.stringify({schema:'xiio.sdk.submission-preflight-check/v3',result:failed.length?'FAIL':'PASS',tests:results.length,passed:results.length-failed.length,failed:failed.length,results,provider_effects:0,live_credit:0},null,2));
if(failed.length) process.exitCode=1;
